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
} from './board-engine.js';
import { BoardAnimator } from './animator.js';
import { CandySounds } from './sounds.js';

let config = null;
let manifest = null;
let grid = [];
let selectedTier = 'sugar';
let selectedLevel = 1;
let selectedCell = null;
let busy = false;
let fight = null;
let buyIn = {};
let animator = null;
let sounds = null;

const MONSTER_EMOJI = ['👾', '🦇', '🪨', '🐉', '👑', '😈'];

document.addEventListener('DOMContentLoaded', init);

async function init() {
  document.querySelector('.top-bar a').href = `/?token=${Arcade.token}&player=${Arcade.player}`;
  sounds = new CandySounds();
  setupSoundToggle();
  document.body.addEventListener('pointerdown', () => sounds.unlock(), { once: true });

  manifest = await fetch('/candy-battle/assets/manifest.json').then((r) => r.json());
  await Arcade.refreshBalance(document.getElementById('balance'));
  config = await Arcade.get('/api/candy-battle/config');
  if (config.dailyMood?.headline) {
    document.getElementById('lobby-title').textContent = config.dailyMood.headline;
  }
  buildTierPicker();
  buildLevelPicker();

  document.getElementById('btn-start').addEventListener('click', startFight);
  document.getElementById('btn-continue').addEventListener('click', () => {
    document.getElementById('overlay-result').classList.add('hidden');
    showLobby();
  });

  const board = document.getElementById('board');
  board.style.gridTemplateColumns = `repeat(${COLS}, 1fr)`;
  board.style.gridTemplateRows = `repeat(${ROWS}, 1fr)`;
  animator = new BoardAnimator(board, manifest, sounds);
  setupBoardInput(board);

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
      sounds.play('swap', { volume: 0.25 });
    }
  });
}

function setupBoardInput(board) {
  board.addEventListener('pointerdown', (e) => {
    if (busy || !fight?.active) return;
    const cell = e.target.closest('.cell');
    if (!cell) return;
    dragStart = {
      r: Number(cell.dataset.r),
      c: Number(cell.dataset.c),
      x: e.clientX,
      y: e.clientY,
    };
    try {
      board.setPointerCapture(e.pointerId);
    } catch (_) {}
  });

  board.addEventListener('pointerup', (e) => {
    if (!dragStart || busy || !fight?.active) {
      dragStart = null;
      return;
    }
    const dx = e.clientX - dragStart.x;
    const dy = e.clientY - dragStart.y;
    const dist = Math.hypot(dx, dy);
    const { r: r0, c: c0 } = dragStart;
    dragStart = null;

    if (dist >= 24) {
      let r1 = r0;
      let c1 = c0;
      if (Math.abs(dx) > Math.abs(dy)) c1 += dx > 0 ? 1 : -1;
      else r1 += dy > 0 ? 1 : -1;
      selectedCell = null;
      highlightSelected();
      if (r1 >= 0 && r1 < ROWS && c1 >= 0 && c1 < COLS) {
        attemptSwap(r0, c0, r1, c1);
      }
      return;
    }

    onCellTap(r0, c0);
  });

  board.addEventListener('pointercancel', () => {
    dragStart = null;
  });
}

async function refreshState() {
  const st = await Arcade.get('/api/candy-battle/state');
  buyIn = st.buyInCandies || {};
  document.getElementById('ammo-count').textContent = Object.values(buyIn).reduce((a, b) => a + b, 0);
  document.getElementById('btn-start').disabled = (buyIn[selectedTier] || 0) < 3;

  if (st.fight?.active) {
    resumeFight(st.fight, buyIn);
  }
}

function resumeFight(activeFight, bi) {
  fight = activeFight;
  selectedLevel = fight.level;
  selectedTier = fight.tierId;
  document.getElementById('screen-lobby').classList.add('hidden');
  document.getElementById('screen-fight').classList.remove('hidden');
  document.getElementById('monster-name').textContent = fight.monsterName;
  const emoji = MONSTER_EMOJI[selectedLevel - 1] || '👾';
  document.getElementById('monster-sprite').textContent = emoji;
  grid = createBoard();
  seedTestSpecials(grid, 6);
  renderBoard();
  updateHud(bi);
}

