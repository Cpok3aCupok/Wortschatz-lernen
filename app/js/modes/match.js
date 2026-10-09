// Пари: з'єднайте німецьке слово з перекладом на час.
import { h, shuffle, empty } from '../ui.js';
import { bestTime, setBestTime } from '../store.js';
import { setupPanel, summary } from './common.js';

const PAIRS = 6;

export function run(root, list, ctx) {
  const key = 'match:' + ctx.selKey;
  const fmt = ms => (ms / 1000).toFixed(1) + ' с';
  const best = bestTime(key);
  root.replaceChildren(setupPanel({
    mode: 'match', count: list.length,
    extra: best ? h('p', { class: 'center muted', style: { margin: '0' } }, 'Ваш рекорд для цього набору: ', h('b', null, fmt(best))) : null,
    onStart: game,
  }));

  function game() {
    const picks = [];
    const seenUa = new Set(), seenDe = new Set();
    for (const e of shuffle(list)) {
      if (picks.length >= PAIRS) break;
      const u = e.ua.toLowerCase(), d = e.de.toLowerCase();
      if (seenUa.has(u) || seenDe.has(d)) continue;
      seenUa.add(u); seenDe.add(d);
      picks.push(e);
    }
    if (picks.length < 2) { root.replaceChildren(empty('Для гри потрібно хоча б 2 різні слова.', 'На головну', '#/')); return; }

    const tiles = shuffle(picks.flatMap(e => [{ e, side: 'de' }, { e, side: 'ua' }]));
    let sel = null, left = picks.length, penalty = 0, over = false;
    const t0 = performance.now();
    const grid = h('div', { class: 'match-grid' });
    for (const t of tiles) {
      t.el = h('button', { class: 'tile ' + t.side, type: 'button', onclick: () => tap(t) }, t.side === 'de' ? t.e.de : t.e.ua);
      grid.append(t.el);
    }
    root.replaceChildren(h('p', { class: 'center small muted' }, 'Торкніться слова, а потім його перекладу'), grid);

    const elapsed = () => performance.now() - t0 + penalty;
    const tick = () => {
      if (over) return;
      ctx.progress((picks.length - left) / picks.length, fmt(elapsed()));
      ctx.later(tick, 100);
    };
    tick();

    function shake(x) {
      x.el.classList.remove('bad'); void x.el.offsetWidth; x.el.classList.add('bad');
      ctx.later(() => x.el.classList.remove('bad'), 420);
    }
    function tap(t) {
      if (t.done || over) return;
      if (!sel) { sel = t; t.el.classList.add('sel'); return; }
      if (sel === t) { t.el.classList.remove('sel'); sel = null; return; }
      if (sel.side === t.side) { sel.el.classList.remove('sel'); sel = t; t.el.classList.add('sel'); return; }
      const a = sel;
      sel = null;
      a.el.classList.remove('sel');
      if (a.e.id === t.e.id) {
        a.done = t.done = true;
        a.el.classList.add('good'); t.el.classList.add('good');
        ctx.later(() => { a.el.classList.add('gone'); t.el.classList.add('gone'); }, 200);
        if (--left === 0) { over = true; ctx.later(win, 450); }
      } else {
        penalty += 1000;
        shake(a); shake(t);
      }
    }
    function win() {
      const ms = Math.round(elapsed());
      ctx.progress(1, fmt(ms));
      const rec = setBestTime(key, ms);
      summary(root, {
        title: rec ? 'Новий рекорд!' : 'Готово!',
        stats: [[fmt(ms), 'ваш час'], [fmt(bestTime(key)), 'рекорд']],
        buttons: [['Ще раз', game, 'primary'], ['На головну', () => ctx.exit()]],
      });
    }
  }
}
