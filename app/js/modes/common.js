// Спільні частини режимів тренування: стартова панель, питання з вибором,
// питання з введенням, підсумок раунду.
import { h, fill, icon, deWord, ipaEl, speakBtn, revealCard, seg, shuffle, setKeys, typingInField, words, wordRow } from '../ui.js';
import { settings, saveSettings, allEntries, record, progOf, isDue } from '../store.js';
import * as audio from '../audio.js';
import { check } from '../check.js';

export const MODES = [
  { id: 'learn', title: 'Заучування', desc: 'Слова по колу, вибір перекладу', icon: 'learn', color: '#6366f1',
    long: 'Невеликий набір слів іде по колу: оберіть переклад з німецької та навпаки. Помилки повертаються, доки не запам’ятаєте.' },
  { id: 'cards', title: 'Картки', desc: 'Перевертай і запам’ятовуй', icon: 'cards', color: '#f59e0b',
    long: 'Класичні картки: подивіться, згадайте, переверніть. Свайп вправо — знаю, вліво — ще вчу.' },
  { id: 'write', title: 'Письмо', desc: 'Пиши слово німецькою', icon: 'write', color: '#14b8a6',
    long: 'Бачите переклад — пишете німецькою. Є кнопки ä ö ü ß і підказка по літері.' },
  { id: 'match', title: 'Пари', desc: 'Знайди пари на швидкість', icon: 'match', color: '#ec4899',
    long: 'З’єднайте німецькі слова з перекладом якомога швидше. Помилка — плюс секунда.' },
  { id: 'listen', title: 'Аудіювання', desc: 'Слухай і впізнавай', icon: 'listen', color: '#0ea5e9',
    long: 'Слухайте слово й оберіть переклад або запишіть почуте (диктант).' },
  { id: 'articles', title: 'Артиклі', desc: 'der, die чи das?', icon: 'articles', color: '#8b5cf6',
    long: 'Тренування родів іменників. Колір допомагає запам’ятати: der — синій, die — рожевий, das — зелений.' },
];
export const modeMeta = id => MODES.find(m => m.id === id);

// Частина мови (приблизно) — щоб варіанти відповіді були схожими.
export function pos(e) {
  if (e.p) return 'phrase';
  if (e.art || e.plOnly) return 'noun';
  if (e.f && /\b(hat|ist)\s/.test(e.f)) return 'verb';
  if (/^[A-ZÄÖÜ]/.test(e.de)) return 'noun';
  return 'other';
}

export function pickOptions(e, list, field, n = 4) {
  const p = pos(e);
  const key = x => String(x[field]).trim().toLowerCase();
  const used = new Set([key(e)]);
  const res = [e];
  const tryAdd = src => {
    for (const c of shuffle(src)) {
      if (res.length >= n) return;
      if (c.id === e.id || used.has(key(c))) continue;
      used.add(key(c));
      res.push(c);
    }
  };
  tryAdd(list.filter(x => pos(x) === p));
  if (res.length < n) tryAdd(allEntries().filter(x => x.lv === e.lv && pos(x) === p));
  if (res.length < n) tryAdd(allEntries().filter(x => pos(x) === p));
  if (res.length < n) tryAdd(allEntries());
  return shuffle(res);
}

// Порядок вивчення: спершу ті, що чекають повторення, потім нові, потім ті, що вчаться.
export function learningOrder(list) {
  const k = e => { const p = progOf(e.id); if (!p || p.b === 0) return 1; if (isDue(e)) return 0; return 2 + p.b; };
  return shuffle(list).sort((a, b) => k(a) - k(b));
}

export function setupPanel({ mode, count, countLabel, options = [], extra = null, onStart }) {
  const m = modeMeta(mode);
  setKeys(ev => { if (ev.key === 'Enter' && !typingInField()) onStart(); });
  return h('div', { class: 'setup' },
    h('div', { class: 'hero' },
      h('div', { class: 'hero-ico', style: { background: m.color } }, icon(m.icon, 34)),
      h('h2', null, m.title),
      h('p', { class: 'muted' }, m.long),
      h('p', { class: 'small muted' }, countLabel || 'У наборі: ' + words(count))),
    options.length || extra ? h('div', { class: 'card' },
      options.map(o => h('div', { class: 'opt' },
        h('div', { class: 'lbl' }, o.label),
        seg(o.choices, settings[o.key], v => { settings[o.key] = v; saveSettings(); }))),
      extra) : null,
    h('button', { class: 'btn primary block big', type: 'button', onclick: onStart }, 'Почати'));
}

