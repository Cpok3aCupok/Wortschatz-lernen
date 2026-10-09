// Перевірка введеної відповіді німецькою.

export function normalize(s) {
  return String(s || '')
    .normalize('NFC')
    .replace(/[’‘`´]/g, "'")
    .replace(/[.!?,;:„“"«»]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
// ä → ae тощо, щоб розпізнати написання без умлаутів.
export function fold(s) {
  return normalize(s).toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .replace(/'/g, '');
}

// Відстань редагування; перестановка двох сусідніх літер рахується як одна помилка.
export function lev(a, b) {
  if (a === b) return 0;
  const m = a.length, n = b.length;
  if (!m) return n;
  if (!n) return m;
  const d = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 1; j <= n; j++) d[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  }
  return d[m][n];
}

// result: 'ok' | 'almost' | 'wrong' | 'empty'; note — пояснення.
export function check(answer, e, { requireArticle = true } = {}) {
  const a = normalize(answer);
  if (!a) return { result: 'empty' };
  const targets = [e.de];
  if ((e.art || e.plOnly) && !requireArticle) targets.push(e.bare);
  const nt = targets.map(normalize);

  if (nt.includes(a)) return { result: 'ok' };
  if (nt.some(t => t.toLowerCase() === a.toLowerCase())) {
    return { result: 'ok', note: 'Зверніть увагу на великі й малі літери: ' + e.de };
  }
  if (nt.some(t => fold(t) === fold(a))) {
    const hasUml = /[äöüßÄÖÜ]/.test(e.de);
    return { result: 'ok', note: hasUml ? 'Краще писати ä, ö, ü, ß, а не ae, oe, ue, ss' : 'Перевірте написання: ' + e.de };
  }
  const art = e.art || (e.plOnly ? 'die' : '');
  if (art) {
    const m = /^(der|die|das)\s+(.+)$/i.exec(a);
    if (m && fold(m[2]) === fold(e.bare) && m[1].toLowerCase() !== art) {
      return { result: 'wrong', note: `Неправильний артикль — правильно «${art}»` };
    }
    if (!m && requireArticle && fold(a) === fold(e.bare)) {
      return { result: 'wrong', note: `Не забудьте артикль: ${e.de}` };
    }
  }
  const fa = fold(a);
  const best = Math.min(...nt.map(t => lev(fa, fold(t))));
  const len = normalize(e.de).length;
  const allowed = len >= 10 ? 2 : len >= 5 ? 1 : 0;
  if (best <= allowed) return { result: 'almost', note: 'Майже! Схоже на опечатку' };
  return { result: 'wrong' };
}
