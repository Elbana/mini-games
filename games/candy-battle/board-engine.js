/** Candy Crush–style board with specials, cascades, color wipes. */
export const COLS = 7;
export const ROWS = 7;
export const COLORS = 6;

export const ENERGY = 10;
export const BUYIN = 11;
export const WRAPPED = 12;
export const STRIPE_H = 100;
export const STRIPE_V = 200;

export function isNormal(v) {
  return v >= 0 && v < COLORS;
}
export function colorOf(v) {
  if (isNormal(v)) return v;
  if (v >= STRIPE_H && v < STRIPE_H + COLORS) return v - STRIPE_H;
  if (v >= STRIPE_V && v < STRIPE_V + COLORS) return v - STRIPE_V;
  return null;
}
export function isEnergy(v) {
  return v === ENERGY;
}
export function isBuyin(v) {
  return v === BUYIN;
}
export function isWrapped(v) {
  return v === WRAPPED;
}
export function isStripe(v) {
  return v >= STRIPE_H && v < STRIPE_V + COLORS;
}
export function isSpecial(v) {
  return isEnergy(v) || isBuyin(v) || isWrapped(v) || isStripe(v);
}

/** Chance a new candy is a special. High enough to matter, low enough that a fight lasts. */
export const TEST_SPECIAL_RATE = 0.08;

export function createBoard() {
  const grid = emptyGrid();
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      grid[r][c] = randomCandy(grid, r, c);
    }
  }
  while (findTurnResult(grid).groups.length) {
    fixBoard(grid);
  }
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (isBuyin(grid[r][c])) grid[r][c] = randomCandy(grid, r, c);
    }
  }
  return grid;
}

function rollForcedSpecial() {
  const roll = Math.random();
  if (roll < 0.35) return ENERGY;
  if (roll < 0.65) return WRAPPED;
  const color = Math.floor(Math.random() * COLORS);
  return Math.random() < 0.5 ? STRIPE_H + color : STRIPE_V + color;
}

function rollTestSpecial() {
  if (Math.random() > TEST_SPECIAL_RATE) return null;
  return rollForcedSpecial();
}

/** Place a few specials on the board so FX can be tested quickly. */
export function seedTestSpecials(grid, count = 4) {
  let placed = 0;
  let guard = 0;
  while (placed < count && guard++ < 300) {
    const r = Math.floor(Math.random() * ROWS);
    const c = Math.floor(Math.random() * COLS);
    const prev = grid[r][c];
    grid[r][c] = rollForcedSpecial();
    if (!findTurnResult(grid).groups.length) {
      placed++;
    } else {
      grid[r][c] = prev;
    }
  }
}

function emptyGrid() {
  return Array.from({ length: ROWS }, () => Array(COLS).fill(null));
}

export function randomCandy(grid, r, c) {
  const testSpecial = rollTestSpecial();
  if (testSpecial != null) return testSpecial;
  let t;
  let guard = 0;
  do {
    t = Math.floor(Math.random() * COLORS);
    guard++;
  } while (
    guard < 40 &&
    ((c >= 2 && sameMatchColor(grid[r][c - 1], t) && sameMatchColor(grid[r][c - 2], t)) ||
      (r >= 2 && sameMatchColor(grid[r - 1][c], t) && sameMatchColor(grid[r - 2][c], t)))
  );
  return t;
}

function sameMatchColor(cell, color) {
  if (cell == null) return false;
  if (isNormal(cell)) return cell === color;
  if (isEnergy(cell) || isBuyin(cell) || isWrapped(cell)) return false;
  return colorOf(cell) === color;
}

function fixBoard(grid) {
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (cellInMatch(grid, r, c)) grid[r][c] = randomCandy(grid, r, c);
    }
  }
}

function cellInMatch(grid, r, c) {
  return findTurnResult(grid).groups.some((g) => g.cells.some((p) => p.r === r && p.c === c));
}

/** Valid swap: the moved candies join a match, or a special is activated. */
export function isValidSwap(grid, r0, c0, r1, c1) {
  swapCells(grid, r0, c0, r1, c1);
  const touched = findTurnResult(grid, {
    includeSpecialLines: true,
    swap: { r0, c0, r1, c1 },
  }).groups.some((g) => g.cells.some((p) =>
    (p.r === r0 && p.c === c0) || (p.r === r1 && p.c === c1)));
  swapCells(grid, r0, c0, r1, c1);
  if (touched) return true;
  return canActivateBySwap(grid[r0][c0], grid[r1][c1]);
}

