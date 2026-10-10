// Кристали: «три в ряд», де нові ходи заробляються відповідями на питання.
import { h, fill, icon, setKeys, toast, plural } from '../ui.js';
import { settings, gemsData, saveGemsData, getEntry } from '../store.js';
import * as B from './gems-board.js';
import { askOne, moves } from './gems-quiz.js';
import { setupPanel, summary } from './common.js';

// Складність: ходи на старті, каміння (на старті / максимум / шанс появи), кристали «?»,
// ціна вибухівки, ходи за правильну відповідь з 1-ї / 2-ї / 3-ї спроби (або випадково 1…random).
const LEVELS = {
  easy: { start: 25, stones: 3, maxStones: 8, stoneChance: 0.02, qChance: 0.05, maxQ: 2, bomb: 20, reward: [3, 2, 1], random: 3 },
  medium: { start: 20, stones: 6, maxStones: 14, stoneChance: 0.05, qChance: 0.04, maxQ: 2, bomb: 25, reward: [2, 1, 1], random: 2 },
  hard: { start: 15, stones: 10, maxStones: 20, stoneChance: 0.08, qChance: 0.03, maxQ: 1, bomb: 30, reward: [1, 1, 1], random: 1 },
};
const chosenLevel = () => LEVELS[settings.gemsLevel] ? settings.gemsLevel : 'medium';
// Рекорд окремо для кожної складності; старий спільний рекорд — це легка.
const bestOf = (d, id) => Math.max((d.bestBy || {})[id] || 0, id === 'easy' ? d.best || 0 : 0);

const EVERY = 5;          // режим «питання кожні 5 ходів»
const SERIES = 3;         // питань за кристал «?» або за кожні 5 ходів
const MAX_PENDING = 6;    // більше питань підряд не ставимо

const points = n => `${n} ${plural(n, 'очко', 'очки', 'очок')}`;

const SHAPES = [
  '<path d="M50 6 88 38 50 94 12 38z"/>',
  '<circle cx="50" cy="50" r="41"/>',
  '<rect x="11" y="11" width="78" height="78" rx="16"/>',
  '<path d="M50 9 93 87H7z"/>',
  '<path d="M50 5 89 27.5v45L50 95 11 72.5v-45z"/>',
  '<path d="M50 4 62 37h35L69 58l11 35-30-21-30 21 11-35L3 37h35z"/>',
];
const SHINE = '<ellipse cx="44" cy="40" rx="10" ry="5.5" fill="#fff" opacity=".45" transform="rotate(-30 44 40)"/>';
const SPARK = '<path d="M50 24 57 43 76 50 57 57 50 76 43 57 24 50 43 43z" fill="#fff"/>';
const QMARK = '<text x="50" y="67" text-anchor="middle" font-size="50" font-weight="900" font-family="-apple-system, system-ui, sans-serif" fill="#fff" stroke="rgba(0,0,0,.4)" stroke-width="6" paint-order="stroke">?</text>';
const STONE = '<path d="M24 25 48 9 77 17 93 46 83 79 52 93 21 84 7 54z" fill="#8b8f98"/><path d="M38 28 50 47 43 63M61 53 74 61" fill="none" stroke="rgba(0,0,0,.3)" stroke-width="4" stroke-linecap="round"/>';

const sig = c => c.t === 's' ? 's' : `${c.c}${c.ch ? 'z' : ''}${c.q ? 'q' : ''}`;
function svg(c) {
  const body = c.t === 's' ? STONE
    : `<g fill="currentColor" stroke="rgba(0,0,0,.22)" stroke-width="4" stroke-linejoin="round">${SHAPES[c.c]}</g>${SHINE}${c.ch ? SPARK : ''}${c.q ? QMARK : ''}`;
  return `<svg viewBox="0 0 100 100" aria-hidden="true">${body}</svg>`;
}
const cls = c => 'gem ' + (c.t === 's' ? 'stone' : `c${c.c}${c.ch ? ' charged' : ''}${c.q ? ' quest' : ''}`);

