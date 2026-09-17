/** Candy Crush–style match-3 board logic (no DOM). */
export const COLS = 8;
export const ROWS = 8;
export const TYPES = 6;

export function createBoard() {
  const grid = [];
  for (let r = 0; r < ROWS; r++) {
    grid[r] = [];
    for (let c = 0; c < COLS; c++) {
      grid[r][c] = randomType(grid, r, c);
    }
  }
  while (findMatchGroups(grid).length) {
    resolveRandom(grid);
  }
  return grid;
}

export function randomType(grid, r, c) {
  let t;
  let guard = 0;
  do {
    t = Math.floor(Math.random() * TYPES);
    guard++;
  } while (
    guard < 50 &&
    ((c >= 2 && grid[r][c - 1] === t && grid[r][c - 2] === t) ||
      (r >= 2 && grid[r - 1]?.[c] === t && grid[r - 2]?.[c] === t))
  );
  return t;
}

function resolveRandom(grid) {
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (isCellMatched(grid, r, c)) grid[r][c] = randomType(grid, r, c);
    }
  }
}

function isCellMatched(grid, r, c) {
  const t = grid[r][c];
  if (t == null) return false;
  if (c >= 2 && grid[r][c - 1] === t && grid[r][c - 2] === t) return true;
  if (c <= COLS - 3 && grid[r][c + 1] === t && grid[r][c + 2] === t) return true;
  if (r >= 2 && grid[r - 1][c] === t && grid[r - 2][c] === t) return true;
  if (r <= ROWS - 3 && grid[r + 1][c] === t && grid[r + 2][c] === t) return true;
  return false;
}

/** All cells that participate in any line of 3+ */
export function getMatchedCells(grid) {
  const set = new Set();
  for (let r = 0; r < ROWS; r++) {
    let run = 1;
    for (let c = 1; c <= COLS; c++) {
      if (c < COLS && grid[r][c] != null && grid[r][c] === grid[r][c - 1]) {
        run++;
      } else {
        if (run >= 3) {
          for (let k = 0; k < run; k++) set.add(`${r},${c - 1 - k}`);
        }
        run = 1;
      }
    }
  }
  for (let c = 0; c < COLS; c++) {
    let run = 1;
    for (let r = 1; r <= ROWS; r++) {
      if (r < ROWS && grid[r][c] != null && grid[r][c] === grid[r - 1][c]) {
        run++;
      } else {
        if (run >= 3) {
          for (let k = 0; k < run; k++) set.add(`${r - 1 - k},${c}`);
        }
        run = 1;
      }
    }
  }
  return [...set].map((s) => s.split(',').map(Number));
}

/** Connected clusters among matched cells (same candy type, adjacent). */
export function findMatchGroups(grid) {
  const cells = getMatchedCells(grid);
  if (!cells.length) return [];
  const cellSet = new Set(cells.map(([r, c]) => `${r},${c}`));
  const visited = new Set();
  const groups = [];

  for (const [r, c] of cells) {
    const key = `${r},${c}`;
    if (visited.has(key)) continue;
    const type = grid[r][c];
    const cluster = [];
    const queue = [[r, c]];
    visited.add(key);
    while (queue.length) {
      const [cr, cc] = queue.shift();
      cluster.push({ r: cr, c: cc, type });
      for (const [nr, nc] of [
        [cr - 1, cc],
        [cr + 1, cc],
        [cr, cc - 1],
        [cr, cc + 1],
      ]) {
        const nk = `${nr},${nc}`;
        if (nr < 0 || nr >= ROWS || nc < 0 || nc >= COLS) continue;
        if (!cellSet.has(nk) || visited.has(nk) || grid[nr][nc] !== type) continue;
        visited.add(nk);
        queue.push([nr, nc]);
      }
    }
    groups.push(cluster);
  }
  return groups;
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
          moves.push({ fromR: r, fromC: c, toR: write, toC: c, type: grid[r][c] });
          grid[write][c] = grid[r][c];
          grid[r][c] = null;
        }
        write--;
      }
    }
    for (let r = write; r >= 0; r--) {
      const t = randomType(grid, r, c);
      grid[r][c] = t;
      moves.push({ fromR: -1, fromC: c, toR: r, toC: c, type: t, spawn: true });
    }
  }
  return moves;
}

export function clearClusters(grid, groups) {
  for (const g of groups) {
    for (const { r, c } of g) grid[r][c] = null;
  }
}

export function clusterCenter(cluster) {
  const r = cluster.reduce((s, p) => s + p.r, 0) / cluster.length;
  const c = cluster.reduce((s, p) => s + p.c, 0) / cluster.length;
  return { r, c, type: cluster[0].type };
}
