// Дані: словник, зміни користувача, прогрес (інтервальне повторення), налаштування.
// Усе зберігається локально в браузері (localStorage).
import { fullAudio } from './wikiparse.js';

const K = {
  edits: 'ws.edits', prog: 'ws.progress', settings: 'ws.settings',
  sel: 'ws.selection', daily: 'ws.daily', best: 'ws.best', gems: 'ws.gems',
};

function load(key, def) {
  try { const s = localStorage.getItem(key); return s ? JSON.parse(s) : def; } catch { return def; }
}
function save(key, val) {
  try { localStorage.setItem(key, JSON.stringify(val)); return true; }
  catch (e) { console.error(e); window.dispatchEvent(new CustomEvent('ws-storage-error')); return false; }
}

export const LEVELS = ['A0', 'A1', 'A2', 'B1', 'B2', 'C1', 'C2'];

export const DEFAULTS = {
  dir: 'mix',            // напрямок у заучуванні: mix | de-ua | ua-de
  roundSize: 10,         // слів у раунді заучування
  learnTyping: false,    // додавати письмо в заучування
  cardsDir: 'de-ua',
  cardsOrder: 'shuffle',
  writeSize: 15,
  requireArticle: true,
  listenMode: 'choice',  // choice | dictation
  autoplay: true,
  showIpa: true,
  recordings: true,      // записи носіїв мови замість синтезу
  rate: 0.9,
  voice: '',
  theme: 'auto',
  gemsQ: 'gem',          // питання в «Кристалах»: gem — кристали «?» | moves — кожні кілька ходів
  gemsLevel: 'medium',   // складність «Кристалів»: easy | medium | hard
  gemsReward: 'tries',   // ходи за відповідь: tries — залежно від спроби | random — випадково
  gemsWrite: true,       // письмо серед питань у «Кристалах»
};
export const settings = Object.assign({}, DEFAULTS, load(K.settings, {}));
export function saveSettings() { save(K.settings, settings); }

export const sel = Object.assign({ lv: ['A0'], kind: 'all', topic: '', status: 'all' }, load(K.sel, {}));
export function saveSel() { save(K.sel, sel); }

let base = [];
let baseMap = new Map();
let meta = {};
let edits = normEdits(load(K.edits, null));
let progress = load(K.prog, {});
let daily = load(K.daily, { d: 0, n: 0, c: 0, streak: 0 });

function normEdits(x) { return { o: (x && x.o) || {}, a: (x && x.a) || [], d: (x && x.d) || [] }; }

let entries = [];
let byId = new Map();
export const allEntries = () => entries;
export const getEntry = id => byId.get(id);
export const baseEntry = id => baseMap.get(id);
export const dictMeta = () => meta;

export async function init() {
  const r = await fetch('data/dict.json', { cache: 'no-cache' });
  if (!r.ok) throw new Error('Не вдалося завантажити словник (HTTP ' + r.status + ')');
  const j = await r.json();
  meta = j.meta || {};
  base = j.entries.map(e => ({ ...e, id: e.id || e.de }));
  baseMap = new Map(base.map(e => [e.id, e]));
  rebuild();
  try { navigator.storage && navigator.storage.persist && navigator.storage.persist(); } catch { /* немає */ }
}

function decorate(e) {
  const m = !e.p && /^(der|die|das)\s+(.+)$/.exec(e.de);
  const plOnly = !!m && /^Pl\.?$/i.test(e.f || '');
  return {
    ...e,
    art: m && !plOnly ? m[1] : '',
    bare: m ? m[2] : e.de,
    plOnly,
    audio: fullAudio(e.au),
  };
}

function rebuild() {
  const del = new Set(edits.d);
  const out = [];
  for (const e of base) {
    if (del.has(e.id)) continue;
    const o = edits.o[e.id];
    out.push(decorate(o ? { ...e, ...o, id: e.id, edited: true } : e));
  }
  for (const e of edits.a) out.push(decorate({ ...e, own: true }));
  entries = out;
  byId = new Map(out.map(e => [e.id, e]));
}

