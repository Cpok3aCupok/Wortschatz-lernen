// Питання в грі «Кристали»: до трьох спроб, за правильну відповідь — нові ходи.
import { h, deWord, ipaEl, speakBtn, revealCard, shuffle, setKeys, plural } from '../ui.js';
import { settings, record, progOf, isDue, isHard, LEARNED_BOX } from '../store.js';
import * as audio from '../audio.js';
import { check } from '../check.js';
import { pickOptions, listenPrompt, synonymOf } from './common.js';

export const TRIES = 3;
export const moves = n => `${n} ${plural(n, 'хід', 'ходи', 'ходів')}`;

// Частіше питаємо слова з помилками в цій грі, ті, що чекають повторення, важкі, нові й недавні.
function weight(e, missed, recent) {
  if (recent.includes(e.id)) return 0.05;
  const p = progOf(e.id);
  let w = 1;
  if (missed.includes(e.id)) w += 6;
  if (isDue(e)) w += 4;
  if (isHard(e)) w += 3;
  if (!p || p.b === 0) w += 1;
  else if (p.b >= LEARNED_BOX) w *= 0.4;
  if (p && p.s && Date.now() - p.s < 864e5) w += 1.5;
  return w;
}

export function pickWords(list, n, { missed = [], recent = [] } = {}, exclude = new Set()) {
  const pool = list.filter(e => !exclude.has(e.id)).map(e => ({ e, w: weight(e, missed, recent) }));
  const out = [];
  while (out.length < n && pool.length) {
    let r = Math.random() * pool.reduce((s, x) => s + x.w, 0);
    let i = 0;
    while (i < pool.length - 1 && (r -= pool[i].w) > 0) i++;
    out.push(pool.splice(i, 1)[0].e);
  }
  return out;
}

// Ходи за правильну відповідь залежать від складності: level.reward — за 1-шу, 2-гу, 3-тю спробу
// (легка 3/2/1, середня 2/1/1, складна 1/1/1); або випадково від 1 до level.random.
export function rewardFor(r, level) {
  if (!r.ok) return 0;
  if (settings.gemsReward === 'random') return 1 + Math.floor(Math.random() * level.random);
  return level.reward[Math.min(r.tries, TRIES) - 1];
}

// Одне питання: тип чергується (вибір перекладу, навпаки, на слух, артикль, письмо, пари).
// state: { list, missed, recent, lastType, level }. Повертає { ok, tries, reward, words, wrong }.
export async function askOne(root, head, state, ctx) {
  const [e] = pickWords(state.list, 1, state);
  const types = ['de', 'ua', 'listen', 'de', 'ua'];
  if (e.art) types.push('article');
  if (settings.gemsWrite) types.push('write', 'write');
  const others = state.list.length >= 2 ? pairWords(e, state) : [];
  if (others.length >= 1) types.push('pairs', 'pairs');
  const pool = types.filter(t => t !== state.lastType);
  const type = pool[Math.floor(Math.random() * pool.length)];
  state.lastType = type;

  const body = h('div', { class: 'question' });
  root.replaceChildren(head, body);
  document.getElementById('view').scrollTop = 0;
  const r = type === 'pairs' ? await pairsQ(body, shuffle([e, ...others]), ctx)
    : type === 'write' ? await writeQ(body, e, ctx)
    : type === 'article' ? await articleQ(body, e)
    : await choiceQ(body, e, type, state.list);
  r.reward = rewardFor(r, state.level);
  for (const w of r.words) { state.recent.push(w.id); if (state.recent.length > 8) state.recent.shift(); }
  await feedback(body, r, ctx);
  return r;
}

// До 3 інших слів для «пар»: з різними перекладами й написанням.
function pairWords(e, state) {
  const seen = new Set([e.de.toLowerCase(), e.ua.toLowerCase()]);
  const out = [];
  for (const x of pickWords(state.list, 10, state, new Set([e.id]))) {
    const d = x.de.toLowerCase(), u = x.ua.toLowerCase();
    if (seen.has(d) || seen.has(u)) continue;
    seen.add(d); seen.add(u);
    out.push(x);
    if (out.length === 3) break;
  }
  return out;
}