export function run(root, list, ctx) {
  const data = gemsData();
  const saved = validSave(data.save) ? data.save : null;
  let st, lv, quiz, busy = false, aiming = false, selected = null;
  let screen, board, els, hudMoves, hudMovesLbl, hudScore, hudBest, hint, bombBtn;

  const rules = h('p', { class: 'small muted', style: { margin: '0' } });
  root.replaceChildren(setupPanel({
    mode: 'gems', count: list.length,
    options: [
      { key: 'gemsLevel', label: 'Складність', choices: [['easy', 'Легка'], ['medium', 'Середня'], ['hard', 'Складна']], onChange: describe },
      { key: 'gemsQ', label: 'Коли питання', choices: [['gem', 'Кристал «?»'], ['moves', `Кожні ${EVERY} ходів`]] },
      { key: 'gemsReward', label: 'Ходи за відповідь', choices: [['tries', 'Залежно від спроби'], ['random', 'Випадково']], onChange: describe },
      { key: 'gemsWrite', label: 'Письмо серед питань', choices: [[true, 'Так'], [false, 'Ні']] },
    ],
    extra: rules,
    startLabel: saved ? 'Нова гра' : 'Почати',
    resume: saved ? { label: `Продовжити: ${points(saved.score)}, ${moves(saved.moves)}`, onClick: () => start(saved) } : null,
    onStart: () => start(null),
  }));
  describe();

  // Правила вибраної складності — під перемикачами.
  function describe() {
    const id = chosenLevel(), L = LEVELS[id], rec = bestOf(gemsData(), id);
    const reward = settings.gemsReward === 'random'
      ? (L.random > 1 ? `випадково від 1 до ${L.random} ходів` : '+1 хід')
      : L.reward[0] === L.reward[2] ? `+${moves(L.reward[0])} незалежно від спроби` : `${L.reward.join(' / ')} ходи з 1-ї / 2-ї / 3-ї спроби`;
    fill(rules,
      `За правильну відповідь — ${reward} (до 3 спроб; у парах — не більше 2 помилок). `,
      `На старті ${moves(L.start)}, каменів ${L.stones} (може стати до ${L.maxStones}). `,
      `Вибухівка за ${moves(L.bomb)} підриває 5×5 у будь-якому місці.`,
      rec ? [' Рекорд: ', h('b', null, points(rec)), '.'] : null);
  }

  const wait = ms => new Promise(res => ctx.later(res, ms));
  const persist = () => saveGemsData({ ...gemsData(), save: st });
  const best = () => Math.max(bestOf(gemsData(), st.level), st.score);

  function start(state) {
    const id = state ? (LEVELS[state.level] ? state.level : 'easy') : chosenLevel();
    lv = LEVELS[id];
    st = state || {
      v: 1, level: id, board: B.newBoard(Math.random, { stones: lv.stones, qGems: settings.gemsQ === 'gem' ? 1 : 0 }),
      moves: lv.start, score: 0, sinceQ: 0, pending: 0, asked: 0, right: 0, missed: [], recent: [],
    };
    st.level = id;
    aiming = false;
    quiz = { list, missed: st.missed, recent: st.recent, lastType: null, level: lv };
    build();
    persist();
    afterMove();
  }

  // ---------- Екран гри ----------
  function build() {
    hudMoves = h('b'); hudMovesLbl = h('span'); hudScore = h('b'); hudBest = h('b');
    hint = h('p', { class: 'center small muted gems-hint' });
    board = h('div', { class: 'gems-board' });
    bombBtn = h('button', { class: 'btn sm block gems-bomb', type: 'button', onclick: toggleBomb });
    els = new Map();
    selected = null;
    screen = h('div', { class: 'gems' },
      h('div', { class: 'today' },
        h('div', null, hudMoves, hudMovesLbl),
        h('div', null, hudScore, h('span', null, 'очки')),
        h('div', null, hudBest, h('span', null, 'рекорд'))),
      board, bombBtn, hint);
    root.replaceChildren(screen);
    setKeys(null);
    sync();
    hud();
    bindInput();
  }

  function hud() {
    hudMoves.textContent = st.moves;
    hudMovesLbl.textContent = plural(st.moves, 'хід', 'ходи', 'ходів');
    hudScore.textContent = st.score;
    hudBest.textContent = best();
    // Вибухівку можна купити, лише якщо після покупки лишиться хоч один хід.
    const canBuy = st.moves > lv.bomb;
    if (aiming && !canBuy) aiming = false;
    bombBtn.replaceChildren(icon('bomb', 18), aiming ? 'Скасувати вибухівку' : `Вибухівка — ${moves(lv.bomb)}`);
    bombBtn.classList.toggle('primary', aiming);
    bombBtn.disabled = busy || !canBuy;
    board.classList.toggle('aim', aiming);
    if (aiming) {
      hint.textContent = 'Торкніться клітинки — там вибухне 5×5. Ламає й камені.';
      ctx.progress(null);
    } else if (settings.gemsQ === 'moves') {
      const n = EVERY - st.sinceQ;
      hint.textContent = `Питання через ${moves(n)}. ✦ — вибух 5×5, камінь ламає лише вибух.`;
      ctx.progress(st.sinceQ / EVERY, '');
    } else {
      hint.textContent = 'Міняйте сусідні кристали. «?» — питання й нові ходи, ✦ — вибух 5×5, камінь ламає лише вибух.';
      ctx.progress(null);
    }
  }

  // Узгоджує кристали на екрані з полем; нові падають згори. Повертає тривалість анімації (мс).
  function sync(fresh = new Map()) {
    const seen = new Set(), anim = [];
    let longest = 0;
    st.board.grid.forEach((row, y) => row.forEach((c, x) => {
      seen.add(c.id);
      let el = els.get(c.id);
      if (!el) {
        el = h('div', null, h('div', { class: 'gi' }));
        els.set(c.id, el);
        place(el, x, fresh.has(c.id) ? fresh.get(c.id) : y);
        board.append(el);
      }
      if (el.dataset.sig !== sig(c)) { el.dataset.sig = sig(c); el.firstChild.innerHTML = svg(c); }
      el.className = cls(c);
      const d = Math.abs(y - Number(el.dataset.y)) + Math.abs(x - Number(el.dataset.x));
      if (d) {
        const ms = Math.round(110 + 45 * d);
        longest = Math.max(longest, ms);
        anim.push([el, x, y, ms]);
      }
    }));
    for (const [id, el] of els) if (!seen.has(id)) { el.remove(); els.delete(id); }
    if (anim.length) {
      void board.offsetWidth;   // нові кристали мають стартувати над полем
      for (const [el, x, y, ms] of anim) { el.style.transitionDuration = ms + 'ms'; place(el, x, y); }
    }
    return longest;
  }
  function place(el, x, y) {
    el.dataset.x = x; el.dataset.y = y;
    el.style.setProperty('--x', x); el.style.setProperty('--y', y);
  }

  function float(text) {
    const el = h('div', { class: 'gems-float' }, text);
    board.append(el);
    ctx.later(() => el.remove(), 900);
  }
  function boom(x, y) {
    const el = h('div', { class: 'boom' });
    el.style.setProperty('--x', x); el.style.setProperty('--y', y);
    board.append(el);
    ctx.later(() => el.remove(), 500);
  }

  // ---------- Керування: дотик до двох сусідніх або свайп ----------
  function bindInput() {
    let drag = null;
    const cellAt = ev => {
      const r = board.getBoundingClientRect();
      const x = Math.floor((ev.clientX - r.left) / r.width * B.W), y = Math.floor((ev.clientY - r.top) / r.height * B.H);
      return x >= 0 && x < B.W && y >= 0 && y < B.H ? [x, y] : null;
    };
    board.addEventListener('pointerdown', ev => {
      if (busy || ev.button > 0) return;
      const p = cellAt(ev);
      if (!p) return;
      drag = { p, x: ev.clientX, y: ev.clientY, id: ev.pointerId };
      try { board.setPointerCapture(ev.pointerId); } catch { /* */ }
    });
    board.addEventListener('pointermove', ev => {
      if (!drag || ev.pointerId !== drag.id || aiming) return;
      const dx = ev.clientX - drag.x, dy = ev.clientY - drag.y;
      if (Math.max(Math.abs(dx), Math.abs(dy)) < board.clientWidth / B.W * 0.4) return;
      const p = drag.p;
      drag = null;
      const q = Math.abs(dx) > Math.abs(dy) ? [p[0] + Math.sign(dx), p[1]] : [p[0], p[1] + Math.sign(dy)];
      if (q[0] >= 0 && q[0] < B.W && q[1] >= 0 && q[1] < B.H) move(p, q);
    });
    board.addEventListener('pointerup', ev => {
      if (!drag || ev.pointerId !== drag.id) return;
      const p = drag.p;
      drag = null;
      tap(p);
    });
    board.addEventListener('pointercancel', () => { drag = null; });
  }

  const cellOf = ([x, y]) => st.board.grid[y][x];
  function select(p) {
    if (selected) els.get(cellOf(selected).id)?.classList.remove('sel');
    selected = p;
    if (p) els.get(cellOf(p).id)?.classList.add('sel');
  }
  function tap(p) {
    if (aiming) { detonate(p); return; }
    const c = cellOf(p);
    if (c.t !== 'g') { select(null); toast('Камінь не рухається — його ламає лише вибух'); return; }
    if (selected && B.adjacent(selected, p)) { const s = selected; select(null); move(s, p); return; }
    select(selected && selected[0] === p[0] && selected[1] === p[1] ? null : p);
  }

  // ---------- Вибухівка ----------
  function toggleBomb() {
    if (busy) return;
    aiming = !aiming && st.moves > lv.bomb;
    select(null);
    hud();
  }
  async function detonate(p) {
    if (busy) return;
    aiming = false;
    setBusy(true);
    st.moves -= lv.bomb;
    hud();
    await step(B.blast(st.board, p), 1);
    await settle(null);
    persist();
    await afterMove();
    setBusy(false);
  }
  function setBusy(v) { busy = v; if (screen.isConnected) hud(); }

  // ---------- Хід ----------
  async function move(p, q) {
    if (busy) return;
    if (!B.canSwap(st.board, p, q)) { select(null); toast('Камінь не рухається — його ламає лише вибух'); return; }
    setBusy(true);
    select(null);
    B.swap(st.board, p, q);
    await wait(sync());
    st.moves--;
    st.sinceQ++;
    hud();
    await settle([p, q]);
    if (settings.gemsQ === 'moves' && st.sinceQ >= EVERY) {
      st.sinceQ = 0;
      st.pending = Math.min(MAX_PENDING, st.pending + SERIES);
    }
    persist();
    await afterMove();
    setBusy(false);
  }

  // Збіги → вибухи → падіння → нові збіги (комбо), доки поле не заспокоїться.
  async function settle(focus) {
    for (let combo = 1; combo <= 50; combo++) {
      const res = B.analyze(st.board, combo === 1 ? focus : null);
      if (!res) return;
      await step(res, combo);
    }
  }
  // Один крок: зникнення й вибухи, потім падіння та нові кристали згори.
  async function step(res, combo) {
    for (const [x, y] of res.clear) els.get(st.board.grid[y][x].id)?.classList.add('gone');
    for (const [x, y] of res.booms) boom(x, y);
    if (combo > 1) float(`Комбо ×${combo}`);
    await wait(res.booms.length ? 330 : 220);
    const spawn = { stoneChance: lv.stoneChance, maxStones: lv.maxStones, qChance: lv.qChance, maxQ: lv.maxQ, minQ: 1 };
    const fresh = B.apply(st.board, res, Math.random, settings.gemsQ === 'gem' ? spawn : { ...spawn, qChance: 0, minQ: 0 });
    st.score += res.score * combo;
    if (res.q) st.pending = Math.min(MAX_PENDING, st.pending + res.q * SERIES);
    hud();
    await wait(sync(fresh) + 30);
  }

  async function afterMove() {
    if (st.pending > 0) await questions();
    if (st.moves <= 0) over();
  }

  // ---------- Питання між ходами ----------
  async function questions() {
    const qroot = h('div');
    root.replaceChildren(qroot);
    ctx.progress(null);
    const total = st.pending;
    let gained = 0;
    for (let i = 1; st.pending > 0; i++) {
      const head = h('div', { class: 'row', style: { margin: '4px 2px 8px' } },
        h('b', { class: 'grow' }, `Питання ${i} з ${total}`),
        h('span', { class: 'muted small' }, 'Ходів: ' + st.moves));
      const r = await askOne(qroot, head, quiz, ctx);
      st.pending--;
      st.asked++;
      if (r.ok) st.right++;
      st.moves += r.reward;
      gained += r.reward;
      for (const id of r.wrong) if (!st.missed.includes(id)) st.missed.push(id);
      persist();
    }
    root.replaceChildren(screen);
    root.scrollTop = 0;
    setKeys(null);
    hud();
    toast(gained ? `+${moves(gained)}` : 'Цього разу без нових ходів');
  }

  function over() {
    const { save, ...data } = gemsData();   // незавершену гру більше не зберігаємо
    const prev = bestOf(data, st.level);
    saveGemsData({ ...data, bestBy: { ...(data.bestBy || {}), [st.level]: Math.max(prev, st.score) } });
    ctx.progress(null);
    summary(root, {
      title: st.score > prev ? 'Новий рекорд!' : 'Ходи закінчились',
      stats: [[st.score, 'очок'], [`${st.right}/${st.asked}`, 'відповідей правильно']],
      missed: st.missed.map(getEntry).filter(Boolean).slice(0, 30),
      buttons: [['Нова гра', () => start(null), 'primary'], ['На головну', () => ctx.exit()]],
    });
  }
}

function validSave(s) {
  return !!s && s.v === 1 && B.validBoard(s.board) && [s.moves, s.score, s.sinceQ, s.pending, s.asked, s.right].every(Number.isFinite)
    && Array.isArray(s.missed) && Array.isArray(s.recent);
}
