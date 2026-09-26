import {
  COLS,
  ROWS,
  COLORS,
  ENERGY,
  WRAPPED,
  STRIPE_H,
  STRIPE_V,
  isNormal,
  isEnergy,
  isWrapped,
  isStripe,
  colorOf,
  createBoard,
  seedTestSpecials,
  findTurnResult,
  expandEffects,
  isValidSwap,
  resolveSwapActivation,
  swapCells,
  clearCells,
  applyGravity,
  applyCreates,
} from './board-engine.js?v=bomb';
import { BoardAnimator } from './animator.js';
import { CandySounds } from './sounds.js';

let config = null;
let manifest = null;
let grid = [];
let selectedLevel = Number(sessionStorage.getItem('candy-level')) || 1;
let toolStock = { bandage: 0, shield: 0, charge: 0 };
let season = null;
let selectedCell = null;
let busy = false;
let starting = false;
let fight = null;
let animator = null;
let sounds = null;

const MONSTER_EMOJI = ['👾', '🦇', '🪨', '🐉', '👑', '😈'];

document.addEventListener('DOMContentLoaded', init);

async function init() {
  document.querySelector('.top-bar a').href = `/?token=${Arcade.token}&player=${Arcade.player}`;
  sounds = new CandySounds();
  setupSoundToggle();
  document.body.addEventListener('pointerdown', () => sounds.unlock(), { once: true });

  manifest = await fetch('/candy-battle/assets/manifest.json?v=clean').then((r) => r.json());
  await Arcade.refreshBalance(document.getElementById('balance'));
  config = await Arcade.get('/api/candy-battle/config');
  renderDiffPicker();
  renderTools();
  showMonster(currentLevel());
  const sell = document.getElementById('result-sell');
  const marketUrl = new URL('/play/market', location.origin);
  marketUrl.searchParams.set('token', Arcade.token);
  marketUrl.searchParams.set('player', Arcade.player);
  if (new URLSearchParams(location.search).get('host')) marketUrl.searchParams.set('host', 'riko');
  sell.href = marketUrl.pathname + marketUrl.search;

  document.getElementById('btn-continue').addEventListener('click', () => {
    document.getElementById('overlay-result').classList.add('hidden');
    startRound(selectedLevel);
  });

  const board = document.getElementById('board');
  board.style.gridTemplateColumns = `repeat(${COLS}, 1fr)`;
  board.style.gridTemplateRows = `repeat(${ROWS}, 1fr)`;
  animator = new BoardAnimator(board, manifest, sounds);
  setupBoardInput(board);
  grid = createBoard();
  renderBoard();

  await refreshState();

  registerArcadeGameShutdown(() => {
    busy = true;
    animator?.destroy?.();
    sounds?.destroy?.();
    if (fight) {
      Arcade.post('/api/candy-battle/abandon', {}).catch(() => {});
      fight = null;
    }
  });
}

let dragStart = null;

function setupSoundToggle() {
  const btn = document.getElementById('btn-sound');
  if (!btn) return;

  const sync = () => {
    const muted = sounds.isMuted();
    btn.textContent = muted ? '🔇' : '🔊';
    btn.setAttribute('aria-pressed', muted ? 'true' : 'false');
    btn.setAttribute('aria-label', muted ? 'Sound off' : 'Sound on');
    btn.title = muted ? 'Turn sound on' : 'Turn sound off';
  };

  sync();
  btn.addEventListener('click', () => {
    sounds.toggleMuted();
    sync();
    if (!sounds.isMuted()) {
      sounds.unlock();
      sounds.play('ui');
    }
  });
}

