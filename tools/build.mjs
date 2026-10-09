// Збирає готовий до публікації застосунок у теку dist/:
//  - копіює app/,
//  - зводить словник data/source/*.txt + data/pronunciation.json у dist/data/dict.json,
//  - малює іконки,
//  - генерує service worker з версією.
//
//   node tools/build.mjs
import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync, cpSync, readdirSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readAllSources } from './lib/source.mjs';
import { renderIconPng } from './lib/icon.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const APP = join(ROOT, 'app');
const DIST = join(ROOT, 'dist');

rmSync(DIST, { recursive: true, force: true });
cpSync(APP, DIST, { recursive: true });

// ---------- Словник ----------
const { entries, warnings } = readAllSources(join(ROOT, 'data', 'source'));
warnings.forEach(w => console.warn('! ' + w));
const pronPath = join(ROOT, 'data', 'pronunciation.json');
const pron = existsSync(pronPath) ? JSON.parse(readFileSync(pronPath, 'utf8')) : {};
let noIpa = 0, noAudio = 0;
const dict = entries.map(e => {
  const p = pron[e.de] || {};
  const o = { ...e };
  if (!o.ipa && p.ipa) o.ipa = p.ipa;
  if (!o.au && p.au) o.au = p.au;
  if (!o.ipa) noIpa++;
  if (!o.au) noAudio++;
  return o;
});
mkdirSync(join(DIST, 'data'), { recursive: true });
writeFileSync(join(DIST, 'data', 'dict.json'), JSON.stringify({
  meta: { built: new Date().toISOString(), count: dict.length },
  entries: dict,
}));

// ---------- Іконки ----------
mkdirSync(join(DIST, 'icons'), { recursive: true });
for (const size of [180, 192, 512, 1024]) {
  writeFileSync(join(DIST, 'icons', `icon-${size}.png`), renderIconPng(size));
}

// ---------- Версія та service worker ----------
function walk(dir) {
  return readdirSync(dir).flatMap(f => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}
const files = walk(DIST).map(p => relative(DIST, p).split(sep).join('/')).sort();
const hash = createHash('sha1');
for (const f of files) hash.update(f).update(readFileSync(join(DIST, f)));
const version = hash.digest('hex').slice(0, 10);

const indexPath = join(DIST, 'index.html');
writeFileSync(indexPath, readFileSync(indexPath, 'utf8').replaceAll('__VERSION__', version));

const precache = ['./', ...files.filter(f => f !== 'icons/icon-1024.png').map(f => './' + f)];
const sw = readFileSync(join(ROOT, 'tools', 'sw.template.js'), 'utf8')
  .replace('__VERSION__', version)
  .replace('__FILES__', JSON.stringify(precache, null, 2));
writeFileSync(join(DIST, 'sw.js'), sw);
writeFileSync(join(DIST, '.nojekyll'), '');

const phrases = dict.filter(e => e.p).length;
const byLevel = {};
for (const e of dict) byLevel[e.lv] = (byLevel[e.lv] || 0) + 1;
console.log(`Зібрано dist/ (версія ${version})`);
console.log(`  записів: ${dict.length} (слів ${dict.length - phrases}, фраз ${phrases}) — ${Object.entries(byLevel).map(([k, v]) => `${k}: ${v}`).join(', ')}`);
console.log(`  без транскрипції: ${noIpa}, без запису вимови: ${noAudio}`);
if (Object.keys(pron).length === 0) console.log('  (data/pronunciation.json порожній — запустіть node tools/enrich.mjs)');