// ---------- Редагування словника ----------
const FIELDS = ['de', 'f', 'ua', 'ipa', 'au', 'lv', 't', 'p', 'ex', 'exu'];
const newId = () => 'u' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

function cleanFields(data) {
  const c = {};
  for (const k of FIELDS) c[k] = k === 'p' ? (data.p ? 1 : 0) : String(data[k] ?? '').trim();
  return c;
}
function strip(c) {
  const o = {};
  for (const k in c) if (c[k] !== '' && c[k] !== 0) o[k] = c[k];
  return o;
}
function persistEdits() { save(K.edits, edits); rebuild(); }

export function saveEntry(id, data) {
  const c = cleanFields(data);
  if (!id) {
    const nid = newId();
    edits.a.push({ id: nid, ...strip(c) });
    persistEdits();
    return nid;
  }
  applyEdit(id, c);
  persistEdits();
  return id;
}

// Для свого слова — заміна цілком, для вбудованого — зберігаємо лише відмінності.
function applyEdit(id, c) {
  const i = edits.a.findIndex(x => x.id === id);
  if (i >= 0) { edits.a[i] = { id, ...strip(c) }; return; }
  const b = baseMap.get(id);
  if (!b) return;
  const diff = {};
  for (const k of FIELDS) {
    const bv = k === 'p' ? (b.p ? 1 : 0) : String(b[k] ?? '');
    if (c[k] !== bv) diff[k] = c[k];
  }
  if (Object.keys(diff).length) edits.o[id] = diff; else delete edits.o[id];
}

export function addMany(list) {
  const ids = [];
  for (const x of list) { const id = newId() + ids.length; ids.push(id); edits.a.push({ id, ...strip(cleanFields(x)) }); }
  persistEdits();
  return ids;
}

// Оновити кілька полів у багатьох словах одразу (напр., транскрипції).
export function patchMany(patches) {
  for (const [id, upd] of patches) {
    const e = byId.get(id);
    if (!e) continue;
    const data = {};
    for (const k of FIELDS) data[k] = e[k];
    Object.assign(data, upd);
    applyEdit(id, cleanFields(data));
  }
  persistEdits();
}

export function deleteEntry(id) {
  const i = edits.a.findIndex(x => x.id === id);
  if (i >= 0) edits.a.splice(i, 1);
  else { if (!edits.d.includes(id)) edits.d.push(id); delete edits.o[id]; }
  delete progress[id];
  persistEdits();
  flush();
}
export function resetEntry(id) { delete edits.o[id]; persistEdits(); }
export const deletedCount = () => edits.d.length;
export const editedCount = () => Object.keys(edits.o).length;
export function restoreDeleted() { const n = edits.d.length; edits.d = []; persistEdits(); return n; }
export function resetAllEdits() { edits = normEdits(null); persistEdits(); }

// ---------- Прогрес: інтервальне повторення (система Лейтнера) ----------
// Скринька 1..7, наступне повторення через 1, 3, 7, 14, 30, 60, 120 днів.
const INTERVALS = [0, 1, 3, 7, 14, 30, 60, 120];
const MAXBOX = INTERVALS.length - 1;
export const LEARNED_BOX = 4;

export function today() {
  const d = new Date();
  return Math.floor((d.getTime() - d.getTimezoneOffset() * 60000) / 864e5);
}

