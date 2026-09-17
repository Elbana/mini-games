let gear = { bait: 0 };
let activeCast = null;
let pointerPos = 0;
let pointerDir = 1;
let animFrame = null;
let config = {};

document.addEventListener('DOMContentLoaded', init);

async function init() {
  document.querySelector('.top-bar a').href = `/?token=${Arcade.token}&player=${Arcade.player}`;
  await Arcade.refreshBalance(document.getElementById('balance'));
  config = await Arcade.get('/api/fishing/config');
  await refreshState();
  document.getElementById('btn-bait').addEventListener('click', buyBait);
  document.getElementById('btn-cast').addEventListener('click', castLine);
  document.getElementById('btn-reel').addEventListener('click', reelIn);
  document.getElementById('btn-ok').addEventListener('click', () => {
    document.getElementById('catch-popup').classList.add('hidden');
  });
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
  try {
    const r = await Arcade.post('/api/fishing/reel', {
      castId: activeCast.id,
      pointer: pointerPos,
    });
    activeCast = null;
    if (r.fish) {
      document.getElementById('catch-icon').textContent = r.fish.icon;
      document.getElementById('catch-name').textContent = r.fish.name;
      document.getElementById('catch-grade').textContent =
        r.result.grade === 'perfect'
          ? 'PERFECT! Sell at Black Market 🖤'
          : r.result.grade === 'good'
            ? 'Good catch!'
            : 'Small catch…';
      document.getElementById('catch-popup').classList.remove('hidden');
      document.getElementById('fish-hint').textContent = 'Sell loot in the Hub!';
      ArcadeFX.confetti(16);
      ArcadeFX.burst(window.innerWidth / 2, window.innerHeight / 3, r.fish.icon, 10);
    } else {
      const msg = r.misfortune?.message || (r.result.grade === 'fail' ? 'Fish got away!' : 'Nothing on the line…');
      Arcade.toast(msg, 'lose');
      document.getElementById('fish-hint').textContent = 'Bad luck happens — try again!';
    }
  } catch (e) {
    Arcade.toast(e.message, 'lose');
  }
}
