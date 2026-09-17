import { biteCallout, catchCallout } from './bite-words.js';
import { loadFishingManifest, baitImage, fishImage, waterBackground } from './assets.mjs';
import { FishingSounds } from './sounds.js';

let gear = { baitStock: {}, selectedBait: 'bait_worm' };
let activeCast = null;
let config = { baits: [], fish: [], ranks: {} };
let manifest = null;
let sounds = null;
let gameState = 'idle';
let actionBusy = false;
let isPulling = false;
let fightAnim = null;
let fightStats = { greenTime: 0, totalTime: 0 };
let lastFightProgress = 0;
let fightEnding = false;

document.addEventListener('DOMContentLoaded', init);

async function init() {
  document.querySelector('.top-bar a').href = `/?token=${Arcade.token}&player=${Arcade.player}`;
  setupFishToasts();
  initOceanAmbient();
  bindCastAndFightInput();

  manifest = await loadFishingManifest();
  sounds = new FishingSounds(manifest);
  applyManifestVisuals();

  document.body.addEventListener('pointerdown', () => sounds.unlock(), { once: true });

  await Arcade.refreshBalance(document.getElementById('balance'));
  config = await Arcade.get('/api/fishing/config');
  await refreshState();
  renderHelpPanel();

  document.getElementById('result-ok').addEventListener('click', () => {
    sounds.play('click');
    closeResult();
  });
  document.getElementById('btn-help').addEventListener('click', openHelp);
  document.getElementById('help-close').addEventListener('click', closeHelp);
  document.getElementById('help-ok').addEventListener('click', closeHelp);
  document.getElementById('help-overlay').addEventListener('click', (e) => {
    if (e.target.id === 'help-overlay') closeHelp();
  });
  bindSoundToggle();
  bindBaitChipRow();
}

function applyManifestVisuals() {
  const water = document.querySelector('.water-bg');
  if (water) water.style.backgroundImage = `url('${waterBackground(manifest)}')`;
}

function bindSoundToggle() {
  const btn = document.getElementById('btn-sound');
  const sync = () => {
    const muted = sounds.isMuted();
    btn.textContent = muted ? '🔇' : '🔊';
    btn.setAttribute('aria-pressed', muted ? 'true' : 'false');
    btn.setAttribute('aria-label', muted ? 'Sound off' : 'Sound on');
  };
  sync();
  btn.addEventListener('click', () => {
    sounds.toggleMuted();
    sync();
    if (!sounds.isMuted()) {
      sounds.unlock();
      sounds.play('click', { volume: 0.2 });
    }
  });
}

function openHelp() {
  if (gameState !== 'idle' || actionBusy) return;
  sounds.play('click');
  renderHelpPanel();
  document.getElementById('help-overlay').classList.remove('hidden');
}

function closeHelp() {
  sounds.play('click', { volume: 0.15 });
  document.getElementById('help-overlay').classList.add('hidden');
}

function renderHelpPanel() {
  const rankOrder = ['mythic', 'legendary', 'epic', 'rare', 'uncommon', 'common'];
  const fish = [...(config.fish || [])].sort(
    (a, b) => rankOrder.indexOf(a.rank) - rankOrder.indexOf(b.rank)
  );

  document.getElementById('help-fish-list').innerHTML = fish.map((f) => {
    const rank = config.ranks[f.rank] || {};
    const stars = '★'.repeat(rank.stars || 1);
    const img = fishImage(manifest, f.id);
    const art = img
      ? `<img src="${img}" alt="">`
      : `<span style="font-size:1.6rem">${f.icon}</span>`;
    return `<div class="help-fish-row">
      ${art}
      <div>
        <div class="help-fish-name">${f.name}</div>
        <div class="help-fish-rank" style="color:${rank.color || '#fff'}">${stars} ${rank.label || f.rank}</div>
      </div>
      <div class="help-fish-price">~🪙${Arcade.formatCoins(f.sellBase)}</div>
    </div>`;
  }).join('');

  document.getElementById('help-bait-list').innerHTML = (config.baits || []).map((b) => {
    const img = baitImage(manifest, b.id);
    const art = img
      ? `<img src="${img}" alt="">`
      : `<span style="font-size:1.6rem">${b.icon}</span>`;
    return `<div class="help-bait-row">
      ${art}
      <div>
        <div class="help-fish-name">${b.name}</div>
        <div class="help-bait-meta">🪙${Arcade.formatCoins(b.price)} · +${b.packSize} per pack · better odds for rare fish</div>
      </div>
    </div>`;
  }).join('');
}

