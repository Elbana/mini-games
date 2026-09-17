/** Candy Crush–style board with specials, cascades, color wipes. */
export const COLS = 8;
export const ROWS = 8;
export const COLORS = 6;

export const ENERGY = 10;
export const BUYIN = 11;
export const STRIPE_H = 100; // + color 0-5
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
export function isStripe(v) {
  return v >= STRIPE_H && v < STRIPE_V + COLORS;
}

export function createBoard(spawnBuyin = false) {
  const grid = emptyGrid();
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      grid[r][c] = randomCandy(grid, r, c);
    }
  }
  while (findTurnResult(grid).groups.length) {
    fixBoard(grid);
  }
  if (spawnBuyin) maybeSpawnBuyin(grid);
  return grid;
}

function emptyGrid() {
  return Array.from({ length: ROWS }, () => Array(COLS).fill(null));
}

export function randomCandy(grid, r, c, buyinChance = 0) {
  if (buyinChance > 0 && Math.random() < buyinChance) return BUYIN;
  if (Math.random() < 0.025) return ENERGY;
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
  if (isEnergy(cell) || isBuyin(cell)) return true;
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

export function maybeSpawnBuyin(grid) {
  const r = Math.floor(Math.random() * ROWS);
  const c = Math.floor(Math.random() * COLS);
  grid[r][c] = BUYIN;
}

/** One cascade step: matches, specials to create, board effects. */
export function findTurnResult(grid) {
  const groups = [];
  const horizontal = scanLines(grid, true);
  const vertical = scanLines(grid, false);
  const merged = mergeRuns([...horizontal, ...vertical]);

  for (const run of merged) {
    if (run.cells.length < 3) continue;
    const dominant = dominantColor(run.cells, grid);
    groups.push({
      cells: run.cells,
      color: dominant,
      size: run.cells.length,
      hasEnergy: run.cells.some(({ r, c }) => isEnergy(grid[r][c])),
      hasBuyin: run.cells.some(({ r, c }) => isBuyin(grid[r][c])),
      hasStripe: run.cells.some(({ r, c }) => isStripe(grid[r][c])),
    });
  }

  return { groups, creates: proposeCreates(groups), effects: [] };
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
  if (isEnergy(v) || isBuyin(v)) return true;
  if (isStripe(v)) return colorOf(v) === dom;
  return false;
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
      if (runsOverlap(existing.cells, run.cells)) {
        const map = new Map();
        [...existing.cells, ...run.cells].forEach((p) => map.set(`${p.r},${p.c}`, p));
        existing.cells = [...map.values()];
        merged = true;
        break;
      }
    }
    if (!merged) out.push(run);
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
    if (g.hasEnergy || g.hasStripe || g.hasBuyin) continue;
    const center = g.cells[Math.floor(g.cells.length / 2)];
    if (g.size >= 5) creates.push({ r: center.r, c: center.c, piece: ENERGY });
    else if (g.size === 4) {
      const horizontal =
        g.cells.every((p) => p.r === g.cells[0].r) ||
        g.cells.filter((p) => p.r === g.cells[0].r).length >= 3;
      creates.push({
        r: center.r,
        c: center.c,
        piece: horizontal ? STRIPE_H + g.color : STRIPE_V + g.color,
      });
    }
  }
  return creates;
}

/** Expand groups with stripe / energy / buyin effects. Returns cells to clear + meta effects. */
export function expandEffects(grid, groups) {
  const toClear = new Set();
  const effects = [];
  const waveMeta = [];

  for (const g of groups) {
    for (const { r, c } of g.cells) toClear.add(`${r},${c}`);

    if (g.hasBuyin) {
      effects.push({ kind: 'buyin', bonus: 2 + Math.min(3, g.size - 3) });
      waveMeta.push({ kind: 'buyin', size: g.size });
    }

    if (g.hasEnergy && g.color != null) {
      const wiped = [];
      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          const v = grid[r][c];
          if (v == null) continue;
          if (isNormal(v) && v === g.color) {
            toClear.add(`${r},${c}`);
            wiped.push({ r, c });
          } else if (isStripe(v) && colorOf(v) === g.color) {
            toClear.add(`${r},${c}`);
            wiped.push({ r, c });
          }
        }
      }
      effects.push({ kind: 'colorWipe', color: g.color, count: wiped.length });
      waveMeta.push({ kind: 'colorWipe', color: g.color, size: wiped.length, bonusDmg: Math.min(22, Math.round(wiped.length * 1.2)) });
    }

    for (const { r, c } of g.cells) {
      const v = grid[r][c];
      if (isStripe(v)) {
        const col = colorOf(v);
        if (v >= STRIPE_H && v < STRIPE_H + COLORS) {
          for (let cc = 0; cc < COLS; cc++) toClear.add(`${r},${cc}`);
          effects.push({ kind: 'rowBlast', row: r, color: col });
        } else {
          for (let rr = 0; rr < ROWS; rr++) toClear.add(`${rr},${c}`);
          effects.push({ kind: 'colBlast', col: c, color: col });
        }
      }
    }

    waveMeta.push({ kind: 'match', size: g.size, color: g.color, combo: 0 });
  }

  const cells = [...toClear].map((s) => {
    const [r, c] = s.split(',').map(Number);
    return { r, c, type: grid[r][c] };
  });

  return { cells, effects, waveMeta };
}

export function findMatchGroups(grid) {
  return findTurnResult(grid).groups;
}

export function swapCells(grid, r0, c0, r1, c1) {
  [grid[r0][c0], grid[r1][c1]] = [grid[r1][c1], grid[r0][c0]];
}

export function applyGravity(grid, buyinChance = 0.06) {
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
      const piece = randomCandy(grid, r, c, buyinChance);
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

export function pieceLabel(v) {
  if (isBuyin(v)) return 'buyin';
  if (isEnergy(v)) return 'energy';
  if (isStripe(v)) return v >= STRIPE_V ? 'stripe-v' : 'stripe-h';
  if (isNormal(v)) return manifestColorName(v);
  return 'candy';
}

function manifestColorName(i) {
  return ['red', 'blue', 'yellow', 'green', 'purple', 'orange'][i] || 'red';
}