function setupBoardInput(board) {
  board.addEventListener('pointerdown', (e) => {
    if (busy || !fight?.active || animator?.inputLocked()) return;
    const cell = e.target.closest('.cell');
    if (!cell) return;
    dragStart = {
      r: Number(cell.dataset.r),
      c: Number(cell.dataset.c),
      x: e.clientX,
      y: e.clientY,
      grabbed: false,
    };
    try {
      board.setPointerCapture(e.pointerId);
    } catch (_) {}
  });

  board.addEventListener('pointermove', (e) => {
    if (!dragStart || busy || !fight?.active) return;
    const dx = e.clientX - dragStart.x;
    const dy = e.clientY - dragStart.y;
    if (!dragStart.grabbed) {
      if (Math.hypot(dx, dy) < 6) return;
      dragStart.grabbed = animator.grabPiece(dragStart.r, dragStart.c);
      if (!dragStart.grabbed) return;
    }
    animator.dragPiece(dx, dy);
  });

  board.addEventListener('pointerup', (e) => {
    if (!dragStart || busy || !fight?.active) {
      dragStart = null;
      return;
    }
    const dx = e.clientX - dragStart.x;
    const dy = e.clientY - dragStart.y;
    const dist = Math.hypot(dx, dy);
    const { r: r0, c: c0, grabbed } = dragStart;
    dragStart = null;

    if (dist >= 24) {
      let r1 = r0;
      let c1 = c0;
      if (Math.abs(dx) > Math.abs(dy)) c1 += dx > 0 ? 1 : -1;
      else r1 += dy > 0 ? 1 : -1;
      selectedCell = null;
      highlightSelected();
      if (r1 >= 0 && r1 < ROWS && c1 >= 0 && c1 < COLS) {
        attemptSwap(r0, c0, r1, c1, { fromDrag: grabbed });
      } else if (grabbed) {
        animator.cancelDrag(false);
      }
      return;
    }

    if (grabbed) {
      animator.cancelDrag(false).then(() => {
        if (!busy && fight?.active) onCellTap(r0, c0);
      });
      return;
    }
    onCellTap(r0, c0);
  });

  board.addEventListener('pointercancel', () => {
    const grabbed = dragStart?.grabbed;
    dragStart = null;
    if (grabbed) animator.cancelDrag(false);
  });
}

function levels() {
  return config?.levels?.length
    ? config.levels
    : [1, 2, 3, 4, 5, 6].map((level) => ({
        level,
        name: ['Gummy Slime', 'Jelly Bat', 'Caramel Golem', 'Licorice Dragon', 'Marshmallow King', 'Dark Fudge Titan'][level - 1],
        candyName: level >= 5 ? 'Royal Candy' : level >= 3 ? 'Crystal Candy' : 'Sugar Candy',
        tools: [
          { id: 'bandage', name: 'Bandage', icon: '🩹', packSize: 4, price: 10 * level },
          { id: 'shield', name: 'Shield', icon: '🛡️', packSize: 3, price: 14 * level },
          { id: 'charge', name: 'Charge', icon: '⚡', packSize: 3, price: 18 * level },
        ],
      }));
}

function currentLevel() {
  return levels().find((d) => d.level === selectedLevel) || levels()[0];
}

function renderDiffPicker() {
  const html = levels()
    .map(
      (d) =>
        `<button type="button" class="diff-btn ${d.level === selectedLevel ? 'selected' : ''}" data-level="${d.level}">
          ${MONSTER_EMOJI[d.level - 1] || '👾'} ${d.level}
        </button>`
    )
    .join('');
  for (const id of ['diff-picker', 'result-diff']) {
    const el = document.getElementById(id);
    if (!el) continue;
    el.innerHTML = html;
    el.classList.toggle('locked', id === 'diff-picker' && !!fight?.active);
    el.querySelectorAll('.diff-btn').forEach((btn) => {
      btn.addEventListener('click', () => onPickLevel(Number(btn.dataset.level)));
    });
  }
  renderSeasonLine();
}

function renderSeasonLine() {
  const el = document.getElementById('season-line');
  if (!el) return;
  const lv = currentLevel();
  const s = season || { number: 1, stretchWins: 0, stretchLosses: 0, stretchHaul: {} };
  const candy = haulText(s.stretchHaul);
  el.textContent = `Lv${lv.level} ${lv.name} · season ${s.number} · ${s.stretchWins || 0} wins ${s.stretchLosses || 0} losses${candy ? ` · ${candy}` : ''}`;
}

function haulText(haul) {
  if (!haul) return '';
  const names = { candy_sugar: 'sugar', candy_crystal: 'crystal', candy_royal: 'royal' };
  return Object.entries(haul)
    .filter(([, n]) => n > 0)
    .map(([id, n]) => `${n} ${names[id] || 'candy'}`)
    .join(', ');
}

function renderTools() {
  const row = document.getElementById('tool-row');
  if (!row) return;
  const defs = currentLevel().tools || [];
  row.innerHTML = defs
    .map(
      (t) => `<button type="button" class="tool-btn tool-${t.id}" data-tool="${t.id}">
        <span class="tool-gem">${t.icon}</span>
        <span class="tool-name">${t.name}</span>
        <span class="tool-price"><b>${t.price}</b></span>
      </button>`
    )
    .join('');
  row.querySelectorAll('.tool-btn').forEach((btn) => {
    btn.addEventListener('click', () => useTool(btn.dataset.tool));
  });
}

