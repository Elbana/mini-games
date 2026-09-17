let crops = {};
let farm = { plots: [] };
let selectedPlot = null;
let tickTimer = null;

document.addEventListener('DOMContentLoaded', init);

async function init() {
  document.querySelector('.top-bar a').href = `/?token=${Arcade.token}&player=${Arcade.player}`;
  await Arcade.refreshBalance(document.getElementById('balance'));
  const cfg = await Arcade.get('/api/fast-farm/config');
  crops = cfg.crops;
  renderSeedShop();
  await refreshFarm();
  tickTimer = setInterval(refreshFarm, 2000);
  document.getElementById('modal-close').addEventListener('click', closeModal);
}

function assetPath(name) {
  return `/assets/farm/seeds/${name}.webp`;
}

function plantedPath(name) {
  const n = name === 'pumpkin' ? 'pumkin' : name === 'mushroom' ? 'Mushrooms' : name;
  return `/assets/farm/planted/${n}.webp`;
}

async function refreshFarm() {
  const st = await Arcade.get('/api/fast-farm/state');
  farm = st.farm;
  renderPlots();
}

function renderSeedShop() {
  const el = document.getElementById('seed-list');
  el.innerHTML = Object.values(crops)
    .map(
      (c) => `<div class="seed-card">
      <img src="${assetPath(c.asset)}" alt="">
      <div><strong>${c.name}</strong><br>${c.growSec}s · ${c.seedCost}🪙</div>
    </div>`
    )
    .join('');
}

function renderPlots() {
  const el = document.getElementById('plots');
  const now = Date.now();
  el.innerHTML = farm.plots
    .map((p, i) => {
      let cls = 'plot';
      let timer = 'Tap to plant';
      let img = '';
      if (p.crop && !p.dead) {
        const crop = crops[p.crop];
        img = `<img class="crop-img" src="${plantedPath(crop.asset)}" alt="">`;
        if (now >= p.wiltAt) {
          cls += ' dead';
          timer = 'DEAD';
        } else if (now >= p.readyAt) {
          cls += p.needsWater ? ' wilting' : ' ready';
          timer = p.needsWater ? 'HEAL!' : 'HARVEST!';
        } else {
          const sec = Math.ceil((p.readyAt - now) / 1000);
          timer = `${sec}s`;
        }
      } else if (p.dead) {
        cls += ' dead';
        timer = 'Clear';
      }
      return `<div class="${cls}" data-plot="${i}">
        ${img}
        <span class="plot-timer">${timer}</span>
      </div>`;
    })
    .join('');

  el.querySelectorAll('.plot').forEach((plotEl) => {
    plotEl.addEventListener('click', () => onPlotClick(Number(plotEl.dataset.plot)));
  });
}

async function onPlotClick(plotId) {
  const p = farm.plots[plotId];
  const now = Date.now();
  if (!p.crop || p.dead) {
    if (p.dead) {
      await Arcade.post('/api/fast-farm/clear', { plotId });
      await refreshFarm();
      return;
    }
    openPlantModal(plotId);
    return;
  }
  if (now >= p.wiltAt) {
    Arcade.toast('Crop died! Clear and replant.', 'lose');
    return;
  }
  if (p.needsWater) {
    try {
      await Arcade.post('/api/fast-farm/water', { plotId });
      Arcade.toast('Crop healed!', 'win');
      await refreshFarm();
      Arcade.refreshBalance(document.getElementById('balance'));
    } catch (e) {
      Arcade.toast(e.message, 'lose');
    }
    return;
  }
  if (now >= p.readyAt) {
    try {
      const r = await Arcade.post('/api/fast-farm/harvest', { plotId });
      Arcade.toast(`Harvested ${r.qty}× ${crops[p.crop]?.name || 'crop'}!`, 'win');
      ArcadeFX.burst(window.innerWidth / 2, 300, '🌾', 6);
      await refreshFarm();
    } catch (e) {
      Arcade.toast(e.message, 'lose');
    }
  }
}

function openPlantModal(plotId) {
  selectedPlot = plotId;
  document.getElementById('modal-plot').textContent = plotId + 1;
  const el = document.getElementById('modal-seeds');
  el.innerHTML = Object.values(crops)
    .map(
      (c) =>
        `<button class="seed-pick" data-crop="${c.id}">
        <img src="${assetPath(c.asset)}" alt="">
        <span>${c.name} — ${c.seedCost} coins</span>
      </button>`
    )
    .join('');
  el.querySelectorAll('.seed-pick').forEach((btn) => {
    btn.addEventListener('click', () => plant(selectedPlot, btn.dataset.crop));
  });
  document.getElementById('plant-modal').classList.remove('hidden');
}

function closeModal() {
  document.getElementById('plant-modal').classList.add('hidden');
}

async function plant(plotId, cropId) {
  try {
    await Arcade.post('/api/fast-farm/plant', { plotId, cropId });
    closeModal();
    Arcade.toast('Planted!', 'win');
    await refreshFarm();
    Arcade.refreshBalance(document.getElementById('balance'));
  } catch (e) {
    Arcade.toast(e.message, 'lose');
  }
}
