// Налаштування: озвучка, вигляд, офлайн-аудіо, імпорт/експорт, скидання.
import { h, fill, icon, setTopbar, seg, switchRow, toast, openSheet, confirmBox, saveFile, pickFile, copyText, isNativeApp, applyTheme, words } from '../ui.js';
import * as S from '../store.js';
import * as audio from '../audio.js';
import { planLookup, planTitles, resolve, fetchPages, fetchAudioUrls, shortAudio } from '../wikiparse.js';

const fetchJson = url => fetch(url).then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); });
const isPhraseLike = de => /\s/.test(de.trim()) && !/^(der|die|das|sich)\s+\S+$/.test(de.trim());

export function render(root) {
  setTopbar({ title: 'Налаштування' });
  const st = S.settings;
  const set = (k, v) => { st[k] = v; S.saveSettings(); };
  const cleanups = [];

  // ---------- Озвучка ----------
  const voiceSel = h('select', { onchange: () => { set('voice', voiceSel.value); audio.speak('Guten Tag! Wie geht es dir?'); } });
  const fillVoices = () => {
    const vs = audio.germanVoices();
    fill(voiceSel,
      h('option', { value: '' }, vs.length ? 'Автоматично (найкращий)' : 'Німецьких голосів не знайдено'),
      vs.map(v => h('option', { value: v.voiceURI }, `${v.name} · ${v.lang}${/premium/i.test(v.voiceURI) ? ' · преміум' : /enhanced/i.test(v.voiceURI) ? ' · покращений' : ''}`)));
    voiceSel.value = st.voice || '';
  };
  fillVoices();
  cleanups.push(audio.onVoicesChanged(fillVoices));

  const rateLabel = h('b');
  const showRate = () => { rateLabel.textContent = st.rate.toFixed(2).replace(/0$/, '') + '×'; };
  showRate();
  const rate = h('input', { type: 'range', min: '0.5', max: '1.2', step: '0.05', value: String(st.rate), style: { width: '100%' },
    oninput: () => { set('rate', Number(rate.value)); showRate(); } });

  const speech = h('section', { class: 'card' },
    h('div', { class: 'sec-title' }, 'Озвучка'),
    switchRow('Записи носіїв мови', 'Якщо є запис з Вікісловника — грає він, інакше синтез', st.recordings, v => set('recordings', v)),
    switchRow('Автоматично озвучувати', 'Слово звучить, щойно з’являється або після відповіді', st.autoplay, v => set('autoplay', v)),
    h('div', { class: 'field', style: { marginTop: '12px' } }, h('label', null, 'Голос синтезу'), voiceSel),
    h('div', { class: 'field' }, h('label', null, 'Швидкість синтезу: ', rateLabel), rate),
    h('div', { class: 'btn-row', style: { marginTop: '0' } },
      h('button', { class: 'btn sm', type: 'button', onclick: () => audio.speak('Guten Tag! Ich lerne Deutsch.') }, icon('speaker', 18), 'Перевірити голос')),
    h('p', { class: 'small muted' }, 'Порада для iPhone: Параметри → Доступність → Озвучений вміст → Голоси → Німецька — завантажте голос з позначкою «Покращений» або «Преміум» (наприклад, Anna). Він звучить значно природніше.'));

  // ---------- Вигляд ----------
  const look = h('section', { class: 'card' },
    h('div', { class: 'sec-title' }, 'Вигляд'),
    switchRow('Показувати транскрипцію', 'IPA біля німецьких слів', st.showIpa, v => set('showIpa', v)),
    h('div', { class: 'field', style: { marginTop: '12px', marginBottom: '0' } }, h('label', null, 'Тема'),
      seg([['auto', 'Як у системі'], ['light', 'Світла'], ['dark', 'Темна']], st.theme, v => { set('theme', v); applyTheme(); })));

  // ---------- Офлайн-аудіо ----------
  const cachedEl = h('span', null, '…');
  const refreshCached = () => audio.cachedCount().then(n => { cachedEl.textContent = n; });
  refreshCached();
  const dlProgress = h('div', { class: 'progress-line hidden' }, h('i'));
  const dlText = h('div', { class: 'small muted' });
  let dlAbort = null;
  const selList = () => S.allEntries().filter(e => S.sel.lv.includes(e.lv) || (S.sel.lv.includes('MY') && e.own));
  const withAudio = l => new Set(l.map(e => e.audio).filter(Boolean)).size;
  const dlBtn = (label, getList) => h('button', { class: 'btn sm', type: 'button', onclick: () => download(getList()) }, icon('download', 18), label);
  async function download(list) {
    if (dlAbort) { dlAbort.abort(); return; }
    dlAbort = new AbortController();
    dlProgress.classList.remove('hidden');
    try {
      const r = await audio.downloadAll(list, (n, total) => {
        dlProgress.firstChild.style.width = (n / total * 100) + '%';
        dlText.textContent = `Завантажено ${n} з ${total}… (натисніть ще раз, щоб зупинити)`;
      }, dlAbort.signal);
      dlText.textContent = dlAbort.signal.aborted ? 'Зупинено.' : `Готово: ${r.total - r.failed} записів${r.failed ? `, не вдалося: ${r.failed}` : ''}.`;
    } catch (err) {
      dlText.textContent = 'Помилка: ' + err.message;
    }
    dlAbort = null;
    refreshCached();
  }
  const offline = h('section', { class: 'card' },
    h('div', { class: 'sec-title' }, 'Аудіо без інтернету'),
    h('p', { class: 'small muted', style: { marginTop: '0' } }, 'Прослухані записи зберігаються автоматично. Можна завантажити все наперед, щоб вимова працювала без інтернету. Збережено записів: ', cachedEl, '.'),
    h('div', { class: 'row wrap' },
      dlBtn(`Вибрані рівні (${withAudio(selList())})`, selList),
      dlBtn(`Усі (${withAudio(S.allEntries())})`, () => S.allEntries())),
    dlProgress, dlText,
    h('button', { class: 'btn ghost sm', type: 'button', style: { paddingLeft: '0' }, onclick: async () => { await audio.clearCache(); refreshCached(); toast('Кеш аудіо очищено'); } }, 'Очистити збережене аудіо'));

  // ---------- Мої слова ----------
  const ownNoIpa = () => S.allEntries().filter(e => e.own && (!e.ipa || !e.au));
  const fillBtn = h('button', { class: 'btn sm', type: 'button', onclick: () => fillMissing(ownNoIpa()) }, icon('search', 18), 'Знайти транскрипції й записи для моїх слів');
  async function fillMissing(list) {
    if (!list.length) { toast('Усі ваші слова вже мають транскрипцію й запис'); return; }
    fillBtn.disabled = true;
    toast(`Шукаю у Вікісловнику: ${words(list.length)}…`, { ms: 0 });
    try {
      const plans = list.map(e => ({ e, plan: planLookup(e.de, !!e.p) }));
      const pages = await fetchPages([...new Set(plans.flatMap(p => planTitles(p.plan)))], fetchJson);
      const found = plans.map(({ e, plan }) => ({ e, r: resolve(plan, t => pages.get(t)) }));
      const files = [...new Set(found.map(x => x.r.audio).filter(Boolean))];
      const urls = files.length ? await fetchAudioUrls(files, fetchJson) : new Map();
      const patches = [];
      for (const { e, r } of found) {
        const upd = {};
        if (r.ipa && !e.ipa) upd.ipa = r.ipa;
        const u = r.audio && urls.get(r.audio);
        if (u && !e.au) upd.au = shortAudio(u);
        if (Object.keys(upd).length) patches.push([e.id, upd]);
      }
      S.patchMany(patches);
      toast(`Оновлено: ${words(patches.length)} з ${list.length}`);
    } catch {
      toast('Немає зв’язку з Вікісловником');
    }
    fillBtn.disabled = false;
  }

  function bulkSheet() {
    const ta = h('textarea', { rows: '8', placeholder: 'der Hund ; собака\ngehen ; йти\nWie geht’s? ; Як справи?', autocapitalize: 'off', autocorrect: 'off', spellcheck: 'false' });
    const lv = h('select', { value: 'A1' }, S.LEVELS.map(l => h('option', { value: l }, l)));
    const topic = h('input', { type: 'text', value: 'Мої слова', list: 'bulk-topics' });
    const info = h('div', { class: 'small muted' }, 'Кожен рядок: німецькою, роздільник (; | Tab або « - »), переклад. Третім полем можна додати транскрипцію.');
    const lookupSw = h('input', { type: 'checkbox', checked: true });
    let parsed = { out: [], bad: [] };
    ta.addEventListener('input', () => {
      parsed = parseList(ta.value);
      info.textContent = `Розпізнано: ${parsed.out.length}` + (parsed.bad.length ? ` · не вдалося розібрати: ${parsed.bad.length}` : '');
    });
    const close = openSheet('Додати список слів', h('div', null,
      h('div', { class: 'field' }, ta, info),
      h('div', { class: 'row' },
        h('div', { class: 'field grow' }, h('label', null, 'Рівень'), lv),
        h('div', { class: 'field grow' }, h('label', null, 'Тема'), topic)),
      h('datalist', { id: 'bulk-topics' }, S.allTopics().map(t => h('option', { value: t }))),
      h('label', { class: 'switch-row' }, h('div', { class: 'txt' }, 'Знайти транскрипції у Вікісловнику'), h('span', { class: 'switch' }, lookupSw, h('span'))),
      h('button', { class: 'btn primary block', type: 'button', style: { marginTop: '12px' }, onclick: () => {
        if (!parsed.out.length) { toast('Немає рядків для додавання'); return; }
        const ids = S.addMany(parsed.out.map(x => ({ ...x, lv: lv.value, t: topic.value.trim() || 'Мої слова', p: isPhraseLike(x.de) })));
        close();
        toast(`Додано: ${words(ids.length)}`);
        if (lookupSw.checked) fillMissing(ids.map(S.getEntry).filter(e => e && !e.ipa));
      } }, 'Додати')));
    ta.focus();
  }

  const mine = h('section', { class: 'card' },
    h('div', { class: 'sec-title' }, 'Мої слова'),
    h('p', { class: 'small muted', style: { marginTop: '0' } }, 'Окремі слова додаються у «Словнику» кнопкою «+». Тут — список одразу (наприклад, з Quizlet або нотаток).'),
    h('div', { class: 'btn-col', style: { marginTop: '0' } },
      h('button', { class: 'btn sm', type: 'button', onclick: bulkSheet }, icon('plus', 18), 'Додати список слів'),
      fillBtn));

  // ---------- Резервна копія ----------
  const stamp = () => new Date().toISOString().slice(0, 10);
  const backupText = () => JSON.stringify(S.exportBackup());
  async function restore(text) {
    if (!text) return;
    let j;
    try { j = JSON.parse(text); } catch { toast('Файл пошкоджений або це не JSON'); return; }
    if (!(await confirmBox('Замінити поточний прогрес і ваші слова даними з копії?', { ok: 'Відновити', danger: true }))) return;
    try { S.importBackup(j); applyTheme(); toast('Дані відновлено'); location.hash = '#/'; }
    catch (err) { toast(err.message); }
  }
  function pasteSheet() {
    const ta = h('textarea', { rows: '6', placeholder: 'Вставте сюди текст резервної копії' });
    const close = openSheet('Вставити копію', h('div', null, ta,
      h('button', { class: 'btn primary block', type: 'button', style: { marginTop: '12px' }, onclick: () => { close(); restore(ta.value); } }, 'Відновити')));
  }
  const backup = h('section', { class: 'card' },
    h('div', { class: 'sec-title' }, 'Резервна копія'),
    h('p', { class: 'small muted', style: { marginTop: '0' } }, 'Прогрес і ваші слова зберігаються тільки на цьому пристрої. Робіть копію час від часу — її можна перенести на інший телефон.'),
    h('div', { class: 'btn-row', style: { marginTop: '0' } },
      h('button', { class: 'btn sm', type: 'button', onclick: () => saveFile(`wortschatz-${stamp()}.json`, backupText(), 'application/json') }, icon('download', 18), 'Зберегти файл'),
      h('button', { class: 'btn sm', type: 'button', onclick: async () => { const t = await pickFile('.json,application/json'); restore(t); } }, icon('upload', 18), 'Відкрити файл')),
    h('div', { class: 'btn-row' },
      h('button', { class: 'btn sm ghost', type: 'button', onclick: async () => {
        toast(await copyText(backupText()) ? 'Скопійовано в буфер обміну' : 'Не вдалося скопіювати');
      } }, 'Копіювати як текст'),
      h('button', { class: 'btn sm ghost', type: 'button', onclick: pasteSheet }, 'Вставити текст')),
    h('button', { class: 'btn sm ghost', type: 'button', style: { paddingLeft: '0', marginTop: '6px' }, onclick: () => saveFile(`wortschatz-slovnyk-${stamp()}.csv`, toCsv(S.allEntries()), 'text/csv') }, 'Експортувати словник у CSV (Excel, Anki)'));

  // ---------- Скидання ----------
  const delN = S.deletedCount();
  const editN = S.editedCount();
  const reset = h('section', { class: 'card' },
    h('div', { class: 'sec-title' }, 'Скидання'),
    h('div', { class: 'btn-col', style: { marginTop: '0' } },
      h('button', { class: 'btn sm danger', type: 'button', onclick: async () => {
        if (await confirmBox('Скинути весь прогрес навчання? Слова залишаться.', { ok: 'Скинути', danger: true })) { S.resetProgress(); toast('Прогрес скинуто'); }
      } }, 'Скинути прогрес'),
      delN ? h('button', { class: 'btn sm', type: 'button', onclick: () => { S.restoreDeleted(); toast('Відновлено'); location.hash = '#/settings?' + Date.now(); } }, `Відновити видалені слова (${delN})`) : null,
      editN ? h('button', { class: 'btn sm danger', type: 'button', onclick: async () => {
        if (await confirmBox('Скасувати всі зміни у вбудованому словнику та видалити ваші слова?', { ok: 'Скинути', danger: true })) { S.resetAllEdits(); toast('Словник відновлено'); location.hash = '#/settings?' + Date.now(); }
      } }, 'Скинути всі зміни словника') : null));

  // ---------- Про застосунок ----------
  const meta = S.dictMeta();
  const all = S.allEntries();
  const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone || isNativeApp();
  const about = h('section', { class: 'card' },
    h('div', { class: 'sec-title' }, 'Про застосунок'),
    !standalone && /iPhone|iPad|iPod/.test(navigator.userAgent) ? h('div', { class: 'note-box', style: { marginBottom: '12px' } },
      'Щоб встановити як застосунок: у Safari натисніть «Поділитися» → «На початковий екран».') : null,
    h('dl', { class: 'kv' },
      h('dt', null, 'Слів'), h('dd', null, all.filter(e => !e.p).length),
      h('dt', null, 'Фраз'), h('dd', null, all.filter(e => e.p).length),
      h('dt', null, 'Із записом вимови'), h('dd', null, all.filter(e => e.audio).length),
      h('dt', null, 'Версія словника'), h('dd', null, meta.built ? new Date(meta.built).toLocaleDateString('uk-UA') : '—')),
    h('p', { class: 'small muted' }, 'Транскрипції — з німецького Вікісловника (de.wiktionary.org, ліцензія CC BY-SA 4.0). Записи вимови — з Wikimedia Commons, ліцензію та авторів кожного запису видно на його сторінці (посилання в редакторі слова).'));

  root.append(speech, look, offline, mine, backup, reset, about);
  return () => cleanups.forEach(fn => fn());
}

function parseList(text) {
  const out = [], bad = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    let parts = null;
    for (const sep of ['\t', ' | ', '|', ';', ' — ', ' – ', ' - ', ' = ']) {
      if (line.includes(sep)) { parts = line.split(sep).map(s => s.trim()); break; }
    }
    if (!parts || !parts[0] || !parts[1]) { bad.push(line); continue; }
    out.push({ de: parts[0], ua: parts[1], ipa: (parts[2] || '').replace(/^[[/]|[\]/]$/g, '').trim() });
  }
  return { out, bad };
}

function toCsv(list) {
  const rows = [['Німецька', 'Форми', 'Українська', 'IPA', 'Рівень', 'Тема', 'Фраза']];
  for (const e of list) rows.push([e.de, e.f || '', e.ua, e.ipa || '', e.lv, e.t || '', e.p ? '1' : '']);
  const q = c => /[;"\n]/.test(c) ? '"' + c.replace(/"/g, '""') + '"' : c;
  return '﻿' + rows.map(r => r.map(c => q(String(c))).join(';')).join('\r\n');
}
