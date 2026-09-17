import {
  COLS,
  ROWS,
  createBoard,
  findMatchGroups,
  swapCells,
  clearClusters,
  applyGravity,
  clusterCenter,
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
  document.body.addEventListener(
    'pointerdown',
    () => sounds.unlock(),
    { once: true }
  );

  manifest = await fetch('/candy-battle/assets/manifest.json').then((r) => r.json());
  await Arcade.refreshBalance(document.getElementById('balance'));
  config = await Arcade.get('/api/candy-battle/config');
  await refreshState();
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
}

async function refreshState() {
  const st = await Arcade.get('/api/candy-battle/state');
  buyIn = st.buyInCandies || {};
  document.getElementById('ammo-count').textContent = Object.values(buyIn).reduce((a, b) => a + b, 0);
  document.getElementById('btn-start').disabled = (buyIn[selectedTier] || 0) < 3;
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
    renderBoard();
    animator.measure();
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
  const pctP = (fight.playerHp / fight.playerMaxHp) * 100;
  const pctM = (fight.monsterHp / fight.monsterMaxHp) * 100;
  document.getElementById('player-hp').style.width = `${pctP}%`;
  document.getElementById('monster-hp').style.width = `${pctM}%`;
  document.getElementById('fight-ammo').textContent = buyIn[selectedTier] || 0;
}

function renderBoard() {
  const board = document.getElementById('board');
  board.innerHTML = '';
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const t = grid[r][c];
      const cell = document.createElement('div');
      cell.className = 'cell';
      cell.dataset.r = r;
      cell.dataset.c = c;
      if (t != null) {
        const img = document.createElement('img');
        img.className = 'candy-img';
        img.draggable = false;
        img.src = manifest.candyPath.replace('{color}', manifest.candies[t]);
        img.alt = '';
        cell.appendChild(img);
      }
      cell.addEventListener('click', () => onCellClick(r, c));
      board.appendChild(cell);
    }
  }
}

function onCellClick(r, c) {
  if (busy || !fight?.active) return;
  if (selectedCell === null) {
    selectedCell = { r, c };
    highlightSelected();
    sounds.play('click', { volume: 0.15 });
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
  if (!selectedCell) return;
  document.querySelector(`[data-r="${selectedCell.r}"][data-c="${selectedCell.c}"]`)?.classList.add('selected');
}

async function attemptSwap(r0, c0, r1, c1) {
  busy = true;
  selectedCell = null;
  highlightSelected();

  await animator.swapAnimate(r0, c0, r1, c1);
  swapCells(grid, r0, c0, r1, c1);
  renderBoard();

  if (!findMatchGroups(grid).length) {
    swapCells(grid, r0, c0, r1, c1);
    renderBoard();
    await animator.invalidSwap(r0, c0, r1, c1);
    busy = false;
    return;
  }

  await runFullCascadeTurn();
  busy = false;
}

function estimateDamage(size, combo) {
  const s = size >= 5 ? 5 : size >= 4 ? 4 : 3;
  const base = { 3: 8, 4: 14, 5: 22 }[s] || s * 5;
  return Math.round(base * (1 + (combo - 1) * 0.25));
}

/** One player move: full Candy Crush cascades — each cluster pops, falls, and strikes the monster. */
async function runFullCascadeTurn() {
  const waves = [];
  let combo = 0;
  const monsterEl = document.getElementById('monster-sprite');

  while (true) {
    const groups = findMatchGroups(grid);
    if (!groups.length) break;
    combo++;

    await Promise.all(groups.map((cluster) => animator.popCluster(cluster, combo)));

    for (const cluster of groups) {
      const center = clusterCenter(cluster);
      const r = Math.round(center.r);
      const c = Math.round(center.c);
      const size = cluster.length;
      waves.push({ size, combo, type: center.type, r, c });
      const est = estimateDamage(size, combo);
      await animator.launchProjectile(r, c, center.type, est, monsterEl);
      await sleep(60);
    }

    clearClusters(grid, groups);
    const moves = applyGravity(grid);
    renderBoard();
    await animator.fallMoves(moves);
  }

  if (!waves.length) return;

  try {
    const r = await Arcade.post('/api/candy-battle/turn', { waves });
    fight = r.fight;
    updateHud(r.buyInCandies);

    const msg = document.getElementById('battle-msg');
    msg.textContent = `${waves.length} match${waves.length > 1 ? 'es' : ''} → ${r.totalDamage} total dmg!${
      r.monsterAttack ? ` Monster hits ${r.monsterAttack}` : ''
    }${r.bonusCandies ? ` +${r.bonusCandies} free candies!` : ''}`;

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
  const overlay = document.getElementById('overlay-result');
  overlay.classList.remove('hidden');
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
