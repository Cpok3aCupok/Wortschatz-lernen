// Пошук транскрипції (IPA) та аудіо у німецькому Вікісловнику (de.wiktionary.org).
// Модуль спільний: його використовує застосунок (редактор слова) і скрипт tools/enrich.mjs.

export const AUDIO_BASE = 'https://upload.wikimedia.org/wikipedia/commons/transcoded/';
const WIKT_API = 'https://de.wiktionary.org/w/api.php';
const COMMONS_API = 'https://commons.wikimedia.org/w/api.php';

// Вирізає розділ "== Слово ({{Sprache|Deutsch}}) ==" зі сторінки.
export function germanSection(wt) {
  const m = /^==[^=].*\{\{Sprache\|Deutsch\}\}.*$/m.exec(wt);
  if (!m) return null;
  const rest = wt.slice(m.index + m[0].length);
  const next = rest.search(/^==[^=]/m);
  return next < 0 ? rest : rest.slice(0, next);
}

// Повертає { ipa, audio } з вікі-тексту сторінки або null.
export function parsePage(wt) {
  const sec = germanSection(wt);
  if (!sec) return null;
  let ipa = null;
  for (const m of sec.matchAll(/\{\{Lautschrift\|([^}|]*)/g)) {
    const v = m[1].trim();
    if (v && !/^[….?\s-]+$/.test(v)) { ipa = v; break; }
  }
  let audio = null, regional = null;
  for (const m of sec.matchAll(/\{\{Audio\|([^}|]+)((?:\|[^}]*)?)\}\}/g)) {
    const file = m[1].trim();
    if (!/\.(ogg|oga|opus|wav|mp3|flac)$/i.test(file)) continue;
    if (/spr\s*=\s*(at|ch)/i.test(m[2] || '') || /^De-(at|ch)-/i.test(file)) { regional ??= file; continue; }
    audio = file;
    break;
  }
  return { ipa, audio: audio || regional };
}

const lowerFirst = s => s ? s[0].toLowerCase() + s.slice(1) : s;
const uniq = a => [...new Set(a.filter(Boolean))];

