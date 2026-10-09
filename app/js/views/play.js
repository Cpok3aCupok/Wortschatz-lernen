// Екран тренування: обирає режим і передає йому список слів.
import { h, icon, setTopbar, setKeys, empty } from '../ui.js';
import * as S from '../store.js';
import * as learn from '../modes/learn.js';
import * as cards from '../modes/cards.js';
import * as write from '../modes/write.js';
import * as match from '../modes/match.js';
import * as listen from '../modes/listen.js';
import * as articles from '../modes/articles.js';

const MODES = { learn, cards, write, match, listen, articles };

export function render(root, [mode], params) {
  const M = MODES[mode] || learn;
  const fromDue = params.get('src') === 'due';
  let list = fromDue ? S.dueList() : S.filterEntries();
  if (M.filter) list = list.filter(M.filter);

  const bar = h('i');
  const pbar = h('div', { class: 'pbar', style: { visibility: 'hidden' } }, bar);
  const count = h('span', { class: 'tb-count' });
  setTopbar({
    left: h('a', { class: 'icon-btn', href: '#/', 'aria-label': 'Закрити' }, icon('close', 24)),
    center: pbar,
    right: count,
  });

  const timers = new Set();
  let alive = true;
  const ctx = {
    selKey: fromDue ? 'due' : [S.sel.lv.slice().sort().join(','), S.sel.kind, S.sel.topic, S.sel.status].join('|'),
    later(fn, ms) {
      const t = setTimeout(() => { timers.delete(t); if (alive) fn(); }, ms);
      timers.add(t);
      return t;
    },
    clear(t) { clearTimeout(t); timers.delete(t); },
    progress(frac, label = '') {
      if (frac == null) { pbar.style.visibility = 'hidden'; count.textContent = ''; return; }
      pbar.style.visibility = 'visible';
      bar.style.width = Math.max(0, Math.min(1, frac)) * 100 + '%';
      count.textContent = label;
    },
    exit() { location.hash = '#/'; },
  };

  if (!list.length) {
    root.append(empty(mode === 'articles' ? 'У вибраному наборі немає іменників з артиклем.' : 'У вибраному наборі немає слів.', 'Змінити набір', '#/'));
  } else {
    M.run(root, list, ctx);
  }
  return () => { alive = false; timers.forEach(clearTimeout); setKeys(null); };
}