export function summary(root, { title, stats = [], missed = [], buttons = [] }) {
  const btns = buttons.filter(Boolean);
  setKeys(ev => { if (ev.key === 'Enter' && btns[0]) btns[0][1](); });
  root.replaceChildren(h('div', { class: 'summary pop' },
    h('div', { class: 'hero' }, h('div', { class: 'trophy' }, icon('trophy', 36)), h('h2', null, title)),
    stats.length ? h('div', { class: 'stats-row' }, stats.map(([v, l]) => h('div', null, h('b', null, v), h('span', null, l)))) : null,
    missed.length ? [h('div', { class: 'group-h' }, 'Варто повторити'), h('div', { class: 'wlist' }, missed.map(e => wordRow(e, () => audio.play(e))))] : null,
    h('div', { class: 'btn-col' }, btns.map(([label, fn, cls]) => h('button', { class: 'btn block ' + (cls || ''), type: 'button', onclick: fn }, label)))));
  window.scrollTo(0, 0);
}

const topicTag = e => e.t ? h('div', { class: 'topic' }, e.t) : null;

export function listenPrompt(e) {
  return h('div', { class: 'prompt pop' },
    h('div', { class: 'hint' }, 'Послухайте'),
    h('button', { class: 'big-play', type: 'button', 'aria-label': 'Прослухати', onclick: () => audio.play(e) }, icon('speaker', 44)),
    h('button', { class: 'btn ghost sm', type: 'button', onclick: () => audio.play(e, { slow: true }) }, 'Повільніше'));
}

// Питання з вибором із 4 варіантів.
// kind: 'de' — показ німецькою, вибір перекладу; 'ua' — навпаки; 'listen' — на слух.
export function mcQuestion(root, e, kind, list, ctx, done) {
  const field = kind === 'ua' ? 'de' : 'ua';
  const opts = pickOptions(e, list, field);
  let answered = false, ok = false, finished = false, timer = 0;

  let prompt;
  if (kind === 'de') {
    prompt = h('div', { class: 'prompt pop' }, topicTag(e),
      h('div', { class: 'big' + (e.p ? ' phrase' : '') }, deWord(e)), ipaEl(e), speakBtn(e));
  } else if (kind === 'ua') {
    prompt = h('div', { class: 'prompt pop' }, topicTag(e),
      h('div', { class: 'hint' }, 'Оберіть німецькою'),
      h('div', { class: 'big ua' + (e.p ? ' phrase' : '') }, e.ua));
  } else {
    prompt = listenPrompt(e);
  }
  const btns = opts.map((o, i) => h('button', { class: 'option', type: 'button', onclick: () => choose(i) },
    h('span', { class: 'num' }, i + 1),
    field === 'ua' ? h('span', null, o.ua) : deWord(o)));
  const after = h('div');
  const actions = h('div', { class: 'actions' },
    h('button', { class: 'btn ghost block', type: 'button', onclick: () => choose(-1) }, 'Не знаю'));
  root.replaceChildren(h('div', { class: 'question' }, prompt, h('div', { class: 'options' }, btns), after, actions));

  if ((kind === 'de' && settings.autoplay) || kind === 'listen') audio.play(e);
  setKeys(ev => {
    if (!answered && ev.key >= '1' && ev.key <= String(opts.length)) choose(Number(ev.key) - 1);
    else if (answered && (ev.key === 'Enter' || ev.key === ' ')) { ev.preventDefault(); next(); }
    else if (!answered && ev.key === ' ') { ev.preventDefault(); audio.play(e); }
  });

  function choose(i) {
    if (answered) return;
    answered = true;
    ok = i >= 0 && opts[i].id === e.id;
    btns.forEach((b, j) => {
      b.disabled = true;
      if (opts[j].id === e.id) b.classList.add('correct');
      else if (j === i) b.classList.add('wrong');
      else b.classList.add('dim');
    });
    record(e.id, ok);
    if (kind !== 'de' || !ok) after.replaceChildren(revealCard(e));
    if (kind === 'ua' && settings.autoplay) audio.play(e);
    actions.replaceChildren(h('button', { class: 'btn primary block', type: 'button', onclick: next }, 'Далі'));
    if (ok) timer = ctx.later(next, kind === 'ua' && settings.autoplay ? 1500 : kind === 'listen' ? 1300 : 800);
  }
  function next() {
    if (finished) return;
    finished = true;
    ctx.clear(timer);
    done(ok);
  }
}

