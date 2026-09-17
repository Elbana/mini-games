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
      setTimeout(() => el.remove(), 220);
    }, 2000);
  };
}

/** Fish shadows + surface ripples for alive water feel */
function initOceanAmbient() {
  const shadowRoot = document.getElementById('fish-shadows');
  const rippleRoot = document.getElementById('ripple-field');
  if (!shadowRoot || !rippleRoot) return;

  const fishCount = 10;
  for (let i = 0; i < fishCount; i += 1) {
    spawnFishShadow(shadowRoot, i === 0);
  }

  for (let i = 0; i < 6; i += 1) {
    spawnRipple(rippleRoot);
  }
}

function spawnFishShadow(container, isBig = false) {
  const el = document.createElement('div');
  el.className = isBig ? 'fish-shadow big' : 'fish-shadow';

  const w = isBig ? 90 + Math.random() * 50 : 28 + Math.random() * 36;
  const h = w * 0.32;
  const scale = 0.7 + Math.random() * 0.8;
  const angle = Math.random() * 360;
  const dur = 14 + Math.random() * 20;

  const x0 = `${-10 + Math.random() * 120}%`;
  const y0 = `${-10 + Math.random() * 120}%`;
  const x1 = `${-20 + Math.random() * 140}%`;
  const y1 = `${-20 + Math.random() * 140}%`;

  el.style.setProperty('--fish-w', `${w}px`);
  el.style.setProperty('--fish-h', `${h}px`);
  el.style.setProperty('--fish-scale', scale.toFixed(2));
  el.style.setProperty('--fish-dur', `${dur}s`);
  el.style.setProperty('--fish-delay', `${Math.random() * dur}s`);
  el.style.setProperty('--fish-opacity', isBig ? '0.45' : `${0.55 + Math.random() * 0.3}`);
  el.style.setProperty('--rot', `${angle}deg`);
  el.style.setProperty('--x0', x0);
  el.style.setProperty('--y0', y0);
  el.style.setProperty('--x1', x1);
  el.style.setProperty('--y1', y1);

  container.appendChild(el);
}

function spawnRipple(container) {
  const el = document.createElement('div');
  el.className = 'ripple';
  el.style.left = `${8 + Math.random() * 84}%`;
  el.style.top = `${8 + Math.random() * 84}%`;
  el.style.setProperty('--ripple-size', `${24 + Math.random() * 36}px`);
  el.style.setProperty('--ripple-dur', `${3 + Math.random() * 4}s`);
  el.style.setProperty('--ripple-delay', `${Math.random() * 5}s`);
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
      ArcadeFX.confetti(12);
      ArcadeFX.burst(window.innerWidth / 2, window.innerHeight * 0.42, r.fish.icon, 8);
    } else {
      const msg = r.misfortune?.message || (r.result.grade === 'fail' ? 'Fish got away!' : 'Nothing on the line…');
      Arcade.toast(msg, 'lose');
    }
  } catch (e) {
    Arcade.toast(e.message, 'lose');
  }
}