function showMonster(levelInfo) {
  const level = levelInfo?.level || fight?.level || selectedLevel;
  document.getElementById('monster-name').textContent = fight?.monsterName || levelInfo?.name || 'Monster';
  document.getElementById('monster-sprite').textContent = MONSTER_EMOJI[level - 1] || '👾';
}

function onPickLevel(level) {
  const overlayOpen = !document.getElementById('overlay-result').classList.contains('hidden');
  if (fight?.active && !overlayOpen) {
    Arcade.toast('Finish this fight, then switch level.', 'lose');
    return;
  }
  selectedLevel = level;
  sessionStorage.setItem('candy-level', String(level));
  renderDiffPicker();
  renderTools();
  if (!fight?.active) showMonster(currentLevel());
  if (!overlayOpen) startRound(level);
}

async function refreshState() {
  const st = await Arcade.get('/api/candy-battle/state');
  toolStock = st.tools || toolStock;
  season = st.season || season;
  renderTools();
  renderSeasonLine();
  const active = st.fight?.active ? st.fight : null;
  if (active && active.monsterMaxHp >= 70) {
    resumeFight(active);
    return;
  }
  if (active) {
    await Arcade.post('/api/candy-battle/abandon', {}).catch(() => {});
  }
  await startRound(selectedLevel);
}

function resumeFight(activeFight) {
  fight = activeFight;
  selectedLevel = fight.level || selectedLevel;
  sessionStorage.setItem('candy-level', String(selectedLevel));
  renderDiffPicker();
  renderTools();
  showMonster(currentLevel());
  grid = createBoard();
  seedTestSpecials(grid, 1);
  renderBoard();
  updateHud();
}

async function startRound(level) {
  if (starting) return;
  starting = true;
  busy = true;
  selectedLevel = level;
  sessionStorage.setItem('candy-level', String(level));
  renderDiffPicker();
  showMonster(currentLevel());
  try {
    const r = await Arcade.post('/api/candy-battle/start-fight', { level });
    fight = r.fight;
    if (r.season) season = r.season;
    if (r.tools) toolStock = r.tools;
    renderDiffPicker();
    renderTools();
    showMonster(currentLevel());
    updateHud();
    grid = createBoard();
    seedTestSpecials(grid, 1);
    renderBoard();
  } catch (e) {
    fight = null;
    renderDiffPicker();
    updateHud();
    Arcade.toast(e.message, 'lose');
  } finally {
    starting = false;
    busy = false;
  }
}

async function useTool(toolId) {
  if (busy || !fight?.active) return;
  const btn = document.querySelector(`.tool-btn[data-tool="${toolId}"]`);
  btn?.classList.add('tool-pressed');
  setTimeout(() => btn?.classList.remove('tool-pressed'), 280);
  const voice = toolId === 'bandage' ? 'heal' : toolId === 'shield' ? 'shield' : 'charge';
  const blocked =
    (toolId === 'bandage' && fight.playerHp >= fight.playerMaxHp) ||
    (toolId === 'shield' && fight.shield) ||
    (toolId === 'charge' && fight.charge);
  sounds.play(toolId === 'shield' || !blocked ? voice : 'invalid');
  if (blocked && toolId === 'bandage') {
    Arcade.toast('Health is already full', 'lose');
    return;
  }
  try {
    const r = await Arcade.post('/api/candy-battle/use-tool', { toolId });
    const prevHp = fight.playerHp;
    fight = r.fight;
    updateHud();
    Arcade.refreshBalance(document.getElementById('balance'));
    if (r.used?.heal) playHeal(prevHp, fight.playerHp, r.used.heal);
    else if (r.used?.shield) playShield();
  } catch (e) {
    if (!blocked) sounds.play('invalid');
    Arcade.toast(e.message, 'lose');
  }
}

function updateHud() {
  renderSeasonLine();
  if (!fight) {
    document.getElementById('player-hp').style.width = '100%';
    document.getElementById('monster-hp').style.width = '100%';
    document.getElementById('player-hp-num').textContent = '—';
    document.getElementById('monster-hp-num').textContent = '—';
    return;
  }
  const playerPct = Math.max(0, (fight.playerHp / fight.playerMaxHp) * 100);
  const monsterPct = Math.max(0, (fight.monsterHp / fight.monsterMaxHp) * 100);
  const playerFill = document.getElementById('player-hp');
  playerFill.style.width = `${playerPct}%`;
  playerFill.classList.toggle('shielded', !!fight.shield);
  document.getElementById('monster-hp').style.width = `${monsterPct}%`;
  document.getElementById('player-hp-num').textContent = String(Math.max(0, fight.playerHp));
  document.getElementById('monster-hp-num').textContent = String(Math.max(0, fight.monsterHp));
}