// Питання з введенням німецькою (переклад або диктант).
export function typeQuestion(root, e, ctx, done, { requireArticle = settings.requireArticle, listen = false } = {}) {
  let state = 'ask', hints = 0, verdict = false, finished = false;
  const needArt = (e.art || e.plOnly) && requireArticle;
  const input = h('input', {
    type: 'text', class: 'answer-input', autocomplete: 'off', autocorrect: 'off', autocapitalize: 'off',
    spellcheck: 'false', lang: 'de', enterkeyhint: 'done',
    placeholder: listen ? 'Напишіть, що почули…' : 'Напишіть німецькою…',
  });
  const prompt = listen ? listenPrompt(e) : h('div', { class: 'prompt pop' }, topicTag(e),
    h('div', { class: 'hint' }, e.p ? 'Напишіть фразу німецькою' : needArt ? 'Напишіть з артиклем' : 'Напишіть німецькою'),
    h('div', { class: 'big ua' + (e.p ? ' phrase' : '') }, e.ua));
  const keys = h('div', { class: 'umlauts' }, ['ä', 'ö', 'ü', 'ß', 'Ä', 'Ö', 'Ü'].map(ch =>
    h('button', { type: 'button', onmousedown: ev => ev.preventDefault(), onclick: () => insert(ch) }, ch)));
  const fb = h('div');
  const actions = h('div', { class: 'actions' });
  root.replaceChildren(h('div', { class: 'question' }, prompt, input, keys, fb, actions));
  drawAsk();
  if (listen) audio.play(e);
  input.focus({ preventScroll: true });

  input.addEventListener('keydown', ev => {
    if (ev.key !== 'Enter') return;
    ev.preventDefault();
    ev.stopPropagation();
    if (state === 'ask') submit(); else next();
  });
  setKeys(ev => { if (state !== 'ask' && ev.key === 'Enter' && !typingInField()) next(); });

  function insert(ch) {
    if (input.readOnly) return;
    const s = input.selectionStart ?? input.value.length, en = input.selectionEnd ?? s;
    input.value = input.value.slice(0, s) + ch + input.value.slice(en);
    input.focus();
    input.setSelectionRange(s + 1, s + 1);
  }
  function drawAsk() {
    actions.replaceChildren(
      h('button', { class: 'btn primary block', type: 'button', onclick: submit }, 'Перевірити'),
      h('div', { class: 'btn-row', style: { marginTop: '0' } },
        h('button', { class: 'btn', type: 'button', onclick: hint }, 'Підказка'),
        h('button', { class: 'btn ghost', type: 'button', onclick: giveUp }, 'Не знаю')));
  }
  function hint() {
    if (state !== 'ask') return;
    const t = e.de, v = input.value;
    let k = 0;
    while (k < v.length && k < t.length && v[k].toLowerCase() === t[k].toLowerCase()) k++;
    input.value = t.slice(0, k + 1);
    hints++;
    input.focus();
  }
  function submit() {
    if (state !== 'ask') return;
    const r = check(input.value, e, { requireArticle: listen ? false : requireArticle });
    if (r.result === 'empty') {
      input.classList.remove('bad'); void input.offsetWidth; input.classList.add('bad');
      ctx.later(() => input.classList.remove('bad'), 500);
      input.focus();
      return;
    }
    state = 'done';
    input.readOnly = true;
    verdict = r.result === 'ok' && hints === 0;
    showResult(r);
  }
  function giveUp() {
    if (state !== 'ask') return;
    state = 'done';
    input.readOnly = true;
    verdict = false;
    showResult({ result: 'wrong', gaveUp: true });
  }
  function showResult(r) {
    const good = r.result === 'ok';
    input.classList.add(good ? 'ok' : 'bad');
    fb.replaceChildren(
      h('div', { class: 'feedback pop ' + (good ? 'ok' : 'bad') },
        h('div', { class: 'fh' }, good ? (hints ? 'Правильно (з підказкою)' : 'Правильно!') : r.result === 'almost' ? 'Майже…' : r.gaveUp ? 'Правильна відповідь:' : 'Неправильно'),
        !good && !r.gaveUp ? h('div', { class: 'yours' }, 'Ваша відповідь: ', h('s', null, input.value)) : null,
        r.note ? h('div', { class: 'note' }, r.note) : null),
      revealCard(e));
    if (settings.autoplay || listen) audio.play(e);
    fill(actions,
      h('button', { class: 'btn primary block', type: 'button', onclick: next }, 'Далі'),
      !good && !r.gaveUp ? h('button', { class: 'btn ghost block', type: 'button', onclick: () => { verdict = true; next(); } }, 'Зарахувати — я відповів правильно') : null);
  }
  function next() {
    if (finished || state !== 'done') return;
    finished = true;
    record(e.id, verdict);
    done(verdict);
  }
}
