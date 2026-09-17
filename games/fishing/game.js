import { biteCallout, catchCallout } from './bite-words.js';

let gear = { bait: 0 };
let activeCast = null;
let config = {};
let gameState = 'idle'; // idle | waiting | fighting
let actionBusy = false;
let isPulling = false;
let fightAnim = null;
let fightStats = { greenTime: 0, totalTime: 0 };

document.addEventListener('DOMContentLoaded', init);

async function init() {
  document.querySelector('.top-bar a').href = `/?token=${Arcade.token}&player=${Arcade.player}`;
  setupFishToasts();
  initOceanAmbient();
  bindCastAndFightInput();
  await Arcade.refreshBalance(document.getElementById('balance'));
  config = await Arcade.get('/api/fishing/config');
  await refreshState();
  document.getElementById('btn-bait').addEventListener('click', buyBait);
}

function bindCastAndFightInput() {
  const scene = document.getElementById('ocean-scene');

  scene.addEventListener('pointerup', (e) => {
    if (gameState !== 'idle' || actionBusy) return;
    if (e.target.closest('.fish-hud, .top-bar, .fight-panel, button, a')) return;

    const rect = scene.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    if (y > 0.88) return;
    castAt(x, y);
  });

  const pullStart = (e) => {
    if (gameState !== 'fighting') return;
    if (e.target.closest('button, a')) return;
    isPulling = true;
  };
  const pullEnd = () => {
    isPulling = false;
  };

  window.addEventListener('pointerdown', pullStart);
  window.addEventListener('pointerup', pullEnd);
  window.addEventListener('pointercancel', pullEnd);
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

async function refreshState() {
  const st = await Arcade.get('/api/fishing/state');
  gear = st.gear;
  document.getElementById('bait-count').textContent = gear.bait;
}

async function buyBait() {
  try {
    const r = await Arcade.post('/api/fishing/buy-bait');
    gear = r.gear;
    document.getElementById('bait-count').textContent = gear.bait;
    Arcade.refreshBalance(document.getElementById('balance'));
    Arcade.toast(`+${config.baitPackSize} bait!`, 'win');
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
  actionBusy = true;

  try {
    const r = await Arcade.post('/api/fishing/cast', { x, y });
    activeCast = r.cast;
    gear = r.gear;
    document.getElementById('bait-count').textContent = gear.bait;
    Arcade.refreshBalance(document.getElementById('balance'));

    placeCastVisuals(x, y);
    gameState = 'waiting';
    document.getElementById('ocean-scene').classList.add('waiting-bite');
    document.getElementById('cast-hint').textContent = 'Waiting for a bite…';

    const biteMs = activeCast.biteDelay;
    const waitTimer = setTimeout(() => {
      if (!activeCast || gameState !== 'waiting') return;
      gameState = 'bite';
      document.getElementById('cast-hint').textContent = 'Tap the sea to cast your line';
      document.getElementById('bobber').classList.add('biting');

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
  document.getElementById('fight-panel').classList.remove('hidden');
  document.getElementById('ocean-scene').classList.add('fighting');

  let tension = 0.5;
  let progress = 0;
  fightStats = { greenTime: 0, totalTime: 0 };
  let fishPhase = Math.random() * Math.PI * 2;
  let last = performance.now();
  let graceLeft = 2.2;

  const fishPull = cast.fishPull || 0.35;
  const playerPull = 0.48;
  const greenHalf = cast.greenHalf || 0.2;
  const progressRate = cast.progressRate || 0.22;

  function tick(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    fightStats.totalTime += dt;
    graceLeft = Math.max(0, graceLeft - dt);

    fishPhase += dt * (1.8 + fishPull * 1.8);
    const surge = Math.max(0, Math.sin(fishPhase)) * fishPull * 0.55;
    const steadyDrift = fishPull * 0.22;
    const fishForce = steadyDrift + surge;
    const playerForce = isPulling ? playerPull : 0;

    tension += (playerForce - fishForce) * dt;
    tension += (0.5 - tension) * 0.35 * dt;
    tension = Math.max(0, Math.min(1, tension));

    const inGreen = Math.abs(tension - 0.5) <= greenHalf;
    if (inGreen) {
      fightStats.greenTime += dt;
      progress += progressRate * dt;
    } else {
      progress = Math.max(0, progress - 0.03 * dt);
    }

    updateFightUI(tension, progress);

    if (graceLeft <= 0) {
      if (tension <= 0.05) {
        endFight('escaped');
        return;
      }
      if (tension >= 0.95) {
        endFight('snapped');
        return;
      }
    }
    if (progress >= 1) {
      endFight('caught');
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
  document.getElementById('progress-runner').style.left = `${Math.min(100, progress * 100)}%`;
}

async function endFight(outcome) {
  cancelAnimationFrame(fightAnim);
  fightAnim = null;
  isPulling = false;
  gameState = 'idle';

  const cast = activeCast;
  const greenRatio = fightStats.totalTime > 0 ? fightStats.greenTime / fightStats.totalTime : 0;

  document.getElementById('fight-panel').classList.add('hidden');
  document.getElementById('ocean-scene').classList.remove('fighting', 'waiting-bite');
  document.getElementById('cast-hint').textContent = 'Tap the sea to cast your line';
  clearCastVisuals();

  activeCast = null;
  actionBusy = false;

  if (!cast) return;

  try {
    const r = await Arcade.post('/api/fishing/reel', {
      castId: cast.id,
      outcome,
      greenRatio,
    });

    if (outcome === 'escaped') {
      Arcade.toast('Fish got away — too much slack!', 'lose');
      return;
    }
    if (outcome === 'snapped') {
      Arcade.toast('Line snapped — you pulled too hard!', 'lose');
      return;
    }

    if (r.fish) {
      const hype = biteCallout(r.tierKey || cast.tierKey);
      showCallout(catchCallout(r.tierKey || cast.tierKey), { color: hype.color, glow: hype.glow });
      Arcade.toast(`${r.fish.icon} ${r.fish.name} — sell at Black Market!`, 'win');
      const burst = r.tierKey === 'monster' || r.tierKey === 'super' ? 10 : 6;
      ArcadeFX.confetti(burst);
      ArcadeFX.burst(window.innerWidth / 2, window.innerHeight * 0.4, r.fish.icon, burst - 2);
    } else {
      const msg = r.misfortune?.message || 'The fish got away…';
      Arcade.toast(msg, 'lose');
    }
  } catch (e) {
    Arcade.toast(e.message, 'lose');
  }
}