export function record(id, ok) {
  const t = today();
  const p = progress[id] || (progress[id] = { b: 0, d: 0, r: 0, w: 0 });
  if (ok) {
    p.r++;
    // Підвищуємо скриньку лише коли слово справді «настало» до повторення.
    if (p.b === 0 || p.d <= t) { p.b = Math.min(p.b + 1, MAXBOX); p.d = t + INTERVALS[p.b]; }
  } else {
    p.w++;
    p.b = 1;
    p.d = t + 1;
  }
  p.s = Date.now();
  if (daily.d !== t) {
    daily.streak = daily.d === t - 1 ? (daily.streak || 0) + 1 : 1;
    daily.d = t; daily.n = 0; daily.c = 0;
  }
  daily.n++;
  if (ok) daily.c++;
  scheduleSave();
}

let saveTimer = 0;
function scheduleSave() { clearTimeout(saveTimer); saveTimer = setTimeout(flush, 500); }
export function flush() { clearTimeout(saveTimer); save(K.prog, progress); save(K.daily, daily); }
window.addEventListener('pagehide', flush);
document.addEventListener('visibilitychange', () => { if (document.hidden) flush(); });

export const progOf = id => progress[id];
export function statusOf(e) {
  const p = progress[e.id];
  if (!p || p.b === 0) return 'new';
  return p.b >= LEARNED_BOX ? 'learned' : 'learning';
}
export function isDue(e) { const p = progress[e.id]; return !!p && p.b > 0 && p.d <= today(); }
export function isHard(e) { const p = progress[e.id]; return !!p && p.w > 0 && p.b < LEARNED_BOX; }
export function resetProgress(ids) {
  if (!ids) progress = {};
  else for (const id of ids) delete progress[id];
  flush();
}
export function getDaily() {
  const t = today();
  if (daily.d === t) return daily;
  return { d: t, n: 0, c: 0, streak: daily.d === t - 1 ? daily.streak || 0 : 0 };
}

// ---------- Вибір набору слів ----------
export const STATUS = {
  all: () => true,
  new: e => statusOf(e) === 'new',
  learning: e => statusOf(e) === 'learning',
  due: isDue,
  hard: isHard,
  learned: e => statusOf(e) === 'learned',
};

export function matchesBase(e, s = sel) {
  const lvOk = s.lv.includes(e.lv) || (s.lv.includes('MY') && e.own);
  const kindOk = s.kind === 'all' || (s.kind === 'phrases' ? !!e.p : !e.p);
  return lvOk && kindOk;
}
export function filterEntries(s = sel) {
  const st = STATUS[s.status] || STATUS.all;
  return entries.filter(e => matchesBase(e, s) && (!s.topic || e.t === s.topic) && st(e));
}
export function topicsFor(s = sel) {
  const m = new Map();
  for (const e of entries) if (matchesBase(e, s)) m.set(e.t || 'Інше', (m.get(e.t || 'Інше') || 0) + 1);
  return [...m];
}
export const dueList = () => entries.filter(isDue);
export const levelsPresent = () => LEVELS.filter(l => entries.some(e => e.lv === l));
export const allTopics = () => [...new Set(entries.map(e => e.t).filter(Boolean))];

// ---------- Рекорди в «Парах» ----------
export function bestTime(key) { return load(K.best, {})[key] || 0; }
export function setBestTime(key, ms) {
  const b = load(K.best, {});
  if (!b[key] || ms < b[key]) { b[key] = ms; save(K.best, b); return true; }
  return false;
}

// ---------- Гра «Кристали»: рекорд і незавершена гра ----------
export const gemsData = () => load(K.gems, {});
export function saveGemsData(d) { save(K.gems, d); }

// ---------- Резервна копія ----------
export function exportBackup() {
  flush();
  return { app: 'wortschatz', v: 1, date: new Date().toISOString(), edits, progress, daily, settings };
}
export function importBackup(j) {
  if (!j || j.app !== 'wortschatz') throw new Error('Це не файл резервної копії Wortschatz');
  edits = normEdits(j.edits);
  progress = j.progress || {};
  if (j.daily) daily = j.daily;
  if (j.settings) Object.assign(settings, j.settings);
  save(K.edits, edits);
  saveSettings();
  flush();
  rebuild();
}