function pieceClass(v) {
  if (isEnergy(v)) return 'piece piece-color-bomb';
  if (isWrapped(v)) return 'piece piece-dynamite';
  if (isStripe(v)) return `piece piece-rocket ${v >= STRIPE_V ? 'rocket-v' : 'rocket-h'}`;
  return 'piece piece-candy';
}

function candySrc(v) {
  const col = colorOf(v);
  if (col != null) return manifest.candyPath.replace('{color}', manifest.candies[col]);
  return manifest.candyPath.replace('{color}', 'red');
}

function specialOverlaySrc(v) {
  if (isEnergy(v)) return manifest.special.colorBomb || manifest.special.energy;
  if (isWrapped(v)) return manifest.special.dynamite;
  if (isStripe(v)) return v >= STRIPE_V ? manifest.special.rocketV : manifest.special.rocketH;
  return null;
}

function buildPiece(v) {
  const wrap = document.createElement('div');
  wrap.className = pieceClass(v);
  if (isNormal(v)) wrap.classList.add(`candy-${manifest.candies[v]}`);
  const overlay = specialOverlaySrc(v);
  const img = document.createElement('img');
  img.className = isStripe(v) || isWrapped(v) ? 'piece-overlay' : 'piece-candy';
  img.draggable = false;
  img.src = overlay || candySrc(v);
  img.alt = '';
  wrap.appendChild(img);
  return wrap;
}

function renderBoard() {
  const board = document.getElementById('board');
  if (board.childElementCount !== ROWS * COLS) {
    board.replaceChildren();
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const cell = document.createElement('div');
        cell.className = `cell ${(r + c) % 2 ? 'well-b' : 'well-a'}`;
        cell.dataset.r = String(r);
        cell.dataset.c = String(c);
        board.appendChild(cell);
      }
    }
  }
  let i = 0;
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const cell = board.children[i++];
      const v = grid[r][c];
      const sig = v == null ? '' : String(v);
      const piece = cell.querySelector('.piece');
      const missing = !piece || piece.classList.contains('piece-pop') || piece.style.visibility === 'hidden';
      if (cell.dataset.sig === sig && !missing) continue;
      cell.dataset.sig = sig;
      piece?.remove();
      if (v != null) cell.appendChild(buildPiece(v));
    }
  }
}

function onCellTap(r, c) {
  if (busy || !fight?.active) return;
  if (selectedCell === null) {
    selectedCell = { r, c };
    highlightSelected();
    return;
  }
  const { r: r0, c: c0 } = selectedCell;
  if (r === r0 && c === c0) {
    selectedCell = null;
    highlightSelected();
    return;
  }
  if (Math.abs(r - r0) + Math.abs(c - c0) !== 1) {
    selectedCell = { r, c };
    highlightSelected();
    return;
  }
  attemptSwap(r0, c0, r, c);
}

function highlightSelected() {
  document.querySelectorAll('.cell').forEach((el) => el.classList.remove('selected'));
  selectedCell &&
    document.querySelector(`[data-r="${selectedCell.r}"][data-c="${selectedCell.c}"]`)?.classList.add('selected');
}

async function attemptSwap(r0, c0, r1, c1, { fromDrag = false } = {}) {
  busy = true;
  selectedCell = null;
  highlightSelected();

  if (!isValidSwap(grid, r0, c0, r1, c1)) {
    if (fromDrag) await animator.cancelDrag(true);
    else await animator.invalidSwap(r0, c0, r1, c1);
    busy = false;
    return;
  }

  if (fromDrag) await animator.finishDrag(r1, c1);
  else await animator.swapAnimate(r0, c0, r1, c1);
  swapCells(grid, r0, c0, r1, c1);
  renderBoard();
  animator.releaseSwapHold();

  await runFullCascadeTurn(r0, c0, r1, c1);
  renderBoard();
  busy = false;
}

