// Логіка гри «Кристали» (три в ряд) без DOM, щоб її можна було перевіряти окремо.
// Клітинка: null | { id, t: 'g' (кристал) | 's' (камінь), c: колір 0..5, ch: заряджений, q: кристал-питання }.
// Поле: grid[y][x], y = 0 — верхній ряд.

export const W = 8, H = 8, COLORS = 6;
export const RADIUS = 2;   // вибух зарядженого кристала: квадрат 5×5

const isGem = c => !!c && c.t === 'g';
const key = (x, y) => y * W + x;
const xy = k => [k % W, Math.floor(k / W)];
const rnd = (rng, n) => Math.floor(rng() * n);

export function newBoard(rng = Math.random, { stones = 4, qGems = 1 } = {}) {
  const b = { grid: [], next: 1 };
  for (let y = 0; y < H; y++) {
    const row = [];
    b.grid.push(row);
    for (let x = 0; x < W; x++) {
      let c;
      // Без готових трійок на старті.
      do c = rnd(rng, COLORS);
      while ((x >= 2 && row[x - 1].c === c && row[x - 2].c === c) || (y >= 2 && b.grid[y - 1][x].c === c && b.grid[y - 2][x].c === c));
      row.push({ id: b.next++, t: 'g', c });
    }
  }
  const spots = shuffled(rng, [...Array(W * H).keys()]);
  for (const k of spots.splice(0, stones)) { const [x, y] = xy(k); b.grid[y][x] = { id: b.next++, t: 's' }; }
  for (const k of spots.splice(0, qGems)) { const [x, y] = xy(k); b.grid[y][x].q = true; }
  return b;
}