function getBoatExclusionRect(sceneEl) {
  const boat = document.querySelector('.boat-wrap');
  if (!boat || !sceneEl) return null;
  const sr = sceneEl.getBoundingClientRect();
  const br = boat.getBoundingClientRect();
  const pad = 12;
  return {
    left: (br.left - pad - sr.left) / sr.width,
    top: (br.top - pad - sr.top) / sr.height,
    right: (br.right + pad - sr.left) / sr.width,
    bottom: (br.bottom + pad - sr.top) / sr.height,
  };
}

function isSeaCastPoint(x, y, sceneEl) {
  if (y < 0.1 || y > 0.78) return false;
  const box = getBoatExclusionRect(sceneEl);
  if (!box) return true;
  const onBoat = x >= box.left && x <= box.right && y >= box.top && y <= box.bottom;
  return !onBoat;
}

function bindCastAndFightInput() {
  const scene = document.getElementById('ocean-scene');

  scene.addEventListener('pointerup', (e) => {
    if (gameState !== 'idle' || actionBusy) return;
    if (e.target.closest('.fish-hud, .top-bar, .fight-panel, .boat-wrap, .help-overlay, button, a')) return;

    const rect = scene.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    if (!isSeaCastPoint(x, y, scene)) {
      if (getBoatExclusionRect(scene)) Arcade.toast('Cast into the sea', 'lose');
      return;
    }
    castAt(x, y);
  });

}

let fightPullBound = false;

function onFightPullStart(e) {
  if (gameState !== 'fighting') return;
  if (e.target.closest('button, a, .result-overlay, .help-overlay')) return;
  if (isPulling) return;
  isPulling = true;
  sounds?.unlock();
  sounds?.startReel();
}

function onFightPullEnd() {
  if (!isPulling) return;
  isPulling = false;
  sounds?.stopReel();
}

function bindFightPull() {
  if (fightPullBound) return;
  fightPullBound = true;
  document.addEventListener('pointerdown', onFightPullStart, { capture: true });
  document.addEventListener('pointerup', onFightPullEnd, { capture: true });
  document.addEventListener('pointercancel', onFightPullEnd, { capture: true });
}

function unbindFightPull() {
  if (!fightPullBound) return;
  fightPullBound = false;
  document.removeEventListener('pointerdown', onFightPullStart, { capture: true });
  document.removeEventListener('pointerup', onFightPullEnd, { capture: true });
  document.removeEventListener('pointercancel', onFightPullEnd, { capture: true });
}

function showCallout(text, { color = '#fff', glow = '#0284c7', small = false } = {}) {
  const layer = document.getElementById('callout-layer');
  if (!layer || !text) return;
  const el = document.createElement('div');
  el.className = `bite-callout${small ? ' small' : ''}`;
  el.textContent = text;
  el.style.color = color;
  el.style.textShadow = `0 0 22px ${glow}, 0 4px 0 ${glow}, 0 7px 16px rgba(0,0,0,0.45)`;
  layer.appendChild(el);
  setTimeout(() => el.remove(), small ? 780 : 950);
}

function setupFishToasts() {
  const zone = document.getElementById('toast-zone');
  if (!zone) return;
  const MAX_TOASTS = 2;

  Arcade.toast = (msg, type = '') => {
    while (zone.children.length >= MAX_TOASTS) {
      zone.lastElementChild?.remove();
    }
    const el = document.createElement('div');
    el.className = `fish-toast ${type}`.trim();
    el.textContent = msg;
    zone.insertBefore(el, zone.firstChild);
    requestAnimationFrame(() => el.classList.add('show'));
    setTimeout(() => {
      el.classList.remove('show');
      setTimeout(() => el.remove(), 400);
    }, 2800);
  };
}