function playHeal(fromHp, toHp, amount) {
  const fill = document.getElementById('player-hp');
  const num = document.getElementById('player-hp-num');
  const max = Math.max(1, fight?.playerMaxHp || 1);
  fill.classList.add('hp-heal');
  fill.style.transition = 'none';
  fill.style.width = `${(fromHp / max) * 100}%`;
  num.textContent = String(fromHp);
  const rect = fill.getBoundingClientRect();
  ArcadeFX.floatText(rect.left + rect.width / 2, rect.top - 6, `+${amount}`, '#5dffb0');
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      fill.style.transition = 'width 0.7s cubic-bezier(0.22, 1, 0.36, 1)';
      fill.style.width = `${(toHp / max) * 100}%`;
    });
  });
  const start = performance.now();
  function tick(now) {
    const t = Math.min(1, (now - start) / 700);
    const hp = Math.round(fromHp + (toHp - fromHp) * (1 - (1 - t) ** 3));
    num.textContent = String(hp);
    if (t < 1) requestAnimationFrame(tick);
    else fill.classList.remove('hp-heal');
  }
  requestAnimationFrame(tick);
}

function playShield() {
  const fill = document.getElementById('player-hp');
  const bar = fill.parentElement;
  fill.classList.add('shielded');
  bar.classList.add('shield-pop');
  setTimeout(() => bar.classList.remove('shield-pop'), 700);
}

function estimateDamage(size, combo, bonus = 0) {
  const s = size >= 6 ? 6 : size >= 5 ? 5 : size >= 4 ? 4 : 3;
  const base = { 3: 4, 4: 7, 5: 12, 6: 18 }[s] || s * 3;
  return Math.round(base * (1 + (combo - 1) * 0.12) + bonus);
}

async function runCascadeWave({
  cells,
  effects,
  groups,
  creates,
  combo,
  waves,
  monsterEl,
  allowBombActivation = false,
  forceBombActivation = false,
  charged = false,
}) {
  if (combo >= 2 && groups?.length) {
    animator.showComboWord(combo, Math.max(...groups.map((g) => g.size)));
  }

  await animator.playEffects(effects, cells);

  const colorWipeFx = effects.find((e) => e.kind === 'colorWipe' || e.kind === 'colorBombDouble');
  const wipeBonus = colorWipeFx?.bonusDmg ?? (colorWipeFx ? Math.min(22, Math.round((colorWipeFx.count || 0) * 1.2)) : 0);
  let waveDamage = 0;
  let strikeBig = false;
  let wipeBonusApplied = false;

  if (groups?.length) {
    for (const g of groups) {
      const center = g.cells[Math.floor(g.cells.length / 2)];
      let bonus = 0;
      if (g.hasEnergy && !wipeBonusApplied) {
        bonus = wipeBonus;
        wipeBonusApplied = true;
      }
      const dmg = estimateDamage(g.size, combo, bonus);
      waveDamage += dmg;
      if (g.hasEnergy || g.hasWrapped || g.size >= 5) strikeBig = true;

      waves.push({
        size: g.size,
        combo,
        type: g.color ?? 0,
        effect: g.hasEnergy ? 'colorWipe' : g.hasWrapped ? 'areaBlast' : 'match',
        wipeCount: colorWipeFx?.count || 0,
        bonusDmg: bonus,
      });

    }
  } else {
    const size = cells.length;
    const bonus = wipeBonus;
    waveDamage = estimateDamage(Math.min(6, Math.max(3, size)), combo, bonus);
    strikeBig = effects.some((e) => e.kind === 'colorBombDouble' || e.kind === 'dynamite');
    waves.push({
      size,
      combo,
      type: 0,
      effect: colorWipeFx ? 'colorWipe' : effects.some((e) => e.kind === 'dynamite') ? 'areaBlast' : 'match',
      wipeCount: colorWipeFx?.count || 0,
      bonusDmg: bonus,
    });
  }

  const strikeFx =
    waveDamage > 0 ? animator.energyStrike(cells, waveDamage, monsterEl, strikeBig, charged) : Promise.resolve();
  await Promise.all([animator.popCells(cells, combo), strikeFx]);

  const createKeys = new Set((creates || []).map((c) => `${c.r},${c.c}`));
  const toClear = cells.filter(({ r, c }) => !createKeys.has(`${r},${c}`));
  clearCells(grid, toClear);
  applyCreates(grid, creates || []);

  const moves = applyGravity(grid);
  renderBoard();
  await animator.fallMoves(moves);
  await sleep(80);
}