function canActivateBySwap(v0, v1) {
  if (isEnergy(v0) || isEnergy(v1)) return true;
  if (isWrapped(v0) || isWrapped(v1)) return true;
  if (isStripe(v0) || isStripe(v1)) return true;
  return false;
}

function colorFromPiece(v) {
  if (isNormal(v)) return v;
  if (isStripe(v)) return colorOf(v);
  return null;
}

function addRow(toClear, row) {
  for (let c = 0; c < COLS; c++) toClear.add(`${row},${c}`);
}

function addCol(toClear, col) {
  for (let r = 0; r < ROWS; r++) toClear.add(`${r},${col}`);
}

function addArea(toClear, centerR, centerC, radius) {
  for (let r = centerR - radius; r <= centerR + radius; r++) {
    for (let c = centerC - radius; c <= centerC + radius; c++) {
      if (r >= 0 && r < ROWS && c >= 0 && c < COLS) toClear.add(`${r},${c}`);
    }
  }
}

function expandAreaNew(toClear, centerR, centerC, radius) {
  const added = [];
  for (let r = centerR - radius; r <= centerR + radius; r++) {
    for (let c = centerC - radius; c <= centerC + radius; c++) {
      if (r >= 0 && r < ROWS && c >= 0 && c < COLS) {
        const key = `${r},${c}`;
        if (!toClear.has(key)) {
          toClear.add(key);
          added.push({ r, c });
        }
      }
    }
  }
  return added;
}

function expandRowNew(toClear, row) {
  const added = [];
  for (let c = 0; c < COLS; c++) {
    const key = `${row},${c}`;
    if (!toClear.has(key)) {
      toClear.add(key);
      added.push({ r: row, c });
    }
  }
  return added;
}

function expandColNew(toClear, col) {
  const added = [];
  for (let r = 0; r < ROWS; r++) {
    const key = `${r},${col}`;
    if (!toClear.has(key)) {
      toClear.add(key);
      added.push({ r, c: col });
    }
  }
  return added;
}

/** Color wiped = the candy type matched/swapped with the color ball (not random match color). */
function energyWipeColor(g, grid) {
  const counts = {};
  for (const { r, c } of g.cells) {
    const v = grid[r][c];
    if (isEnergy(v) || isBuyin(v) || isWrapped(v)) continue;
    if (isNormal(v)) counts[v] = (counts[v] || 0) + 1;
    else if (isStripe(v)) {
      const col = colorOf(v);
      counts[col] = (counts[col] || 0) + 1;
    }
  }
  let best = null;
  let max = 0;
  for (const [col, n] of Object.entries(counts)) {
    if (n > max) {
      max = n;
      best = Number(col);
    }
  }
  return best ?? g.color;
}

function addColorWipe(grid, toClear, color) {
  const wiped = [];
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const v = grid[r][c];
      if (v == null) continue;
      if (isNormal(v) && v === color) {
        toClear.add(`${r},${c}`);
        wiped.push({ r, c });
      } else if (isStripe(v) && colorOf(v) === color) {
        toClear.add(`${r},${c}`);
        wiped.push({ r, c });
      }
    }
  }
  return wiped;
}

function addFullBoardWipe(grid, toClear) {
  const wiped = [];
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const v = grid[r][c];
      if (v == null) continue;
      if (isNormal(v) || isStripe(v) || isWrapped(v) || isEnergy(v)) {
        toClear.add(`${r},${c}`);
        wiped.push({ r, c });
      }
    }
  }
  return wiped;
}

function hasEffect(effects, kind, match) {
  return effects.some((e) => e.kind === kind && match(e));
}

/** Horizontal rocket clears its row. Vertical rocket clears its column. Nothing else. */
function stripeAxis(v) {
  if (v >= STRIPE_H && v < STRIPE_H + COLORS) return 'h';
  if (v >= STRIPE_V && v < STRIPE_V + COLORS) return 'v';
  return null;
}

