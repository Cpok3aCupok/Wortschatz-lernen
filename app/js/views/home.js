// Головний екран: вибір набору слів, режими, прогрес.
import { h, add, icon, setTopbar, seg, words, plural } from '../ui.js';
import * as S from '../store.js';
import { MODES } from '../modes/common.js';
import { filter as articleFilter } from '../modes/articles.js';

const STATUS_LABELS = [
  ['all', 'Усі'], ['new', 'Нові'], ['learning', 'Вчу'], ['due', 'Повторити'], ['hard', 'Важкі'], ['learned', 'Вивчені'],
];

export function render(root) {
  const daily = S.getDaily();
  setTopbar({
    title: 'Wortschatz',
    right: daily.streak ? h('span', { class: 'badge', title: 'Днів поспіль' }, `🔥 ${daily.streak}`) : null,
  });

  const due = S.dueList();
  const modesEl = h('div', { class: 'modes' });
  const selCard = h('section', { class: 'card' });

  function drawSel() {
    const levels = S.levelsPresent();
    const all = S.allEntries();
    const ownN = all.filter(e => e.own).length;
    if (!ownN && S.sel.lv.includes('MY')) S.sel.lv = S.sel.lv.filter(x => x !== 'MY');
    const lvChip = (id, label, n) => h('button', {
      class: 'chip' + (S.sel.lv.includes(id) ? ' on' : ''), type: 'button',
      onclick: () => { const i = S.sel.lv.indexOf(id); if (i >= 0) S.sel.lv.splice(i, 1); else S.sel.lv.push(id); commit(); },
    }, label, h('small', null, n));

    const topics = S.topicsFor();
    if (S.sel.topic && !topics.some(([t]) => t === S.sel.topic)) S.sel.topic = '';
    const topicSel = h('select', { value: S.sel.topic, onchange: ev => { S.sel.topic = ev.target.value; commit(); } },
      h('option', { value: '' }, 'Усі теми'),
      topics.map(([t, n]) => h('option', { value: t }, `${t} (${n})`)));

    const scope = all.filter(e => S.matchesBase(e) && (!S.sel.topic || e.t === S.sel.topic));
    const statusChips = STATUS_LABELS.map(([id, label]) => {
      const n = scope.filter(S.STATUS[id]).length;
      return h('button', {
        class: 'chip' + (S.sel.status === id ? ' on' : ''), type: 'button',
        onclick: () => { S.sel.status = id; commit(); },
      }, label, id !== 'all' ? h('small', null, n) : null);
    });

    const n = S.filterEntries().length;
    selCard.replaceChildren(
      h('div', { class: 'sec-title' }, 'Що вчимо'),
      h('div', { class: 'chips' },
        levels.map(l => lvChip(l, l, all.filter(e => e.lv === l).length)),
        ownN ? lvChip('MY', 'Мої', ownN) : null),
      seg([['all', 'Усе'], ['words', 'Слова'], ['phrases', 'Фрази']], S.sel.kind, v => { S.sel.kind = v; commit(); }),
      h('div', { class: 'field', style: { marginBottom: '12px' } }, topicSel),
      h('div', { class: 'chips small' }, statusChips),
      h('div', { class: 'sel-count' }, 'Вибрано: ', h('b', null, words(n))));
    drawModes();
  }

  function drawModes() {
    const list = S.filterEntries();
    modesEl.replaceChildren(...MODES.map(m => {
      const n = m.id === 'articles' ? list.filter(articleFilter).length : list.length;
      const ok = m.id === 'match' ? n >= 2 : n > 0;
      return h('a', { class: 'mode' + (ok ? '' : ' off'), href: '#/play/' + m.id },
        h('div', { class: 'mi', style: { background: m.color } }, icon(m.icon, 22)),
        h('b', null, m.title),
        h('span', null, m.desc));
    }));
  }

  function commit() { S.saveSel(); drawSel(); }

  drawSel();

  add(root,
    due.length ? h('a', { class: 'due-banner', href: '#/play/learn?src=due' },
      icon('flame', 28),
      h('div', null,
        h('b', null, `${words(due.length)} на повторення`),
        h('span', null, 'Саме час освіжити в пам’яті')),
      h('span', { class: 'go' }, 'Почати')) : null,
    selCard,
    h('div', { class: 'sec-title', style: { margin: '18px 4px 10px' } }, 'Режими'),
    modesEl,
    statsCard(daily),
  );
}

function statsCard(daily) {
  const all = S.allEntries();
  const rows = S.levelsPresent().map(l => {
    const list = all.filter(e => e.lv === l);
    let learned = 0, learning = 0;
    for (const e of list) { const s = S.statusOf(e); if (s === 'learned') learned++; else if (s === 'learning') learning++; }
    const pct = x => (x / list.length * 100).toFixed(1) + '%';
    return h('div', { class: 'lvl-row' },
      h('b', null, l),
      h('div', { class: 'stack' }, h('i', { class: 'l', style: { width: pct(learned) } }), h('i', { class: 'm', style: { width: pct(learning) } })),
      h('span', { class: 'muted small' }, `${learned}/${list.length}`));
  });
  const totalLearned = all.filter(e => S.statusOf(e) === 'learned').length;
  const acc = daily.n ? Math.round(daily.c / daily.n * 100) : 0;
  return h('section', { class: 'card' },
    h('div', { class: 'sec-title' }, 'Прогрес'),
    h('div', { class: 'today' },
      h('div', null, h('b', null, daily.n), h('span', null, plural(daily.n, 'відповідь', 'відповіді', 'відповідей') + ' сьогодні')),
      h('div', null, h('b', null, daily.n ? acc + '%' : '—'), h('span', null, 'правильних')),
      h('div', null, h('b', null, totalLearned), h('span', null, 'вивчено'))),
    rows,
    h('div', { class: 'legend' },
      h('span', null, h('i', { style: { background: 'var(--ok)' } }), 'вивчено'),
      h('span', null, h('i', { style: { background: '#f59e0b' } }), 'вчу'),
      h('span', null, h('i', { style: { background: 'var(--card2)' } }), 'нові')));
}