async function runFullCascadeTurn(r0, c0, r1, c1) {
  if (window.__arcadePaused) return;
  const waves = [];
  let combo = 0;
  const chargedHit = !!fight?.charge;
  const monsterEl = document.getElementById('monster-sprite');

  let swapSpecialFired = false;
  if (r0 != null) {
    const activation = resolveSwapActivation(grid, r0, c0, r1, c1);
    if (activation) {
      swapSpecialFired = true;
      combo++;
      await runCascadeWave({
        cells: activation.cells,
        effects: activation.effects,
        groups: null,
        creates: [],
        combo,
        waves,
        monsterEl,
        forceBombActivation: true,
        charged: chargedHit,
      });
    }
  }

  let cascadeStep = 0;
  while (true) {
    if (window.__arcadePaused) return;
    cascadeStep++;
    const playerStep = cascadeStep === 1;
    const swap = playerStep && !swapSpecialFired ? { r0, c0, r1, c1 } : null;
    const { groups, creates } = findTurnResult(grid, {
      includeSpecialLines: playerStep && !swapSpecialFired,
      swap,
    });
    if (!groups.length) break;
    combo++;

    const { cells, effects } = expandEffects(grid, groups, {
      allowBombActivation: playerStep && !swapSpecialFired,
      swap,
    });
    await runCascadeWave({
      cells,
      effects,
      groups,
      creates,
      combo,
      waves,
      monsterEl,
      allowBombActivation: playerStep,
      forceBombActivation: false,
      charged: chargedHit,
    });
  }

  if (!waves.length || window.__arcadePaused) return;

  try {
    const r = await Arcade.post('/api/candy-battle/turn', { waves });
    if (window.__arcadePaused) return;
    fight = r.fight;
    if (r.season) season = r.season;
    updateHud();
    renderDiffPicker();
    renderTools();

    if (r.misfortune?.message) {
      Arcade.toast(r.misfortune.message, 'lose');
    }

    if (r.monsterAttack) {
      sounds.play('hurt');
      ArcadeFX.shake(document.getElementById('app'));
      const fill = document.getElementById('player-hp');
      if (r.shieldSoak) {
        fill.classList.add('shield-hit');
        setTimeout(() => fill.classList.remove('shield-hit'), 480);
        ArcadeFX.floatText(window.innerWidth / 2 - 28, 88, `-${r.monsterAttack}`, '#d5dbe3');
        ArcadeFX.floatText(window.innerWidth / 2 + 36, 112, `blocked ${r.shieldSoak}`, '#9aa3ad');
      } else {
        ArcadeFX.floatText(window.innerWidth / 2, 100, `-${r.monsterAttack}`, '#ff5a7a');
      }
    }
    if (r.won || r.lost || r.ended) showResult(r);
  } catch (e) {
    Arcade.toast(e.message, 'lose');
  }
}

function showResult(r) {
  const overlay = document.getElementById('overlay-result');
  const detail = document.getElementById('result-detail');
  overlay.classList.remove('hidden');
  renderDiffPicker();
  const monsterName = r.fight?.monsterName || currentLevel().name || 'Monster';
  if (r.checkpoint) {
    document.getElementById('result-icon').textContent = '🍬';
    document.getElementById('result-title').textContent = `Season ${r.checkpoint.number}`;
    const haul = haulText(r.checkpoint.haul);
    detail.textContent = haul
      ? `${r.checkpoint.wins} wins, ${r.checkpoint.losses} losses. Haul: ${haul}. Sell it, or keep going.`
      : `${r.checkpoint.wins} wins, ${r.checkpoint.losses} losses. No candy this stretch. Keep going.`;
    if (r.won) sounds.play('win', { volume: 0.5 });
  } else if (r.won) {
    document.getElementById('result-icon').textContent = '🏆';
    document.getElementById('result-title').textContent = `${monsterName} defeated`;
    const qty = Number(r.loot?.qty) || 0;
    const lootName = r.loot?.name || 'Candy';
    detail.textContent = `+0 ${lootName}`;
    countUp(detail, qty, '+', ` ${lootName}`);
    sounds.play('win', { volume: 0.5 });
    ArcadeFX.confetti(30);
  } else {
    document.getElementById('result-icon').textContent = '💀';
    document.getElementById('result-title').textContent = 'Defeated';
    detail.textContent = `${monsterName} got you. The season keeps going.`;
  }
}

function countUp(el, to, prefix, suffix) {
  const start = performance.now();
  const dur = 900;
  function tick(now) {
    const t = Math.min(1, (now - start) / dur);
    const eased = 1 - (1 - t) * (1 - t);
    el.textContent = `${prefix}${Math.round(to * eased)}${suffix}`;
    if (t < 1) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
