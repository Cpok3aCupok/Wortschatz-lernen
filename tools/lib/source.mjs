// Читання вихідних файлів словника data/source/*.txt
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

export const LEVEL_ORDER = ['A0', 'A1', 'A2', 'B1', 'B2', 'C1', 'C2'];

export function parseSource(text, level, file) {
  const out = [];
  let topic = 'Інше';
  let phrase = false;
  text.split(/\r?\n/).forEach((raw, i) => {
    const line = raw.trim();
    if (!line || line.startsWith('//')) return;
    if (line.startsWith('#')) {
      const t = line.replace(/^#+\s*/, '');
      phrase = /^Фрази\s*:/i.test(t);
      topic = phrase ? t.replace(/^Фрази\s*:\s*/i, '') : t;
      return;
    }
    const parts = line.split('|').map(s => s.trim());
    let de, f = '', ua, extra = [];
    if (parts.length === 2) [de, ua] = parts;
    else if (parts.length >= 3) [de, f, ua, ...extra] = parts;
    if (!de || !ua) throw new Error(`${file}:${i + 1}: очікується "німецькою | українською": ${line}`);
    const e = { de, ua, lv: level, t: topic };
    if (f) e.f = f;
    if (phrase) e.p = 1;
    for (const x of extra) {
      const m = /^(ipa|ex|exu|au):\s*(.*)$/.exec(x);
      if (!m) throw new Error(`${file}:${i + 1}: невідоме поле "${x}"`);
      e[m[1]] = m[2];
    }
    out.push(e);
  });
  return out;
}

export function readAllSources(dir) {
  const files = readdirSync(dir).filter(f => /\.txt$/i.test(f));
  const level = f => f.replace(/\.txt$/i, '').toUpperCase();
  files.sort((a, b) => {
    const ia = LEVEL_ORDER.indexOf(level(a)), ib = LEVEL_ORDER.indexOf(level(b));
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.localeCompare(b);
  });
  const all = [];
  const seen = new Map();
  const warnings = [];
  for (const f of files) {
    for (const e of parseSource(readFileSync(join(dir, f), 'utf8'), level(f), f)) {
      if (seen.has(e.de)) { warnings.push(`дублікат "${e.de}" у ${f} (вже є в ${seen.get(e.de)}) — пропущено`); continue; }
      seen.set(e.de, f);
      all.push(e);
    }
  }
  return { entries: all, warnings };
}