/** Queue a special only when this blast shape covers its cell. */
function enqueueBlastHit(grid, r, c, queue, triggered, step, hintColor) {
  const key = `${r},${c}`;
  if (triggered.has(key)) return;
  const v = grid[r][c];
  if (!isWrapped(v) && !stripeAxis(v) && !isEnergy(v)) return;
  if (queue.some((p) => p.r === r && p.c === c)) return;
  queue.push({ r, c, step, hintColor: hintColor ?? null });
}

function forEachInBlastArea(centerR, centerC, radius, fn) {
  for (let r = centerR - radius; r <= centerR + radius; r++) {
    for (let c = centerC - radius; c <= centerC + radius; c++) {
      if (r >= 0 && r < ROWS && c >= 0 && c < COLS) fn(r, c);
    }
  }
}

function detonateWrapped(grid, r, c, toClear, effects, triggered, queue, big = false, step = 0) {
  const key = `${r},${c}`;
  if (triggered.has(key)) return;
  triggered.add(key);
  toClear.add(key);
  const radius = big ? 2 : 1;
  expandAreaNew(toClear, r, c, radius);
  if (!hasEffect(effects, 'dynamite', (e) => e.row === r && e.col === c)) {
    effects.push({ kind: 'dynamite', row: r, col: c, big, step });
  }
  forEachInBlastArea(r, c, radius, (br, bc) =>
    enqueueBlastHit(grid, br, bc, queue, triggered, step + 1, null),
  );
}

function detonateStripe(grid, r, c, v, toClear, effects, triggered, queue, step = 0) {
  const key = `${r},${c}`;
  if (triggered.has(key)) return;
  const axis = stripeAxis(v);
  if (!axis) return;
  triggered.add(key);
  toClear.add(key);
  const col = colorOf(v) ?? 0;
  if (axis === 'h') {
    if (hasEffect(effects, 'rowBlast', (e) => e.row === r)) return;
    expandRowNew(toClear, r);
    effects.push({ kind: 'rowBlast', row: r, color: col, step });
    for (let bc = 0; bc < COLS; bc++) enqueueBlastHit(grid, r, bc, queue, triggered, step + 1, col);
  } else {
    if (hasEffect(effects, 'colBlast', (e) => e.col === c)) return;
    expandColNew(toClear, c);
    effects.push({ kind: 'colBlast', col: c, color: col, step });
    for (let br = 0; br < ROWS; br++) enqueueBlastHit(grid, br, c, queue, triggered, step + 1, col);
  }
}

/** A blast destroys a color ball it touches. It does not pick a color or launch anything else. */
function detonateEnergyFromBlast(grid, r, c, toClear, effects, triggered) {
  const key = `${r},${c}`;
  if (triggered.has(key)) return;
  triggered.add(key);
  toClear.add(key);
  void effects;
}

function processBlastChainQueue(grid, toClear, effects, triggered, queue) {
  while (queue.length) {
    const { r, c, step = 0, hintColor = null } = queue.shift();
    const v = grid[r][c];
    if (isWrapped(v)) detonateWrapped(grid, r, c, toClear, effects, triggered, queue, false, step);
    else if (stripeAxis(v)) detonateStripe(grid, r, c, v, toClear, effects, triggered, queue, step);
    else if (isEnergy(v)) detonateEnergyFromBlast(grid, r, c, toClear, effects, triggered);
  }
}