function initOceanAmbient() {
  const shadowRoot = document.getElementById('fish-shadows');
  const rippleRoot = document.getElementById('ripple-field');
  if (!shadowRoot || !rippleRoot) return;

  for (let i = 0; i < 2; i += 1) {
    spawnFishShadow(shadowRoot, { big: true, underBoat: true, delayRatio: i / 2 });
  }
  for (let i = 0; i < 22; i += 1) {
    spawnFishShadow(shadowRoot, { underBoat: true, delayRatio: i / 22 });
  }
  for (let i = 0; i < 10; i += 1) {
    spawnFishShadow(shadowRoot, { underBoat: false, delayRatio: i / 10 });
  }
  for (let i = 0; i < 5; i += 1) {
    spawnRipple(rippleRoot, i < 3);
  }
}

function spawnFishShadow(container, { big = false, underBoat = true, delayRatio = Math.random() } = {}) {
  const el = document.createElement('div');
  el.className = big ? 'fish-shadow big' : 'fish-shadow';

  const w = big ? 80 + Math.random() * 40 : 20 + Math.random() * 36;
  const scale = big ? 0.9 + Math.random() * 0.3 : 0.6 + Math.random() * 0.65;
  const dur = big ? 40 + Math.random() * 20 : 18 + Math.random() * 16;

  let x0;
  let y0;
  let dx;
  let dy;
  let rot;

  if (underBoat) {
    const mode = Math.floor(Math.random() * 4);
    if (mode === 0) {
      const lane = (Math.random() - 0.5) * 130;
      rot = '0deg';
      x0 = `${-45 - Math.random() * 15}vw`;
      y0 = `${lane}px`;
      dx = `${90 + Math.random() * 30}vw`;
      dy = `${(Math.random() - 0.5) * 20}px`;
    } else if (mode === 1) {
      const lane = (Math.random() - 0.5) * 130;
      rot = '180deg';
      x0 = `${45 + Math.random() * 15}vw`;
      y0 = `${lane}px`;
      dx = `${-90 - Math.random() * 30}vw`;
      dy = `${(Math.random() - 0.5) * 20}px`;
    } else if (mode === 2) {
      const lane = (Math.random() - 0.5) * 100;
      rot = '90deg';
      x0 = `${lane}px`;
      y0 = `${35 + Math.random() * 12}vh`;
      dx = `${(Math.random() - 0.5) * 24}px`;
      dy = `${-55 - Math.random() * 20}vh`;
    } else {
      const lane = (Math.random() - 0.5) * 100;
      rot = '-90deg';
      x0 = `${lane}px`;
      y0 = `${-35 - Math.random() * 12}vh`;
      dx = `${(Math.random() - 0.5) * 24}px`;
      dy = `${55 + Math.random() * 20}vh`;
    }
  } else {
    rot = `${Math.random() * 360}deg`;
    x0 = `${(Math.random() - 0.5) * 80}vw`;
    y0 = `${(Math.random() - 0.5) * 60}vh`;
    dx = `${(Math.random() - 0.5) * 50}vw`;
    dy = `${(Math.random() - 0.5) * 40}vh`;
  }

  el.style.setProperty('--fish-w', `${w}px`);
  el.style.setProperty('--fish-h', `${w * 0.32}px`);
  el.style.setProperty('--fish-scale', scale.toFixed(2));
  el.style.setProperty('--fish-dur', `${dur}s`);
  el.style.setProperty('--fish-delay', `${delayRatio * dur}s`);
  el.style.setProperty('--fish-opacity', big ? '0.42' : `${0.4 + Math.random() * 0.28}`);
  el.style.setProperty('--rot', rot);
  el.style.setProperty('--x0', x0);
  el.style.setProperty('--y0', y0);
  el.style.setProperty('--dx', dx);
  el.style.setProperty('--dy', dy);
  container.appendChild(el);
}

function spawnRipple(container, nearBoat = false) {
  const el = document.createElement('div');
  el.className = 'ripple';
  if (nearBoat) {
    el.style.left = `${38 + Math.random() * 24}%`;
    el.style.top = `${40 + Math.random() * 18}%`;
  } else {
    el.style.left = `${10 + Math.random() * 80}%`;
    el.style.top = `${10 + Math.random() * 80}%`;
  }
  el.style.setProperty('--ripple-size', `${20 + Math.random() * 28}px`);
  el.style.setProperty('--ripple-dur', `${5 + Math.random() * 5}s`);
  el.style.setProperty('--ripple-delay', `${Math.random() * 8}s`);
  container.appendChild(el);
}