function buildTierPicker() {
  const el = document.getElementById('tier-picker');
  el.innerHTML =
    Object.values(config.tiers)
      .map(
        (t) =>
          `<button type="button" class="tier-btn ${t.id === selectedTier ? 'selected' : ''}" data-tier="${t.id}">
        ${t.name}<br><small>${buyIn[t.id] || 0} owned</small>
      </button>`
      )
      .join('') +
    `<button type="button" class="btn btn-gold btn-sm" id="btn-buy-pack" style="width:100%;margin-top:8px">Buy Candy Pack</button>`;
  el.querySelectorAll('.tier-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      selectedTier = btn.dataset.tier;
      buildTierPicker();
      document.getElementById('btn-start').disabled = (buyIn[selectedTier] || 0) < 3;
    });
  });
  document.getElementById('btn-buy-pack')?.addEventListener('click', () => buyPack(selectedTier));
}

function buildLevelPicker() {
  const el = document.getElementById('level-picker');
  el.innerHTML = config.monsters
    .map(
      (m, i) =>
        `<button class="level-btn ${m.level === selectedLevel ? 'selected' : ''}" data-level="${m.level}">
        Lv${m.level} ${MONSTER_EMOJI[i] || '👾'}
      </button>`
    )
    .join('');
  el.querySelectorAll('.level-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      selectedLevel = Number(btn.dataset.level);
      buildLevelPicker();
      document.getElementById('btn-start').disabled = (buyIn[selectedTier] || 0) < 3;
    });
  });
}

async function buyPack(tierId) {
  selectedTier = tierId;
  buildTierPicker();
  try {
    const r = await Arcade.post('/api/candy-battle/buy-candies', { tierId, packs: 1 });
    buyIn = r.buyInCandies;
    document.getElementById('ammo-count').textContent = Object.values(buyIn).reduce((a, b) => a + b, 0);
    document.getElementById('btn-start').disabled = (buyIn[selectedTier] || 0) < 3;
    Arcade.toast(`+${r.added} buy-in candies!`, 'win');
    Arcade.refreshBalance(document.getElementById('balance'));
  } catch (e) {
    Arcade.toast(e.message, 'lose');
  }
}

async function startFight() {
  try {
    const r = await Arcade.post('/api/candy-battle/start-fight', {
      level: selectedLevel,
      tierId: selectedTier,
    });
    fight = r.fight;
    document.getElementById('screen-lobby').classList.add('hidden');
    document.getElementById('screen-fight').classList.remove('hidden');
    document.getElementById('monster-name').textContent = fight.monsterName;
    const emoji = MONSTER_EMOJI[selectedLevel - 1] || '👾';
    document.getElementById('monster-preview').textContent = emoji;
    document.getElementById('monster-sprite').textContent = emoji;
    updateHud(r.buyInCandies || buyIn);
    grid = createBoard();
    seedTestSpecials(grid, 6);
    renderBoard();
  } catch (e) {
    Arcade.toast(e.message, 'lose');
  }
}

function showLobby() {
  document.getElementById('screen-fight').classList.add('hidden');
  document.getElementById('screen-lobby').classList.remove('hidden');
  refreshState();
  Arcade.refreshBalance(document.getElementById('balance'));
}