// Які сторінки Вікісловника шукати для цього запису.
export function planLookup(de, phrase = false) {
  const cleanOf = x => x.replace(/\.\.\.|…/g, ' ').replace(/[.!?,;:„“"»«]/g, ' ').replace(/\s+/g, ' ').trim();
  const apos = w => w.includes("'") ? [w, w.replace(/'/g, '’')] : [w];
  let whole, clean;
  if (phrase) {
    clean = cleanOf(de);
    whole = uniq([clean, lowerFirst(clean)].flatMap(apos));
  } else {
    const noArt = de.trim().replace(/^(der|die|das)\s+/, '');
    const bare = noArt.replace(/^sich\s+/, '');
    clean = cleanOf(bare);
    whole = /\s/.test(noArt)
      ? uniq([noArt, bare, noArt.replace(/\s*\.\.\.\s*/g, ' … '), clean])
      : [bare];
  }
  const words = clean.split(' ').filter(Boolean);
  const tokens = words.length > 1
    ? words.map((w, i) => uniq((i === 0 ? [w, lowerFirst(w)] : [w]).flatMap(apos)))
    : null;
  return { whole, tokens };
}

export function planTitles(plan) {
  return uniq([...plan.whole, ...(plan.tokens || []).flat()]);
}

// get(title) -> { ipa, audio } | null. Повертає { ipa, audio, composed? }.
export function resolve(plan, get) {
  let audio = null;
  for (const t of plan.whole) {
    const p = get(t);
    if (!p) continue;
    audio ??= p.audio || null;
    if (p.ipa) return { ipa: p.ipa, audio: p.audio || audio };
  }
  if (plan.tokens) {
    const parts = [];
    for (const cands of plan.tokens) {
      let found = null;
      for (const t of cands) { const p = get(t); if (p && p.ipa) { found = p.ipa; break; } }
      if (!found) return { ipa: null, audio, missing: cands[0] };
      parts.push(found);
    }
    return { ipa: parts.join(' '), audio, composed: true };
  }
  return { ipa: null, audio };
}

// Завантажує сторінки пачками по 50. fetchJson(url) -> Promise<object>.
export async function fetchPages(titles, fetchJson, onProgress) {
  const out = new Map();
  for (let i = 0; i < titles.length; i += 50) {
    const batch = titles.slice(i, i + 50);
    const base = `${WIKT_API}?action=query&format=json&formatversion=2&prop=revisions&rvprop=content&rvslots=main&redirects=1&origin=*&titles=${encodeURIComponent(batch.join('|'))}`;
    const alias = new Map(batch.map(t => [t, t]));
    const content = new Map();
    let cont = null;
    do {
      const url = cont ? base + '&' + new URLSearchParams(cont) : base;
      const j = await fetchJson(url);
      const q = j.query || {};
      for (const n of q.normalized || []) for (const [k, v] of alias) if (v === n.from) alias.set(k, n.to);
      for (const r of q.redirects || []) for (const [k, v] of alias) if (v === r.from) alias.set(k, r.to);
      for (const p of q.pages || []) {
        const wt = p.revisions && p.revisions[0] && p.revisions[0].slots && p.revisions[0].slots.main.content;
        if (wt) content.set(p.title, wt);
      }
      cont = j.continue || null;
    } while (cont);
    for (const [t, final] of alias) {
      const wt = content.get(final);
      out.set(t, wt ? parsePage(wt) : null);
    }
    onProgress && onProgress(Math.min(i + 50, titles.length), titles.length);
  }
  return out;
}

// Для файлів Commons ("De-Hund.ogg") повертає Map файл -> URL mp3 (iPhone не завжди грає ogg).
export async function fetchAudioUrls(files, fetchJson) {
  const out = new Map();
  for (let i = 0; i < files.length; i += 50) {
    const batch = files.slice(i, i + 50);
    const url = `${COMMONS_API}?action=query&format=json&formatversion=2&prop=videoinfo&viprop=derivatives&origin=*&titles=${encodeURIComponent(batch.map(f => 'File:' + f).join('|'))}`;
    const j = await fetchJson(url);
    const q = j.query || {};
    const alias = new Map(batch.map(f => ['File:' + f, f]));
    for (const n of q.normalized || []) if (alias.has(n.from)) { alias.set(n.to, alias.get(n.from)); }
    for (const p of q.pages || []) {
      const file = alias.get(p.title);
      if (!file) continue;
      const ders = (p.videoinfo && p.videoinfo[0] && p.videoinfo[0].derivatives) || [];
      const mp3 = ders.find(d => /^audio\/mpeg/.test(d.type));
      if (mp3 && /^https:\/\/upload\.wikimedia\.org\//.test(mp3.src)) out.set(file, mp3.src.split('?')[0]);
    }
  }
  return out;
}

// Коротка форма URL аудіо для зберігання у словнику.
export const shortAudio = url => url && url.startsWith(AUDIO_BASE) ? url.slice(AUDIO_BASE.length) : url;
export const fullAudio = au => !au ? '' : /^https?:/.test(au) ? au : AUDIO_BASE + au;

// Пошук для одного запису (використовує редактор у застосунку).
export async function lookupEntry(de, phrase, fetchJson) {
  const plan = planLookup(de, phrase);
  const pages = await fetchPages(planTitles(plan), fetchJson);
  const r = resolve(plan, t => pages.get(t));
  let audioUrl = '';
  if (r.audio) {
    const m = await fetchAudioUrls([r.audio], fetchJson);
    audioUrl = m.get(r.audio) || '';
  }
  return { ipa: r.ipa || '', audio: audioUrl, composed: !!r.composed, missing: r.missing || '' };
}