function getBait(id) {
  return config.baits.find((b) => b.id === id);
}

function selectedBaitCount() {
  return gear.baitStock?.[gear.selectedBait] || 0;
}

const BAIT_CHIP_SHORT = {
  bait_worm: 'Worm',
  bait_shrimp: 'Shrimp',
  bait_lure: 'Lure',
  bait_golden: 'Golden',
};

function renderBaitRow() {
  const row = document.getElementById('bait-chip-row');
  if (!row || !config.baits.length) return;

  row.innerHTML = config.baits.map((b) => {
    const count = gear.baitStock[b.id] || 0;
    const selected = gear.selectedBait === b.id;
    const label = BAIT_CHIP_SHORT[b.id] || b.name;
    const img = baitImage(manifest, b.id);
    const icon = img
      ? `<img class="bait-chip-item-img" src="${img}" alt="">`
      : `<span class="bait-chip-item-icon">${b.icon}</span>`;
    return `<div class="bait-chip-wrap${selected ? ' selected' : ''}${count < 1 ? ' empty' : ''}" data-bait="${b.id}">
      <button type="button" class="bait-chip-item" data-action="select" data-bait="${b.id}" aria-pressed="${selected}" aria-label="${b.name}, ${count} left">
        ${icon}
        <span class="bait-chip-item-count">×${count}</span>
        <span class="bait-chip-item-name">${label}</span>
      </button>
      <button type="button" class="bait-chip-add" data-action="buy" data-bait="${b.id}" aria-label="Buy ${b.name} pack, ${Arcade.formatCoins(b.price)} coins" title="Buy +${b.packSize} · 🪙${Arcade.formatCoins(b.price)}">+</button>
    </div>`;
  }).join('');
}

function bindBaitChipRow() {
  const row = document.getElementById('bait-chip-row');
  if (!row) return;

  row.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    e.stopPropagation();
    if (gameState !== 'idle' || actionBusy) return;

    const baitId = btn.dataset.bait;
    if (btn.dataset.action === 'select') selectBait(baitId);
    else buyBaitPack(baitId);
  });
}

async function refreshState() {
  const st = await Arcade.get('/api/fishing/state');
  gear = st.gear;
  renderBaitRow();
}

async function selectBait(baitId) {
  if (gear.selectedBait === baitId) return;
  sounds?.play('select', { volume: 0.3 });
  gear.selectedBait = baitId;
  renderBaitRow();
  try {
    const r = await Arcade.post('/api/fishing/select-bait', { baitId });
    gear = r.gear;
    renderBaitRow();
  } catch (e) {
    await refreshState();
    Arcade.toast(e.message, 'lose');
  }
}

async function buyBaitPack(baitId) {
  const bait = getBait(baitId);
  if (!bait) return;
  try {
    const r = await Arcade.post('/api/fishing/buy-bait', { baitId });
    gear = r.gear;
    renderBaitRow();
    Arcade.refreshBalance(document.getElementById('balance'));
    sounds?.play('buy', { volume: 0.4 });
    Arcade.toast(`+${bait.packSize} ${bait.name}!`, 'win');
  } catch (e) {
    Arcade.toast(e.message, 'lose');
  }
}

function placeCastVisuals(xPct, yPct) {
  const scene = document.getElementById('ocean-scene');
  const rect = scene.getBoundingClientRect();
  const rodX = rect.width * 0.44;
  const rodY = rect.height * 0.44;
  const bx = rect.width * xPct;
  const by = rect.height * yPct;
  const len = Math.hypot(bx - rodX, by - rodY);
  const angle = (Math.atan2(by - rodY, bx - rodX) * 180) / Math.PI;

  const line = document.getElementById('cast-line');
  line.style.left = `${rodX}px`;
  line.style.top = `${rodY}px`;
  line.style.height = `${len}px`;
  line.style.transform = `rotate(${angle + 90}deg)`;
  line.classList.remove('hidden');

  const bobber = document.getElementById('bobber');
  bobber.style.left = `${xPct * 100}%`;
  bobber.style.top = `${yPct * 100}%`;
  bobber.classList.remove('hidden');

  document.querySelector('.boat-wrap')?.classList.add('casting');
}

