// Додавання та редагування слова або фрази.
import { h, add, fill, icon, setTopbar, backBtn, seg, toast, confirmBox, empty } from '../ui.js';
import * as S from '../store.js';
import * as audio from '../audio.js';
import { lookupEntry, shortAudio, fullAudio } from '../wikiparse.js';

const IPA_KEYS = ['ˈ', 'ˌ', 'ː', 'ə', 'ɐ', 'ɛ', 'ɪ', 'ɔ', 'ʊ', 'ʏ', 'ø', 'œ', 'ç', 'ʃ', 'ʒ', 'ŋ', 'ʁ', 'χ', 'ʔ', 'aɪ̯', 'aʊ̯', 'ɔʏ̯', 'n̩', 'ɐ̯'];
let lastLevel = 'A1';
let lastTopic = 'Мої слова';

const fetchJson = url => fetch(url).then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); });
const isPhraseLike = de => /\s/.test(de.trim()) && !/^(der|die|das|sich)\s+\S+$/.test(de.trim());

export function render(root, [idEnc]) {
  const isNew = !idEnc || idEnc === 'new';
  const id = isNew ? null : decodeURIComponent(idEnc);
  const e = id ? S.getEntry(id) : null;
  setTopbar({ title: isNew ? 'Нове слово' : 'Редагування', left: backBtn('#/dict') });
  if (!isNew && !e) { root.append(empty('Слово не знайдено.', 'До словника', '#/dict')); return; }

  const d = e
    ? { de: e.de, f: e.f || '', ua: e.ua, ipa: e.ipa || '', au: e.au || '', lv: e.lv, t: e.t || '', p: !!e.p, ex: e.ex || '', exu: e.exu || '' }
    : { de: '', f: '', ua: '', ipa: '', au: '', lv: lastLevel, t: lastTopic, p: false, ex: '', exu: '' };
  let phraseTouched = !isNew;

  const inp = (value, placeholder, extra = {}) => h('input', { type: 'text', value, placeholder, autocomplete: 'off', ...extra });
  const fDe = inp(d.de, 'der Hund · gehen · Wie geht’s?', { lang: 'de', autocapitalize: 'off', autocorrect: 'off', spellcheck: 'false' });
  const fF = inp(d.f, 'die Hunde  ·  geht, ging, ist gegangen', { lang: 'de', autocapitalize: 'off', autocorrect: 'off' });
  const fUa = inp(d.ua, 'собака');
  const fIpa = inp(d.ipa, 'hʊnt', { class: 'ipa-input', autocapitalize: 'off', autocorrect: 'off', spellcheck: 'false' });
  const fT = inp(d.t, 'Тема', { list: 'topics-list' });
  const fEx = inp(d.ex, 'Der Hund bellt.', { lang: 'de' });
  const fExu = inp(d.exu, 'Собака гавкає.');
  const fLv = h('select', { value: d.lv }, S.LEVELS.map(l => h('option', { value: l }, l)));
  const kindSeg = h('div');
  const drawKind = () => kindSeg.replaceChildren(seg([[false, 'Слово'], [true, 'Фраза']], d.p, v => { d.p = v; phraseTouched = true; }));
  drawKind();
  fDe.addEventListener('input', () => {
    if (!phraseTouched && d.p !== isPhraseLike(fDe.value)) { d.p = isPhraseLike(fDe.value); drawKind(); }
  });

  const ipaKeys = h('div', { class: 'umlauts ipa-keys' }, IPA_KEYS.map(k =>
    h('button', { type: 'button', onmousedown: ev => ev.preventDefault(), onclick: () => insertAt(fIpa, k) }, k)));

  const audioInfo = h('div');
  const lookupBtn = h('button', { class: 'btn sm', type: 'button', onclick: lookup }, icon('search', 18), 'Знайти у Вікісловнику');
  const wiktLink = h('a', { class: 'small', target: '_blank', rel: 'noopener' }, 'Відкрити сторінку ↗');
  const updateLink = () => {
    const lemma = fDe.value.trim().replace(/^(der|die|das)\s+/, '').replace(/^sich\s+/, '').replace(/[.!?]+$/, '');
    wiktLink.href = 'https://de.wiktionary.org/wiki/' + encodeURIComponent(lemma || 'Hauptseite');
  };
  fDe.addEventListener('input', updateLink);
  updateLink();

  function current() {
    return { de: fDe.value, f: fF.value, ua: fUa.value, ipa: fIpa.value.replace(/^[[/]|[\]/]$/g, '').trim(), au: d.au, lv: fLv.value, t: fT.value, p: d.p, ex: fEx.value, exu: fExu.value };
  }
  function previewEntry() {
    const c = current();
    const m = !c.p && /^(der|die|das)\s+(.+)$/.exec(c.de.trim());
    return { ...c, id: '_preview', de: c.de.trim() || '…', art: m ? m[1] : '', bare: m ? m[2] : c.de, audio: fullAudio(c.au) };
  }

  function drawAudio() {
    const file = (fullAudio(d.au).match(/\/([^/]+\.(?:ogg|oga|opus|wav|flac|mp3))\//i) || [])[1];
    fill(audioInfo,
      h('div', { class: 'row' },
        h('div', { class: 'grow' },
          h('div', null, d.au ? 'Є запис носія мови' : 'Запису немає — озвучить синтез мовлення'),
          file ? h('a', { class: 'small', href: 'https://commons.wikimedia.org/wiki/File:' + encodeURIComponent(file), target: '_blank', rel: 'noopener' }, 'Джерело: Wikimedia Commons ↗') : null),
        h('button', { class: 'speak', type: 'button', 'aria-label': 'Прослухати', onclick: () => audio.play(previewEntry()) }, icon('speaker'))),
      d.au ? h('button', { class: 'btn ghost sm', type: 'button', style: { paddingLeft: '0' }, onclick: () => { d.au = ''; drawAudio(); } }, 'Не використовувати запис') : null);
  }
  drawAudio();

  async function lookup() {
    const de = fDe.value.trim();
    if (!de) { toast('Спершу введіть слово німецькою'); return; }
    lookupBtn.disabled = true;
    lookupBtn.lastChild.textContent = 'Шукаю…';
    try {
      const r = await lookupEntry(de, d.p, fetchJson);
      if (r.ipa) fIpa.value = r.ipa;
      if (r.audio) { d.au = shortAudio(r.audio); drawAudio(); }
      if (r.ipa || r.audio) toast(`Знайдено: ${[r.ipa && 'транскрипцію', r.audio && 'запис'].filter(Boolean).join(' і ')}${r.composed ? ' (зібрано з окремих слів)' : ''}`);
      else toast(r.missing ? `Не знайдено слово «${r.missing}» у Вікісловнику` : 'У Вікісловнику нічого не знайдено');
    } catch {
      toast('Немає зв’язку з Вікісловником');
    } finally {
      lookupBtn.disabled = false;
      lookupBtn.lastChild.textContent = 'Знайти у Вікісловнику';
    }
  }

  function save() {
    const c = current();
    if (!c.de.trim() || !c.ua.trim()) { toast('Заповніть німецьку та український переклад'); return; }
    const dup = S.allEntries().find(x => x.de === c.de.trim() && x.id !== id);
    if (dup && isNew) toast('Увага: таке слово вже є у словнику');
    lastLevel = c.lv;
    lastTopic = c.t || lastTopic;
    S.saveEntry(id, c);
    toast(isNew ? 'Додано до словника' : 'Збережено');
    location.hash = '#/dict';
  }

  const field = (label, ...kids) => h('div', { class: 'field' }, h('label', null, label), ...kids);
  const p = id ? S.progOf(id) : null;

  add(root,
    h('section', { class: 'card' },
      field('Німецькою *', fDe, h('div', { class: 'hint' }, 'Іменники — з артиклем: der / die / das')),
      field('Переклад українською *', fUa),
      field('Форми', fF, h('div', { class: 'hint' }, 'Множина для іменників, основні форми для дієслів')),
      h('div', { class: 'field' }, h('label', null, 'Тип'), kindSeg)),
    h('section', { class: 'card' },
      field('Транскрипція (IPA)', fIpa, ipaKeys),
      h('div', { class: 'row wrap', style: { marginBottom: '14px' } }, lookupBtn, wiktLink),
      field('Вимова', audioInfo)),
    h('section', { class: 'card' },
      h('div', { class: 'row' },
        h('div', { class: 'field grow' }, h('label', null, 'Рівень'), fLv),
        h('div', { class: 'field grow' }, h('label', null, 'Тема'), fT)),
      h('datalist', { id: 'topics-list' }, S.allTopics().map(t => h('option', { value: t }))),
      field('Приклад речення', fEx),
      field('Переклад прикладу', fExu)),
    p ? h('section', { class: 'card' },
      h('div', { class: 'sec-title' }, 'Прогрес'),
      h('dl', { class: 'kv' },
        h('dt', null, 'Статус'), h('dd', null, { new: 'нове', learning: 'вчу', learned: 'вивчено' }[S.statusOf(e)]),
        h('dt', null, 'Правильно'), h('dd', null, p.r),
        h('dt', null, 'Помилок'), h('dd', null, p.w),
        h('dt', null, 'Повторення'), h('dd', null, p.b ? new Date(p.d * 864e5 + new Date().getTimezoneOffset() * 60000).toLocaleDateString('uk-UA') : '—'))) : null,
    h('div', { class: 'btn-col' },
      h('button', { class: 'btn primary block big', type: 'button', onclick: save }, 'Зберегти'),
      p ? h('button', { class: 'btn block', type: 'button', onclick: () => { S.resetProgress([id]); toast('Прогрес слова скинуто'); location.hash = '#/edit/' + idEnc; } }, 'Скинути прогрес слова') : null,
      e && e.edited ? h('button', { class: 'btn block', type: 'button', onclick: async () => {
        if (await confirmBox('Повернути початковий варіант слова з вбудованого словника?', { ok: 'Повернути' })) { S.resetEntry(id); toast('Відновлено'); location.hash = '#/dict'; }
      } }, icon('undo', 18), 'Повернути оригінал') : null,
      e ? h('button', { class: 'btn danger block', type: 'button', onclick: async () => {
        if (await confirmBox(`Видалити «${e.de}» зі словника?`, { ok: 'Видалити', danger: true })) { S.deleteEntry(id); toast('Видалено'); location.hash = '#/dict'; }
      } }, icon('trash', 18), 'Видалити') : null),
  );
  if (isNew) fDe.focus();
}

function insertAt(input, text) {
  const s = input.selectionStart ?? input.value.length, en = input.selectionEnd ?? s;
  input.value = input.value.slice(0, s) + text + input.value.slice(en);
  input.focus();
  input.setSelectionRange(s + text.length, s + text.length);
}