function feedback(body, r, ctx) {
  return new Promise(resolve => {
    let done = false;
    const go = () => { if (done) return; done = true; setKeys(null); resolve(); };
    const title = r.ok
      ? (r.tries === 1 ? (r.words.length > 1 ? 'Без жодної помилки!' : 'Правильно з першої спроби!') : `Правильно, спроба ${r.tries} з ${TRIES}`)
      : (r.words.length > 1 ? 'Забагато помилок' : 'Не вийшло');
    body.append(
      h('div', { class: 'feedback pop ' + (r.ok ? 'ok' : 'bad') },
        h('div', { class: 'fh' }, title),
        h('div', null, r.reward ? `+${moves(r.reward)}` : 'Цього разу без нових ходів')),
      r.words.length === 1 && !(r.ok && r.tries === 1) ? revealCard(r.words[0]) : null,
      h('div', { class: 'actions' }, h('button', { class: 'btn primary block', type: 'button', onclick: go }, 'Далі')));
    setKeys(ev => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); go(); } });
    if (r.ok && r.tries === 1) ctx.later(go, 1100);
  });
}

const left = n => `Залишилось ${plural(n, 'спроба', 'спроби', 'спроб')}: ${n}`;

// Вибір з 4 варіантів. kind: 'de' — переклад німецького слова, 'ua' — навпаки, 'listen' — на слух.
function choiceQ(body, e, kind, list) {
  return new Promise(resolve => {
    const field = kind === 'ua' ? 'de' : 'ua';
    const opts = pickOptions(e, list, field);
    let tries = 0, over = false;
    const prompt = kind === 'listen' ? listenPrompt(e)
      : kind === 'de' ? h('div', { class: 'prompt pop' }, h('div', { class: 'big' + (e.p ? ' phrase' : '') }, deWord(e)), ipaEl(e), speakBtn(e))
      : h('div', { class: 'prompt pop' }, h('div', { class: 'hint' }, 'Оберіть німецькою'), h('div', { class: 'big ua' + (e.p ? ' phrase' : '') }, e.ua));
    const info = h('div', { class: 'small muted center', style: { marginTop: '10px' } }, `Спроб: ${TRIES}`);
    const btns = opts.map((o, i) => h('button', { class: 'option', type: 'button', onclick: () => choose(i) },
      h('span', { class: 'num' }, i + 1), field === 'ua' ? h('span', null, o.ua) : deWord(o)));
    body.append(prompt, h('div', { class: 'options' }, btns), info);
    if (kind === 'listen' || (kind === 'de' && settings.autoplay)) audio.play(e);
    setKeys(ev => { if (ev.key >= '1' && ev.key <= String(opts.length)) choose(Number(ev.key) - 1); });

    function choose(i) {
      if (over || btns[i].disabled) return;
      tries++;
      if (opts[i].id === e.id) { finish(true); return; }
      btns[i].classList.add('wrong');
      btns[i].disabled = true;
      if (tries >= TRIES) { finish(false); return; }
      info.textContent = 'Ні. ' + left(TRIES - tries);
    }
    function finish(ok) {
      over = true;
      setKeys(null);
      info.remove();
      btns.forEach((b, j) => {
        b.disabled = true;
        if (opts[j].id === e.id) b.classList.add('correct');
        else if (!b.classList.contains('wrong')) b.classList.add('dim');
      });
      record(e.id, ok && tries === 1);
      if (kind === 'ua' && settings.autoplay) audio.play(e);
      resolve({ ok, tries, words: [e], wrong: ok && tries === 1 ? [] : [e.id] });
    }
  });
}