function clearCastVisuals() {
  document.getElementById('cast-line').classList.add('hidden');
  document.getElementById('bobber').classList.add('hidden');
  document.getElementById('bobber').classList.remove('biting');
  document.querySelector('.boat-wrap')?.classList.remove('casting');
}

async function castAt(x, y) {
  if (gameState !== 'idle' || actionBusy) return;
  if (selectedBaitCount() < 1) {
    Arcade.toast('No bait — tap + on a chip to buy', 'lose');
    return;
  }
  actionBusy = true;

  try {
    const r = await Arcade.post('/api/fishing/cast', { x, y, baitId: gear.selectedBait });
    activeCast = r.cast;
    gear = r.gear;
    renderBaitRow();

    placeCastVisuals(x, y);
    sounds?.play('cast', { volume: 0.38, duration: 0.65, offset: 0 });
    setTimeout(() => {
      sounds?.play('lure', { volume: 0.52 });
      sounds?.startLureIdle();
    }, 90);
    gameState = 'waiting';
    document.getElementById('ocean-scene').classList.add('waiting-bite');
    document.getElementById('cast-hint').textContent = 'Waiting for a bite…';

    const biteMs = activeCast.biteDelay;
    const waitTimer = setTimeout(() => {
      if (!activeCast || gameState !== 'waiting') return;
      gameState = 'bite';
      document.getElementById('cast-hint').textContent = 'Tap the sea to cast your line';
      document.getElementById('bobber').classList.add('biting');
      sounds?.stopLureIdle();
      sounds?.play('bite', { volume: 0.45 });

      const hype = biteCallout(activeCast.tierKey);
      showCallout(hype.word, { color: hype.color, glow: hype.glow });
      setTimeout(() => startFight(), 900);
    }, biteMs);

    setTimeout(() => {
      if (gameState === 'waiting') {
        document.getElementById('cast-hint').textContent = 'Something might be nibbling…';
      }
    }, biteMs * 0.55);

    activeCast._waitTimer = waitTimer;
  } catch (e) {
    actionBusy = false;
    Arcade.toast(e.message, 'lose');
  }
}

function startFight() {
  const cast = activeCast;
  if (!cast || gameState !== 'bite') return;

  gameState = 'fighting';
  isPulling = false;
  bindFightPull();
  document.getElementById('fight-panel').classList.remove('hidden');
  document.getElementById('ocean-scene').classList.add('fighting');
  sounds?.play('fight', { volume: 0.35 });

  let tension = 0.5;
  let progress = 0;
  lastFightProgress = 0;
  fightStats = { greenTime: 0, totalTime: 0 };
  let fishPhase = Math.random() * Math.PI * 2;
  let last = performance.now();

  const fishPull = cast.fishPull || 0.45;
  const playerPull = 0.58;
  const greenHalf = cast.greenHalf || 0.18;
  const progressRate = cast.progressRate || 0.16;

  function tick(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    fightStats.totalTime += dt;

    fishPhase += dt * (2.2 + fishPull * 2.5);
    const struggle = Math.sin(fishPhase) * 0.38 + Math.sin(fishPhase * 2.1) * 0.14;
    const fishForce = fishPull * (0.65 + struggle);
    const playerForce = isPulling ? playerPull : 0;

    tension += (playerForce - fishForce) * dt * 1.2;
    tension = Math.max(0, Math.min(1, tension));

    const inGreen = Math.abs(tension - 0.5) <= greenHalf;
    if (inGreen) {
      fightStats.greenTime += dt;
      progress += progressRate * dt;
    } else {
      progress = Math.max(0, progress - 0.05 * dt);
    }

    lastFightProgress = progress;
    updateFightUI(tension, progress);

    if (progress >= 1) {
      endFight('caught');
      return;
    }
    if (tension <= 0.06) {
      endFight('escaped');
      return;
    }
    if (tension >= 0.94) {
      endFight('snapped');
      return;
    }

    fightAnim = requestAnimationFrame(tick);
  }

  cancelAnimationFrame(fightAnim);
  fightAnim = requestAnimationFrame(tick);
}

function updateFightUI(tension, progress) {
  const marker = document.getElementById('tension-marker');
  marker.style.left = `${tension * 100}%`;
  marker.classList.toggle('danger-left', tension < 0.12);
  marker.classList.toggle('danger-right', tension > 0.88);
  document.getElementById('progress-runner').style.left = `${Math.min(100, Math.max(0, progress) * 100)}%`;
}

