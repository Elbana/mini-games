const COLS = 6;
const ROWS = 6;
const TYPES = 6;

let config = null;
let selectedTier = 'sugar';
let selectedLevel = 1;
let grid = [];
let selectedCell = null;
let busy = false;
let fight = null;
let buyIn = {};
let comboChain = 0;

const MONSTER_EMOJI = ['👾', '🦇', '🪨', '🐉', '👑', '😈'];

document.addEventListener('DOMContentLoaded', init);

async function init() {
  const hubLink = document.querySelector('.top-bar a');
  hubLink.href = `/?token=${Arcade.token}&player=${Arcade.player}`;
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
}

async function refreshState() {
  const st = await Arcade.get('/api/candy-battle/state');
  buyIn = st.buyInCandies || {};
  const total = Object.values(buyIn).reduce((a, b) => a + b, 0);
  document.getElementById('ammo-count').textContent = total;
  document.getElementById('btn-start').disabled = (buyIn[selectedTier] || 0) < 3;
}

function buildTierPicker() {
  const el = document.getElementById('tier-picker');
  el.innerHTML =
    Object.values(config.tiers)
      .map(
        (t) =>
          `<button type="button" class="tier-btn ${t.id === selectedTier ? 'selected' : ''}" data-tier="${t.id}">
        ${t.name}<br><small>${(buyIn[t.id] || 0)} owned</small>
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
    ArcadeFX.burst(window.innerWidth / 2, 200, '🍬', 5);
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
    comboChain = 0;
    document.getElementById('screen-lobby').classList.add('hidden');
    document.getElementById('screen-fight').classList.remove('hidden');
    document.getElementById('monster-name').textContent = fight.monsterName;
    document.getElementById('monster-preview').textContent =
      MONSTER_EMOJI[selectedLevel - 1] || '👾';
    updateHud(r.buyInCandies || buyIn);
    initBoard();
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

function initBoard() {
  grid = [];
  for (let r = 0; r < ROWS; r++) {
    grid[r] = [];
    for (let c = 0; c < COLS; c++) {
      grid[r][c] = randomType(r, c);
    }
  }
  while (findMatches().length) refillMatches();
  renderBoard();
}

function randomType(r, c) {
  let t;
  do {
    t = Math.floor(Math.random() * TYPES);
  } while (
    (c >= 2 && grid[r][c - 1] === t && grid[r][c - 2] === t) ||
    (r >= 2 && grid[r - 1]?.[c] === t && grid[r - 2]?.[c] === t)
  );
  return t;
}

function renderBoard() {
  const board = document.getElementById('board');
  board.innerHTML = '';
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const div = document.createElement('div');
      div.className = `cell t${grid[r][c]}`;
      div.dataset.r = r;
      div.dataset.c = c;
      div.addEventListener('click', () => onCellClick(r, c));
      board.appendChild(div);
    }
  }
}

function onCellClick(r, c) {
  if (busy || !fight?.active) return;
  if (selectedCell === null) {
    selectedCell = { r, c };
    highlightSelected();
    return;
  }
  const { r: r0, c: c0 } = selectedCell;
  if (Math.abs(r - r0) + Math.abs(c - c0) !== 1) {
    selectedCell = { r, c };
    highlightSelected();
    return;
  }
  swap(r0, c0, r, c);
}

function highlightSelected() {
  document.querySelectorAll('.cell').forEach((el) => el.classList.remove('selected'));
  if (!selectedCell) return;
  const el = document.querySelector(`[data-r="${selectedCell.r}"][data-c="${selectedCell.c}"]`);
  el?.classList.add('selected');
}

async function swap(r0, c0, r1, c1) {
  busy = true;
  selectedCell = null;
  highlightSelected();
  [grid[r0][c0], grid[r1][c1]] = [grid[r1][c1], grid[r0][c0]];
  renderBoard();
  const matches = findMatches();
  if (!matches.length) {
    [grid[r0][c0], grid[r1][c1]] = [grid[r1][c1], grid[r0][c0]];
    renderBoard();
    busy = false;
    return;
  }
  comboChain = 0;
  await resolveMatches();
  busy = false;
}

function findMatches() {
  const matched = new Set();
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const t = grid[r][c];
      if (t == null) continue;
      if (c <= COLS - 3 && grid[r][c + 1] === t && grid[r][c + 2] === t) {
        matched.add(`${r},${c}`);
        matched.add(`${r},${c + 1}`);
        matched.add(`${r},${c + 2}`);
      }
      if (r <= ROWS - 3 && grid[r + 1][c] === t && grid[r + 2][c] === t) {
        matched.add(`${r},${c}`);
        matched.add(`${r + 1},${c}`);
        matched.add(`${r + 2},${c}`);
      }
    }
  }
  return [...matched].map((s) => s.split(',').map(Number));
}

function refillMatches() {
  const m = findMatches();
  m.forEach(([r, c]) => (grid[r][c] = randomType(r, c)));
  if (findMatches().length) refillMatches();
}

async function resolveMatches() {
  let totalSize = 0;
  let maxSize = 3;
  while (true) {
    const matches = findMatches();
    if (!matches.length) break;
    comboChain += 1;
    const size = matches.length;
    totalSize += size;
    maxSize = Math.max(maxSize, size >= 5 ? 5 : size >= 4 ? 4 : 3);
    matches.forEach(([r, c]) => {
      grid[r][c] = null;
      document.querySelector(`[data-r="${r}"][data-c="${c}"]`)?.classList.add('match-flash');
    });
    await sleep(200);
    applyGravity();
    renderBoard();
    await sleep(150);
  }
  if (totalSize >= 3) {
    await sendMatch(maxSize, comboChain);
  }
}

function applyGravity() {
  for (let c = 0; c < COLS; c++) {
    let write = ROWS - 1;
    for (let r = ROWS - 1; r >= 0; r--) {
      if (grid[r][c] != null) {
        grid[write][c] = grid[r][c];
        if (write !== r) grid[r][c] = null;
        write--;
      }
    }
    for (let r = write; r >= 0; r--) grid[r][c] = randomType(r, c);
  }
}

async function sendMatch(matchSize, combo) {
  try {
    const r = await Arcade.post('/api/candy-battle/match', { matchSize, combo });
    fight = r.fight;
    updateHud(r.buyInCandies);
    const msg = document.getElementById('battle-msg');
    msg.textContent = `-${matchSize} match → ${r.damage} dmg!${
      r.monsterAttack ? ` Monster hits ${r.monsterAttack}` : ''
    }${r.bonusCandies ? ` +${r.bonusCandies} free candies!` : ''}`;
    if (r.monsterAttack) ArcadeFX.shake(document.getElementById('app'));
    if (r.won || r.lost || r.ended) {
      showResult(r);
    }
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
      ? `Loot: ${r.rewards.map((x) => x.qty + '× ' + x.itemId).join(', ')} — sell at Black Market!`
      : 'You earned loot!';
    ArcadeFX.burst(window.innerWidth / 2, window.innerHeight / 2, '💎', 10);
  } else {
    document.getElementById('result-icon').textContent = '💀';
    document.getElementById('result-title').textContent = r.reason === 'out_of_candies' ? 'Out of Candies!' : 'Defeated';
    document.getElementById('result-detail').textContent = 'Buy more candies and try again.';
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
