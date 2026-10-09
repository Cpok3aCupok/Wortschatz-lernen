// Підтягує транскрипцію (IPA) та записи вимови з німецького Вікісловника
// і Wikimedia Commons для всіх слів у data/source/*.txt.
// Результат: data/pronunciation.json (його треба закомітити).
//
//   node tools/enrich.mjs          — довантажити лише нові слова
//   node tools/enrich.mjs --fresh  — оновити все з нуля
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readAllSources } from './lib/source.mjs';
import { planLookup, planTitles, resolve, fetchPages, fetchAudioUrls, shortAudio } from '../app/js/wikiparse.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = join(ROOT, 'tools', '.cache', 'wiktionary.json');
const OUT = join(ROOT, 'data', 'pronunciation.json');
const fresh = process.argv.includes('--fresh');

const UA = 'DeutschVokabelApp/1.0 (personal vocabulary trainer; Node.js fetch)';
const sleep = ms => new Promise(res => setTimeout(res, ms));
let last = 0;
async function fetchJson(url, tries = 8) {
  for (let i = 1; ; i++) {
    const wait = last + 1500 - Date.now();   // не частіше одного запиту на 1,5 с
    if (wait > 0) await sleep(wait);
    last = Date.now();
    try {
      const r = await fetch(url, { headers: { 'User-Agent': UA, 'Accept': 'application/json' } });
      if (r.status === 429 || r.status >= 500) {
        const ra = Number(r.headers.get('retry-after')) || 0;
        const e = new Error('HTTP ' + r.status); e.retryAfter = ra; throw e;
      }
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return await r.json();
    } catch (e) {
      if (i >= tries) throw e;
      const pause = Math.max((e.retryAfter || 0) * 1000, 5000 * i);
      process.stdout.write(`\n  ${e.message}, пауза ${Math.round(pause / 1000)} с…\n`);
      await sleep(pause);
    }
  }
}

const readJson = (p, d) => existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : d;
const cache = fresh ? { pages: {}, audio: {} } : readJson(CACHE, { pages: {}, audio: {} });
const saveCache = () => { mkdirSync(dirname(CACHE), { recursive: true }); writeFileSync(CACHE, JSON.stringify(cache)); };

const { entries, warnings } = readAllSources(join(ROOT, 'data', 'source'));
warnings.forEach(w => console.warn('! ' + w));

const plans = entries.map(e => ({ e, plan: planLookup(e.de, !!e.p) }));
const titles = [...new Set(plans.flatMap(p => planTitles(p.plan)))].filter(t => !(t in cache.pages));
console.log(`Записів: ${entries.length}. Нових сторінок для запиту: ${titles.length}`);
for (let i = 0; i < titles.length; i += 50) {
  const pages = await fetchPages(titles.slice(i, i + 50), fetchJson);
  for (const [t, v] of pages) cache.pages[t] = v;
  saveCache();   // зберігаємо після кожної пачки, щоб не втратити прогрес
  process.stdout.write(`\r  Вікісловник: ${Math.min(i + 50, titles.length)}/${titles.length}`);
}
if (titles.length) process.stdout.write('\n');

const results = plans.map(({ e, plan }) => ({ e, r: resolve(plan, t => cache.pages[t]) }));
const files = [...new Set(results.map(x => x.r.audio).filter(Boolean))].filter(f => !(f in cache.audio));
if (files.length) {
  console.log(`  Commons: ${files.length} аудіофайлів`);
  const urls = await fetchAudioUrls(files, fetchJson);
  for (const f of files) cache.audio[f] = urls.get(f) || null;
  saveCache();
}

const out = {};
let withIpa = 0, withAudio = 0, composed = 0;
const missing = [];
for (const { e, r } of results) {
  const rec = {};
  if (r.ipa) { rec.ipa = r.ipa; withIpa++; if (r.composed) { rec.c = 1; composed++; } }
  const url = r.audio && cache.audio[r.audio];
  if (url) { rec.au = shortAudio(url); withAudio++; }
  if (!r.ipa) missing.push(e.de + (r.missing ? `  (немає: ${r.missing})` : ''));
  if (rec.ipa || rec.au) out[e.de] = rec;
}
writeFileSync(OUT, JSON.stringify(out, null, 0).replace(/\},"/g, '},\n"') + '\n');
console.log(`Готово: IPA ${withIpa}/${entries.length} (з них складено з окремих слів: ${composed}), аудіо ${withAudio}/${entries.length}`);
if (missing.length) console.log(`Без транскрипції (${missing.length}):\n  ` + missing.join('\n  '));