function updateHud(bi) {
  buyIn = bi || buyIn;
  if (!fight) return;
  const playerPct = Math.max(0, (fight.playerHp / fight.playerMaxHp) * 100);
  const monsterPct = Math.max(0, (fight.monsterHp / fight.monsterMaxHp) * 100);
  document.getElementById('player-hp').style.width = `${playerPct}%`;
  document.getElementById('monster-hp').style.width = `${monsterPct}%`;
  const playerNum = document.getElementById('player-hp-num');
  const monsterNum = document.getElementById('monster-hp-num');
  if (playerNum) playerNum.textContent = String(Math.max(0, fight.playerHp));
  if (monsterNum) monsterNum.textContent = String(Math.max(0, fight.monsterHp));
  document.getElementById('fight-ammo').textContent = buyIn[selectedTier] || 0;
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

function renderBoard() {
  const board = document.getElementById('board');
  board.innerHTML = '';
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const v = grid[r][c];
      const cell = document.createElement('div');
      cell.className = `cell ${(r + c) % 2 ? 'well-b' : 'well-a'}`;
      cell.dataset.r = r;
      cell.dataset.c = c;
      if (v != null) {
        const wrap = document.createElement('div');
        wrap.className = pieceClass(v);
        wrap.style.setProperty('--idle', `${((r * COLS + c) % 7) * 0.16}s`);
        if (isNormal(v)) wrap.classList.add(`candy-${manifest.candies[v]}`);
        if (isStripe(v) || isWrapped(v)) {
          const base = document.createElement('img');
          base.className = 'piece-base';
          base.draggable = false;
          base.src = candySrc(v);
          base.alt = '';
          wrap.appendChild(base);
        }
        const overlay = specialOverlaySrc(v);
        const img = document.createElement('img');
        img.className = isStripe(v) || isWrapped(v) ? 'piece-overlay' : 'piece-candy';
        img.draggable = false;
        img.src = overlay || candySrc(v);
        img.alt = '';
        wrap.appendChild(img);
        cell.appendChild(wrap);
      }
      board.appendChild(cell);
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

async function attemptSwap(r0, c0, r1, c1) {
  busy = true;
  selectedCell = null;
  highlightSelected();

  if (!isValidSwap(grid, r0, c0, r1, c1)) {
    await animator.invalidSwap(r0, c0, r1, c1);
    busy = false;
    return;
  }

  await animator.swapAnimate(r0, c0, r1, c1);
  swapCells(grid, r0, c0, r1, c1);
  renderBoard();
  animator.releaseSwapHold();

  await runFullCascadeTurn(r0, c0, r1, c1);
  renderBoard();
  busy = false;
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
    waveDamage > 0 ? animator.energyStrike(cells, waveDamage, monsterEl, strikeBig) : Promise.resolve();
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
    });
  }

  if (!waves.length || window.__arcadePaused) return;

  try {
    const r = await Arcade.post('/api/candy-battle/turn', { waves });
    if (window.__arcadePaused) return;
    fight = r.fight;
    updateHud(r.buyInCandies);

    if (r.misfortune?.message) {
      Arcade.toast(r.misfortune.message, 'lose');
    }

    document.getElementById('battle-msg').textContent =
      `${waves.length} hit${waves.length > 1 ? 's' : ''} → ${r.totalDamage} dmg!` +
      (r.monsterAttack ? ` Monster -${r.monsterAttack}` : '') +
      (r.bonusCandies ? ` +${r.bonusCandies} bonus` : '');

    if (r.monsterAttack) {
      ArcadeFX.shake(document.getElementById('app'));
      ArcadeFX.floatText(window.innerWidth / 2, 100, `-${r.monsterAttack}`, '#ff5a7a');
    }
    if (r.won || r.lost || r.ended) showResult(r);
  } catch (e) {
    Arcade.toast(e.message, 'lose');
  }
}

function showResult(r) {
  document.getElementById('overlay-result').classList.remove('hidden');
  if (r.won) {
    document.getElementById('result-icon').textContent = '🏆';
    document.getElementById('result-title').textContent = 'Monster Defeated!';
    document.getElementById('result-detail').textContent = r.rewards?.length
      ? `Loot: ${r.rewards.map((x) => x.qty + '× ' + x.itemId).join(', ')}`
      : 'You earned loot!';
    sounds.play('win', { volume: 0.5 });
    ArcadeFX.confetti(30);
  } else {
    document.getElementById('result-icon').textContent = '💀';
    document.getElementById('result-title').textContent =
      r.reason === 'out_of_candies' ? 'Out of Candies!' : 'Defeated';
    document.getElementById('result-detail').textContent = 'Buy more candies and try again.';
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