function shuffled(rng, a) {
  for (let i = a.length - 1; i > 0; i--) { const j = rnd(rng, i + 1); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

export const adjacent = ([ax, ay], [bx, by]) => Math.abs(ax - bx) + Math.abs(ay - by) === 1;
// Міняти можна будь-які два сусідні кристали, навіть якщо комбінації не буде. Камені не рухаються.
export const canSwap = (b, p, q) => adjacent(p, q) && isGem(b.grid[p[1]][p[0]]) && isGem(b.grid[q[1]][q[0]]);
export function swap(b, [ax, ay], [bx, by]) {
  const g = b.grid;
  [g[ay][ax], g[by][bx]] = [g[by][bx], g[ay][ax]];
}

// Групи однакових кристалів: ряди від 3 по горизонталі й вертикалі; ряди зі спільною клітинкою (L, T) — одна група.
export function findGroups(grid) {
  const runs = [];
  const scan = (len, at) => {
    for (let i = 0; i < len; i++) {
      let start = 0;
      for (let j = 1; j <= len; j++) {
        const a = at(i, start), c = j < len ? at(i, j) : null;
        if (j < len && isGem(a) && isGem(c) && a.c === c.c) continue;
        if (j - start >= 3 && isGem(a)) runs.push(Array.from({ length: j - start }, (_, n) => at.key(i, start + n)));
        start = j;
      }
    }
  };
  const rows = (i, j) => grid[i][j]; rows.key = (i, j) => key(j, i);
  const cols = (i, j) => grid[j][i]; cols.key = (i, j) => key(i, j);
  scan(H, rows);
  scan(W, cols);

  const parent = runs.map((_, i) => i);
  const find = i => parent[i] === i ? i : (parent[i] = find(parent[i]));
  const owner = new Map();
  runs.forEach((r, i) => r.forEach(k => { if (owner.has(k)) parent[find(i)] = find(owner.get(k)); else owner.set(k, i); }));
  const groups = new Map();
  runs.forEach((r, i) => {
    const root = find(i);
    if (!groups.has(root)) groups.set(root, { cells: new Set(), runs: [] });
    const g = groups.get(root);
    r.forEach(k => g.cells.add(k));
    g.runs.push(r);
  });
  return [...groups.values()].map(g => {
    const longest = g.runs.reduce((a, r) => r.length > a.length ? r : a);
    const [x, y] = xy(longest[0]);
    return { cells: [...g.cells], c: grid[y][x].c, longest };
  });
}

// Що зникне цього кроку. focus — клітинки щойно зробленого ходу: там з’явиться заряджений кристал.
// Повертає null, якщо збігів немає. Поле не змінює.
export function analyze(b, focus = null) {
  const g = b.grid;
  const groups = findGroups(g);
  if (!groups.length) return null;
  const at = k => { const [x, y] = xy(k); return g[y][x]; };
  const clear = new Set();
  const creates = [];
  for (const gr of groups) {
    gr.cells.forEach(k => clear.add(k));
    if (gr.longest.length >= 4) {
      const f = focus && focus.map(([x, y]) => key(x, y)).find(k => gr.cells.includes(k));
      creates.push({ k: f ?? gr.longest[Math.floor(gr.longest.length / 2)], c: gr.c });
    }
  }
  // Заряджені кристали у збігу вибухають.
  const booms = explode(g, clear, [...clear].filter(k => at(k).ch));
  return result(g, clear, booms, creates);
}

// Куплена вибухівка: вибух 5×5 у будь-якій клітинці (так само зачіпає заряджені — ланцюжок).
export function blast(b, [x, y]) {
  const clear = new Set();
  const booms = explode(b.grid, clear, [key(x, y)]);
  return result(b.grid, clear, booms, []);
}

// Вибухи 5×5 від клітинок starts; заряджені кристали в зоні теж вибухають — ланцюжок.
function explode(g, clear, starts) {
  const booms = [];
  const queue = starts.slice();
  const done = new Set();
  while (queue.length) {
    const k = queue.shift();
    if (done.has(k)) continue;
    done.add(k);
    booms.push(k);
    const [cx, cy] = xy(k);
    for (let y = Math.max(0, cy - RADIUS); y <= Math.min(H - 1, cy + RADIUS); y++) {
      for (let x = Math.max(0, cx - RADIUS); x <= Math.min(W - 1, cx + RADIUS); x++) {
        const c = g[y][x];
        if (!c) continue;
        clear.add(key(x, y));
        if (c.ch && !done.has(key(x, y))) queue.push(key(x, y));
      }
    }
  }
  return booms;
}

function result(g, clear, booms, creates) {
  let gems = 0, stones = 0, q = 0;
  for (const k of clear) {
    const [x, y] = xy(k), c = g[y][x];
    if (c.t === 's') stones++; else gems++;
    if (c.q) q++;
  }
  const score = gems * 10 + stones * 40 + booms.length * 50 + creates.length * 30;
  return { clear: [...clear].map(xy), booms: booms.map(xy), creates: creates.map(({ k, c }) => ({ at: xy(k), c })), gems, stones, q, score };
}

// Прибирає клітинки, ставить заряджені кристали, опускає все донизу й досипає нові згори.
// Повертає fresh: id нового кристала → з якого ряду (від’ємного, над полем) він падає.
export function apply(b, res, rng = Math.random, { stoneChance = 0.025, maxStones = 8, qChance = 0.04, maxQ = 2, minQ = 0 } = {}) {
  const g = b.grid;
  for (const [x, y] of res.clear) g[y][x] = null;
  for (const { at: [x, y], c } of res.creates) g[y][x] = { id: b.next++, t: 'g', c, ch: true };
  let stones = 0, qs = 0;
  for (const row of g) for (const c of row) { if (c && c.t === 's') stones++; if (c && c.q) qs++; }
  const fresh = new Map();
  for (let x = 0; x < W; x++) {
    let write = H - 1;
    for (let y = H - 1; y >= 0; y--) {
      if (!g[y][x]) continue;
      if (y !== write) { g[write][x] = g[y][x]; g[y][x] = null; }
      write--;
    }
    const n = write + 1;
    for (let y = write; y >= 0; y--) {
      let c;
      if (stones < maxStones && rng() < stoneChance) { c = { id: b.next++, t: 's' }; stones++; }
      else {
        c = { id: b.next++, t: 'g', c: rnd(rng, COLORS) };
        if (qs < maxQ && rng() < qChance) { c.q = true; qs++; }
      }
      g[y][x] = c;
      fresh.set(c.id, y - n);
    }
  }
  // Щоб кристал-питання на полі був завжди (якщо так налаштовано).
  if (qs < minQ) {
    const pool = [];
    for (const row of g) for (const c of row) if (isGem(c) && !c.q && !c.ch) pool.push(c);
    const pick = pool.filter(c => fresh.has(c.id));
    const c = (pick.length ? pick : pool)[rnd(rng, (pick.length ? pick : pool).length)];
    if (c) c.q = true;
  }
  return fresh;
}

// Збереження: поле — звичайний JSON. Перевіряємо, що це справді поле потрібного розміру.
export function validBoard(b) {
  return !!b && Number.isInteger(b.next) && Array.isArray(b.grid) && b.grid.length === H &&
    b.grid.every(r => Array.isArray(r) && r.length === W && r.every(c => c && Number.isInteger(c.id) && (c.t === 's' || (c.t === 'g' && Number.isInteger(c.c) && c.c >= 0 && c.c < COLORS))));
}