function setResultIcon(fish) {
  const wrap = document.getElementById('result-icon');
  const src = fish ? fishImage(manifest, fish.id) : null;
  if (src && fish) {
    wrap.innerHTML = `<img src="${src}" alt="${fish.name}">`;
  } else {
    wrap.innerHTML = `<span id="result-icon-fallback">${fish?.icon || '💨'}</span>`;
  }
}

function showFightResult(r, cast) {
  const overlay = document.getElementById('result-overlay');
  const card = document.getElementById('result-card');

  if (r.won && r.fish) {
    card.className = 'result-card card win';
    setResultIcon(r.fish);
    const rare = r.fish.rankStars >= 4 || r.fish.rank === 'mythic';
    sounds?.play(rare ? 'catchRare' : 'catch', { volume: rare ? 0.5 : 0.42 });
    document.getElementById('result-rank').textContent = r.fish.rankLabel;
    document.getElementById('result-rank').style.color = r.fish.rankColor;
    document.getElementById('result-name').textContent = r.fish.name;
    const stars = '★'.repeat(r.fish.rankStars);
    document.getElementById('result-detail').textContent =
      `${stars} ${r.fish.rankLabel} · ~🪙${Arcade.formatCoins(r.fish.sellBase)} at market`;
    const grade =
      r.result.grade === 'perfect' ? 'Perfect reel!' : r.result.grade === 'good' ? 'Solid fight!' : 'You landed it!';
    document.getElementById('result-sub').textContent = grade;
    const hype = biteCallout(r.tierKey || cast.tierKey);
    showCallout(catchCallout(r.tierKey || cast.tierKey), { color: hype.color, glow: hype.glow });
    ArcadeFX.confetti(r.fish.rank === 'mythic' ? 14 : r.fish.rankStars >= 4 ? 10 : 6);
    ArcadeFX.burst(window.innerWidth / 2, window.innerHeight * 0.38, r.fish.icon, 6);
  } else {
    card.className = 'result-card card lose';
    setResultIcon(null);
    document.getElementById('result-icon-fallback').textContent =
      r.result.reason === 'snapped' ? '🪢' : '💨';
    sounds?.play(r.result.reason === 'snapped' ? 'snap' : 'escape', { volume: 0.38 });
    document.getElementById('result-rank').textContent = 'Missed';
    document.getElementById('result-rank').style.color = '#ffb3c1';
    document.getElementById('result-name').textContent =
      r.result.reason === 'snapped' ? 'Line snapped!' : 'Fish got away';
    document.getElementById('result-detail').textContent =
      r.result.reason === 'snapped' ? 'You pulled too hard' : 'Too much slack on the line';
    document.getElementById('result-sub').textContent = 'Try again — tap the sea to cast';
  }

  overlay.classList.remove('hidden');
}

function closeResult() {
  document.getElementById('result-overlay').classList.add('hidden');
}

async function endFight(outcome) {
  if (fightEnding) return;
  fightEnding = true;

  cancelAnimationFrame(fightAnim);
  fightAnim = null;
  sounds?.stopReel();
  sounds?.stopLureIdle();
  unbindFightPull();
  isPulling = false;
  gameState = 'idle';

  const cast = activeCast;
  const greenRatio = fightStats.totalTime > 0 ? fightStats.greenTime / fightStats.totalTime : 0;
  const progress = lastFightProgress;

  document.getElementById('fight-panel').classList.add('hidden');
  document.getElementById('ocean-scene').classList.remove('fighting', 'waiting-bite');
  document.getElementById('cast-hint').textContent = 'Tap the sea to cast your line';
  clearCastVisuals();

  activeCast = null;
  actionBusy = false;

  if (!cast) {
    fightEnding = false;
    return;
  }

  try {
    const r = await Arcade.post('/api/fishing/reel', {
      castId: cast.id,
      outcome,
      greenRatio,
      progress,
    });
    showFightResult(r, cast);
    if (r.won) await refreshState();
  } catch (e) {
    Arcade.toast(e.message, 'lose');
  } finally {
    fightEnding = false;
  }
}