// Артикль: дві спроби з трьох варіантів.
function articleQ(body, e) {
  return new Promise(resolve => {
    const max = 2;
    let tries = 0, over = false;
    const info = h('div', { class: 'small muted center', style: { marginTop: '10px' } }, `Спроб: ${max}`);
    const btns = ['der', 'die', 'das'].map(a => h('button', { class: 'art-btn ' + a, type: 'button', onclick: () => choose(a) }, a));
    body.append(
      h('div', { class: 'prompt pop' }, h('div', { class: 'hint' }, 'Який артикль?'), h('div', { class: 'big' }, e.bare), ipaEl(e), h('div', { class: 'muted' }, e.ua)),
      h('div', { class: 'art-btns' }, btns), info);
    setKeys(ev => { const a = { 1: 'der', 2: 'die', 3: 'das' }[ev.key]; if (a) choose(a); });

    function choose(a) {
      const b = btns.find(x => x.textContent === a);
      if (over || b.disabled) return;
      tries++;
      if (a === e.art) { finish(true); return; }
      b.classList.add('wrong', 'dim');
      b.disabled = true;
      if (tries >= max) finish(false);
      else info.textContent = 'Ні. ' + left(max - tries);
    }
    function finish(ok) {
      over = true;
      setKeys(null);
      info.remove();
      btns.forEach(b => { b.disabled = true; if (b.textContent === e.art) b.classList.add('correct'); else b.classList.add('dim'); });
      record(e.id, ok && tries === 1);
      if (settings.autoplay) audio.play(e, { tts: true });
      resolve({ ok, tries, words: [e], wrong: ok && tries === 1 ? [] : [e.id] });
    }
  });
}

// Письмо: до 3 спроб; підказка (ще одна літера) коштує спробу.
function writeQ(body, e, ctx) {
  return new Promise(resolve => {
    let used = 0, over = false;
    const needArt = (e.art || e.plOnly) && settings.requireArticle;
    const input = h('input', {
      type: 'text', class: 'answer-input', autocomplete: 'off', autocorrect: 'off', autocapitalize: 'off',
      spellcheck: 'false', lang: 'de', enterkeyhint: 'done', placeholder: 'Напишіть німецькою…',
    });
    const note = h('div');
    const actions = h('div', { class: 'actions' },
      h('button', { class: 'btn primary block', type: 'button', onclick: submit }, 'Перевірити'),
      h('div', { class: 'btn-row', style: { marginTop: '0' } },
        h('button', { class: 'btn', type: 'button', onclick: hint }, 'Підказка'),
        h('button', { class: 'btn ghost', type: 'button', onclick: () => { used = TRIES; finish(false); } }, 'Не знаю')));
    const keys = h('div', { class: 'umlauts' }, ['ä', 'ö', 'ü', 'ß', 'Ä', 'Ö', 'Ü'].map(ch =>
      h('button', { type: 'button', onmousedown: ev => ev.preventDefault(), onclick: () => insert(ch) }, ch)));
    body.append(
      h('div', { class: 'prompt pop' },
        h('div', { class: 'hint' }, e.p ? 'Напишіть фразу німецькою' : needArt ? 'Напишіть з артиклем' : 'Напишіть німецькою'),
        h('div', { class: 'big ua' + (e.p ? ' phrase' : '') }, e.ua),
        h('div', { class: 'small muted' }, `Спроб: ${TRIES}`)),
      input, keys, note, actions);
    input.focus({ preventScroll: true });
    input.addEventListener('keydown', ev => {
      if (ev.key !== 'Enter' || over) return;
      ev.preventDefault();
      ev.stopPropagation();
      submit();
    });

    const say = text => note.replaceChildren(h('div', { class: 'note-box pop', style: { marginTop: '12px' } }, text));
    function shake() {
      input.classList.remove('bad'); void input.offsetWidth; input.classList.add('bad');
      ctx.later(() => input.classList.remove('bad'), 500);
      input.focus();
    }
    function insert(ch) {
      if (over) return;
      const s = input.selectionStart ?? input.value.length, en = input.selectionEnd ?? s;
      input.value = input.value.slice(0, s) + ch + input.value.slice(en);
      input.focus();
      input.setSelectionRange(s + 1, s + 1);
    }
    function hint() {
      if (over) return;
      const t = e.de, v = input.value;
      let k = 0;
      while (k < v.length && k < t.length && v[k].toLowerCase() === t[k].toLowerCase()) k++;
      input.value = t.slice(0, k + 1);
      used = Math.min(used + 1, TRIES - 1);
      say('Підказка коштує спробу. ' + left(TRIES - used));
      input.focus();
    }
    function submit() {
      if (over) return;
      const r = check(input.value, e, { requireArticle: settings.requireArticle });
      if (r.result === 'empty') { shake(); return; }
      if (r.result === 'ok') { finish(true, r.note); return; }
      const syn = synonymOf(input.value, e);
      if (syn) { say(`«${syn.de}» теж означає «${e.ua}», але тут загадано інше слово.`); shake(); return; }
      used++;
      if (used >= TRIES) { finish(false); return; }
      say((r.note ? r.note + '. ' : 'Неправильно. ') + left(TRIES - used));
      shake();
    }
    function finish(ok, msg) {
      over = true;
      input.readOnly = true;
      input.classList.add(ok ? 'ok' : 'bad');
      actions.remove();
      keys.remove();
      if (msg) say(msg); else note.replaceChildren();
      record(e.id, ok && used === 0);
      if (settings.autoplay) audio.play(e);
      resolve({ ok, tries: Math.min(used + 1, TRIES), words: [e], wrong: ok && used === 0 ? [] : [e.id] });
    }
  });
}