/** Activate specials when swapped without forming a match (Candy Crush style). */
export function resolveSwapActivation(grid, r0, c0, r1, c1) {
  const a = { r: r0, c: c0, v: grid[r0][c0] };
  const b = { r: r1, c: c1, v: grid[r1][c1] };
  if (!canActivateBySwap(a.v, b.v)) return null;

  const toClear = new Set([`${a.r},${a.c}`, `${b.r},${b.c}`]);
  const effects = [];
  const triggered = new Set();
  const queue = [];

  if (isEnergy(a.v) && isEnergy(b.v)) {
    const wiped = addFullBoardWipe(grid, toClear);
    effects.push({ kind: 'colorBombDouble', count: wiped.length, origin: a });
    return buildActivation(toClear, effects, grid);
  }

  if (isEnergy(a.v) || isEnergy(b.v)) {
    const bomb = isEnergy(a.v) ? a : b;
    triggered.add(`${bomb.r},${bomb.c}`);
    const other = bomb === a ? b : a;
    const color = colorFromPiece(other.v);
    if (color != null) {
      const wiped = addColorWipe(grid, toClear, color);
      effects.push({
        kind: 'colorWipe',
        color,
        count: wiped.length,
        wiped,
        origin: bomb,
        bonusDmg: Math.min(22, Math.round(wiped.length * 1.2)),
        step: 0,
      });
    }
  } else if (isWrapped(a.v) && isWrapped(b.v)) {
    for (const pos of [a, b]) {
      detonateWrapped(grid, pos.r, pos.c, toClear, effects, triggered, queue, true);
    }
  } else if (isWrapped(a.v) || isWrapped(b.v)) {
    const pos = isWrapped(a.v) ? a : b;
    detonateWrapped(grid, pos.r, pos.c, toClear, effects, triggered, queue, false);
  } else if (isStripe(a.v) && isStripe(b.v)) {
    detonateStripe(grid, a.r, a.c, a.v, toClear, effects, triggered, queue);
    detonateStripe(grid, b.r, b.c, b.v, toClear, effects, triggered, queue);
  } else if (isStripe(a.v) || isStripe(b.v)) {
    const pos = isStripe(a.v) ? a : b;
    detonateStripe(grid, pos.r, pos.c, pos.v, toClear, effects, triggered, queue);
  }

  if (!effects.length) return null;

  processBlastChainQueue(grid, toClear, effects, triggered, queue);

  return buildActivation(toClear, effects, grid);
}

function buildActivation(toClear, effects, grid) {
  const cells = [...toClear].map((s) => {
    const [r, c] = s.split(',').map(Number);
    return { r, c, type: grid[r][c] };
  });
  return { cells, effects, waveMeta: [{ kind: 'swapSpecial', size: cells.length }] };
}

function swapTouchesCells(cells, swap) {
  if (!swap || cells == null) return false;
  const keys = new Set([`${swap.r0},${swap.c0}`, `${swap.r1},${swap.c1}`]);
  return cells.some((p) => keys.has(`${p.r},${p.c}`));
}

export function findTurnResult(grid, opts = {}) {
  const horizontal = scanLines(grid, true);
  const vertical = scanLines(grid, false);
  const squares = scanSquares(grid);
  let specialLines = opts.includeSpecialLines ? scanSpecialLineMatches(grid) : [];
  if (specialLines.length && opts.swap) {
    specialLines = specialLines.filter((run) => swapTouchesCells(run.cells, opts.swap));
  }
  specialLines = specialLines.map((run) => ({ ...run, isSpecialLine: true }));
  const merged = mergeRuns([...horizontal, ...vertical, ...squares, ...specialLines]);

  const groups = [];
  for (const run of merged) {
    if (run.cells.length < 3) continue;
    const dominant = dominantColor(run.cells, grid);
    groups.push({
      cells: run.cells,
      color: dominant,
      size: run.cells.length,
      hasEnergy: run.cells.some(({ r, c }) => isEnergy(grid[r][c])),
      hasStripe: run.cells.some(({ r, c }) => isStripe(grid[r][c])),
      hasWrapped: run.cells.some(({ r, c }) => isWrapped(grid[r][c])),
    });
  }

  return { groups, creates: proposeCreates(groups), effects: [] };
}

function scanSquares(grid) {
  const runs = [];
  for (let r = 0; r < ROWS - 1; r++) {
    for (let c = 0; c < COLS - 1; c++) {
      const v = grid[r][c];
      if (!isNormal(v)) continue;
      if (grid[r][c + 1] === v && grid[r + 1][c] === v && grid[r + 1][c + 1] === v) {
        runs.push({
          cells: [
            { r, c },
            { r, c: c + 1 },
            { r: r + 1, c },
            { r: r + 1, c: c + 1 },
          ],
        });
      }
    }
  }
  return runs;
}

function scanLines(grid, horizontal) {
  const runs = [];
  const primary = horizontal ? ROWS : COLS;
  const secondary = horizontal ? COLS : ROWS;

  for (let i = 0; i < primary; i++) {
    let run = [];
    for (let j = 0; j <= secondary; j++) {
      const r = horizontal ? i : j;
      const c = horizontal ? j : i;
      const v = j < secondary ? grid[r][c] : null;
      if (j < secondary && v != null && canExtendRun(run, v, grid)) {
        run.push({ r, c });
      } else {
        if (run.length >= 3) runs.push({ cells: [...run] });
        run = v != null ? [{ r, c }] : [];
      }
    }
  }
  return runs;
}

