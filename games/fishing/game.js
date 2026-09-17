let gear = { bait: 0 };
let activeCast = null;
let pointerPos = 0;
let pointerDir = 1;
let animFrame = null;
let config = {};

document.addEventListener('DOMContentLoaded', init);

async function init() {
  document.querySelector('.top-bar a').href = `/?token=${Arcade.token}&player=${Arcade.player}`;
  setupFishToasts();
  initOceanAmbient();
  await Arcade.refreshBalance(document.getElementById('balance'));
  config = await Arcade.get('/api/fishing/config');
  await refreshState();
  document.getElementById('btn-bait').addEventListener('click', buyBait);
  document.getElementById('btn-cast').addEventListener('click', castLine);
  document.getElementById('btn-reel').addEventListener('click', reelIn);
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

/** Calm fish shadows gliding under the boat + soft ripples */
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

  initBirds();
}

function initBirds() {
  const root = document.getElementById('bird-field');
  if (!root) return;

  for (let i = 0; i < 7; i += 1) {
    spawnBird(root, { delayRatio: i / 7 });
  }

  for (let i = 0; i < 3; i += 1) {
    spawnBirdFlock(root, 2 + Math.floor(Math.random() * 2), i / 3);
  }
}

function spawnBird(container, { flockOffset = 0, flip = Math.random() > 0.5, delayRatio = Math.random(), y = null } = {}) {
  const el = document.createElement('div');
  el.className = `sky-bird${flip ? ' flip' : ''}`;
  el.innerHTML = '<span class="bird-wing bird-wing-l"></span><span class="bird-wing bird-wing-r"></span>';

  const dur = 16 + Math.random() * 20;
  const yPos = y ?? 6 + Math.random() * 32;
  const drift = (Math.random() - 0.5) * 6;

  el.style.setProperty('--bird-dur', `${dur}s`);
  el.style.setProperty('--bird-delay', `${delayRatio * dur + flockOffset}s`);
  el.style.setProperty('--bird-y', `${yPos}vh`);
  el.style.setProperty('--bird-drift', `${drift}vh`);
  el.style.setProperty('--bird-scale', (0.65 + Math.random() * 0.55).toFixed(2));

  container.appendChild(el);
}

function spawnBirdFlock(container, count, delayRatio) {
  const y = 10 + Math.random() * 22;
  const flip = Math.random() > 0.5;
  for (let i = 0; i < count; i += 1) {
    spawnBird(container, {
      flockOffset: i * 1.4,
      flip,
      delayRatio,
      y: y + i * 1.8 + (Math.random() - 0.5) * 2,
    });
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

async function castLine() {
  try {
    const r = await Arcade.post('/api/fishing/cast');
    activeCast = r.cast;
    gear = r.gear;
    document.getElementById('bait-count').textContent = gear.bait;
    Arcade.refreshBalance(document.getElementById('balance'));
    startReelGame();
  } catch (e) {
    Arcade.toast(e.message, 'lose');
  }
}

function startReelGame() {
  const overlay = document.getElementById('reel-overlay');
  const zone = document.getElementById('reel-zone');
  const track = zone.parentElement;
  const trackW = track.offsetWidth;
  const zoneW = activeCast.targetWidth * trackW;
  const zoneLeft = activeCast.targetCenter * trackW - zoneW / 2;
  zone.style.width = `${zoneW}px`;
  zone.style.left = `${Math.max(0, zoneLeft)}px`;
  overlay.classList.remove('hidden');
  document.querySelector('.boat-wrap')?.classList.add('casting');
  pointerPos = 0;
  pointerDir = 1;
  const speed = 0.012 + Math.random() * 0.008;
  function tick() {
    pointerPos += pointerDir * speed;
    if (pointerPos >= 1) {
      pointerPos = 1;
      pointerDir = -1;
    }
    if (pointerPos <= 0) {
      pointerPos = 0;
      pointerDir = 1;
    }
    document.getElementById('reel-pointer').style.left = `calc(${pointerPos * 100}% - 2px)`;
    animFrame = requestAnimationFrame(tick);
  }
  cancelAnimationFrame(animFrame);
  tick();
}

async function reelIn() {
  cancelAnimationFrame(animFrame);
  document.getElementById('reel-overlay').classList.add('hidden');
  document.querySelector('.boat-wrap')?.classList.remove('casting');
  try {
    const r = await Arcade.post('/api/fishing/reel', {
      castId: activeCast.id,
      pointer: pointerPos,
    });
    activeCast = null;
    if (r.fish) {
      const grade =
        r.result.grade === 'perfect'
          ? 'PERFECT!'
          : r.result.grade === 'good'
            ? 'Good catch'
            : 'Small catch';
      Arcade.toast(`${r.fish.icon} ${r.fish.name} — ${grade}`, 'win');
      ArcadeFX.confetti(6);
      ArcadeFX.burst(window.innerWidth / 2, window.innerHeight * 0.45, r.fish.icon, 4);
    } else {
      const msg = r.misfortune?.message || (r.result.grade === 'fail' ? 'Fish got away!' : 'Nothing on the line…');
      Arcade.toast(msg, 'lose');
    }
  } catch (e) {
    Arcade.toast(e.message, 'lose');
  }
}