// Пари: з’єднати німецькі слова з перекладами; 3 помилки — без нових ходів.
function pairsQ(body, ws, ctx) {
  return new Promise(resolve => {
    let mistakes = 0, rest = ws.length, sel = null;
    const wrong = new Set();
    const tile = (e, side) => {
      const t = { e, side };
      t.el = h('button', { class: 'tile ' + side, type: 'button', onclick: () => tap(t) }, side === 'de' ? e.de : e.ua);
      return t;
    };
    const de = shuffle(ws).map(e => tile(e, 'de')), ua = shuffle(ws).map(e => tile(e, 'ua'));
    const info = h('div', { class: 'small muted center', style: { marginTop: '10px' } }, 'Помилок: 0 з ' + TRIES);
    body.append(
      h('p', { class: 'center small muted' }, 'З’єднайте слово з перекладом'),
      h('div', { class: 'match-grid pairs' }, de.flatMap((t, i) => [t.el, ua[i].el])),
      info);

    function shake(t) {
      t.el.classList.remove('bad'); void t.el.offsetWidth; t.el.classList.add('bad');
      ctx.later(() => t.el.classList.remove('bad'), 420);
    }
    function tap(t) {
      if (t.done) return;
      if (!sel || sel === t || sel.side === t.side) {
        if (sel) sel.el.classList.remove('sel');
        sel = sel === t ? null : t;
        if (sel) sel.el.classList.add('sel');
        return;
      }
      const a = sel;
      sel = null;
      a.el.classList.remove('sel');
      if (a.e.id === t.e.id) {
        a.done = t.done = true;
        a.el.classList.add('good'); t.el.classList.add('good');
        a.el.disabled = t.el.disabled = true;
        if (--rest === 0) finish();
        return;
      }
      mistakes++;
      wrong.add(a.e.id); wrong.add(t.e.id);
      shake(a); shake(t);
      info.textContent = `Помилок: ${mistakes} з ${TRIES}`;
    }
    function finish() {
      info.remove();
      ws.forEach(e => record(e.id, !wrong.has(e.id)));
      resolve({ ok: mistakes < TRIES, tries: Math.min(mistakes + 1, TRIES), words: ws, wrong: [...wrong] });
    }
  });
}