function canExtendRun(run, v, grid) {
  if (!run.length) return true;
  const dom = dominantColor(run, grid);
  if (dom == null) return false;
  if (isNormal(v)) return v === dom;
  if (isEnergy(v) || isBuyin(v) || isWrapped(v)) return false;
  if (isStripe(v)) return colorOf(v) === dom;
  return false;
}

/** Color ball only match in a tight line: ball + 2+ same-color candies. */
function scanSpecialLineMatches(grid) {
  const runs = [];

  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (!isEnergy(grid[r][c])) continue;

      let best = null;
      for (const [dr, dc] of [
        [0, 1],
        [1, 0],
      ]) {
        const cells = matchLineThroughSpecial(grid, r, c, dr, dc);
        if (!cells || cells.length < 3) continue;
        const candyCount = cells.filter(({ r: cr, c: cc }) => isNormal(grid[cr][cc]) || isStripe(grid[cr][cc])).length;
        const score = candyCount * 10 + cells.length;
        if (!best || score > best.score) best = { cells, score };
      }
      if (best) runs.push({ cells: best.cells });
    }
  }
  return runs;
}

function matchLineThroughSpecial(grid, r, c, dr, dc) {
  if (!isEnergy(grid[r][c])) return null;

  let best = null;
  for (let color = 0; color < COLORS; color++) {
    const cells = extendLineForColor(grid, r, c, dr, dc, color, isEnergy);
    if (cells.length >= 3 && (!best || cells.length > best.length)) best = cells;
  }
  return best;
}

function extendLineForColor(grid, r, c, dr, dc, color, testSpecial) {
  const inLine = (v) => {
    if (v == null || isWrapped(v)) return false;
    if (testSpecial(v)) return true;
    if (isNormal(v)) return v === color;
    if (isStripe(v)) return colorOf(v) === color;
    return false;
  };

  const cells = [{ r, c }];
  const maxReach = 1;
  for (let step = 1; step <= maxReach; step++) {
    const nr = r - dr * step;
    const nc = c - dc * step;
    if (nr < 0 || nr >= ROWS || nc < 0 || nc >= COLS || !inLine(grid[nr][nc])) break;
    cells.unshift({ r: nr, c: nc });
  }
  for (let step = 1; step <= maxReach; step++) {
    const nr = r + dr * step;
    const nc = c + dc * step;
    if (nr < 0 || nr >= ROWS || nc < 0 || nc >= COLS || !inLine(grid[nr][nc])) break;
    cells.push({ r: nr, c: nc });
  }

  if (cells.length < 3) return [];
  const colorCount = cells.filter(({ r: cr, c: cc }) => {
    const v = grid[cr][cc];
    return (isNormal(v) && v === color) || (isStripe(v) && colorOf(v) === color);
  }).length;
  return colorCount >= 2 ? cells : [];
}

function dominantColor(cells, grid) {
  const counts = {};
  for (const { r, c } of cells) {
    const v = grid[r][c];
    if (isNormal(v)) counts[v] = (counts[v] || 0) + 1;
    else if (isStripe(v)) {
      const col = colorOf(v);
      counts[col] = (counts[col] || 0) + 1;
    }
  }
  let best = null;
  let max = 0;
  for (const [col, n] of Object.entries(counts)) {
    if (n > max) {
      max = n;
      best = Number(col);
    }
  }
  if (best != null) return best;
  if (cells.some(({ r, c }) => isEnergy(grid[r][c]))) return 0;
  return null;
}

function mergeRuns(runs) {
  const out = [];
  for (const run of runs) {
    let merged = false;
    for (const existing of out) {
      if (Boolean(existing.isSpecialLine) !== Boolean(run.isSpecialLine)) continue;
      if (runsOverlap(existing.cells, run.cells)) {
        const map = new Map();
        [...existing.cells, ...run.cells].forEach((p) => map.set(`${p.r},${p.c}`, p));
        existing.cells = [...map.values()];
        merged = true;
        break;
      }
    }
    if (!merged) out.push({ ...run, cells: [...run.cells] });
  }
  return out;
}

function runsOverlap(a, b) {
  const set = new Set(a.map((p) => `${p.r},${p.c}`));
  return b.some((p) => set.has(`${p.r},${p.c}`));
}

function proposeCreates(groups) {
  const creates = [];
  for (const g of groups) {
    if (g.hasEnergy || g.hasStripe || g.hasWrapped) continue;
    const center = g.cells[Math.floor(g.cells.length / 2)];
    if (g.size >= 5) {
      creates.push({ r: center.r, c: center.c, piece: ENERGY });
    } else if (g.size === 4) {
      const sameRow = g.cells.every((p) => p.r === g.cells[0].r);
      const sameCol = g.cells.every((p) => p.c === g.cells[0].c);
      if (sameRow || sameCol) {
        creates.push({
          r: center.r,
          c: center.c,
          piece: sameRow ? STRIPE_H + g.color : STRIPE_V + g.color,
        });
      } else {
        creates.push({ r: center.r, c: center.c, piece: WRAPPED });
      }
    }
  }
  return creates;
}

export function expandEffects(grid, groups, opts = {}) {
  const toClear = new Set();
  const effects = [];
  const triggered = new Set();
  const queue = [];
  const forceBomb = opts.forceBombActivation === true;

  function allowSpecialActivation(g) {
    if (forceBomb) return true;
    if (!opts.allowBombActivation) return false;
    return swapTouchesCells(g.cells, opts.swap);
  }

  for (const g of groups) {
    for (const { r, c } of g.cells) toClear.add(`${r},${c}`);

    for (const { r, c } of g.cells) {
      const v = grid[r][c];
      const key = `${r},${c}`;
      if (triggered.has(key)) continue;

      if (isEnergy(v) && allowSpecialActivation(g)) {
        triggered.add(key);
        const wipeColor = energyWipeColor(g, grid);
        const wiped = addColorWipe(grid, toClear, wipeColor);
        effects.push({
          kind: 'colorWipe',
          color: wipeColor,
          count: wiped.length,
          wiped,
          origin: { r, c },
          bonusDmg: Math.min(22, Math.round(wiped.length * 1.2)),
          step: 0,
        });
      } else if ((isWrapped(v) || stripeAxis(v)) && allowSpecialActivation(g)) {
        queue.push({ r, c, step: 0, hintColor: colorOf(v) });
      }
    }
  }

  processBlastChainQueue(grid, toClear, effects, triggered, queue);

  const cells = [...toClear].map((s) => {
    const [r, c] = s.split(',').map(Number);
    return { r, c, type: grid[r][c] };
  });

  return { cells, effects };
}

export function findMatchGroups(grid) {
  return findTurnResult(grid).groups;
}

export function swapCells(grid, r0, c0, r1, c1) {
  [grid[r0][c0], grid[r1][c1]] = [grid[r1][c1], grid[r0][c0]];
}

export function applyGravity(grid) {
  const moves = [];
  for (let c = 0; c < COLS; c++) {
    let write = ROWS - 1;
    for (let r = ROWS - 1; r >= 0; r--) {
      if (grid[r][c] != null) {
        if (write !== r) {
          moves.push({ fromR: r, fromC: c, toR: write, toC: c, piece: grid[r][c] });
          grid[write][c] = grid[r][c];
          grid[r][c] = null;
        }
        write--;
      }
    }
    for (let r = write; r >= 0; r--) {
      const piece = randomCandy(grid, r, c);
      grid[r][c] = piece;
      moves.push({ fromR: -1, fromC: c, toR: r, toC: c, piece, spawn: true });
    }
  }
  return moves;
}

export function clearCells(grid, cells) {
  for (const { r, c } of cells) grid[r][c] = null;
}

export function applyCreates(grid, creates) {
  for (const { r, c, piece } of creates) {
    grid[r][c] = piece;
  }
}

export function clusterCenter(cells) {
  const r = cells.reduce((s, p) => s + p.r, 0) / cells.length;
  const c = cells.reduce((s, p) => s + p.c, 0) / cells.length;
  const type = cells[0]?.type ?? 0;
  return { r, c, type };
}
