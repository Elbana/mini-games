/** Fast Farm client — mirrors Riko Flutter farm_screen.dart */

let seeds = {};
let seedList = [];
let farm = null;
let selectedSeed = null;
let unlockPlotIndex = null;
let sellQty = {};
let tickTimer = null;

const CIRC = 2 * Math.PI * 18;

document.addEventListener('DOMContentLoaded', init);

async function init() {
  document.getElementById('btn-hub').href = `/?token=${Arcade.token}&player=${Arcade.player}`;

  const cfg = await Arcade.get('/api/fast-farm/config');
  seedList = cfg.seeds || [];
  seeds = Object.fromEntries(seedList.map((s) => [s.id, s]));

  bindUi();
  await refreshFarm();
  tickTimer = setInterval(refreshFarm, 1000);
}

function bindUi() {
  document.getElementById('btn-shop').addEventListener('click', openShop);
  document.getElementById('btn-backpack').addEventListener('click', () => openBackpack('inventory'));
  document.getElementById('btn-sell').addEventListener('click', () => openBackpack('sell'));
  document.getElementById('seed-banner-close').addEventListener('click', clearSelectedSeed);
  document.getElementById('btn-unlock-confirm').addEventListener('click', confirmUnlock);

  document.querySelectorAll('[data-close]').forEach((el) => {
    el.addEventListener('click', () => closeSheet(el.dataset.close));
  });

  document.querySelectorAll('.sheet-tab').forEach((tab) => {
    tab.addEventListener('click', () => switchBackpackTab(tab.dataset.tab));
  });
}

function assetSeed(name) {
  return `/assets/farm/seeds/${name}.webp`;
}

function assetPlanted(name) {
  return `/assets/farm/planted/${name}.webp`;
}

function assetIcon(name) {
  return `/assets/farm/icon/${name}.webp`;
}

function formatGrow(sec) {
  if (sec >= 3600) return `${Math.round(sec / 3600)}h`;
  return `${Math.round(sec / 60)}m`;
}

function formatRemaining(ms) {
  if (ms <= 0) return '0s';
  const totalSec = Math.ceil(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

async function refreshFarm() {
  const st = await Arcade.get('/api/fast-farm/state');
  farm = normalizeState(st);
  renderHud();
  renderPlots();
}

/** Accept new API shape; reset if old session format is returned. */
function normalizeState(st) {
  if (st?.plots?.length && st.farm_coins != null) return st;
  if (st?.farm?.plots?.length && st.farm.plots[0]?.crop !== undefined) {
    return {
      farm_coins: 100,
      farm_xp: 0,
      farm_level: 1,
      plots: defaultPlotsFallback(),
      inventory: [],
    };
  }
  return {
    farm_coins: st?.farm_coins ?? 100,
    farm_xp: st?.farm_xp ?? 0,
    farm_level: st?.farm_level ?? 1,
    plots: st?.plots?.length ? st.plots : defaultPlotsFallback(),
    inventory: st?.inventory ?? [],
  };
}

function defaultPlotsFallback() {
  const plots = [];
  for (let i = 0; i < 9; i++) {
    if (i >= 6) {
      plots.push({ plot_index: i, state: 'empty', seed_id: null, planted_at: null, unlock_price: 0 });
    } else {
      const costs = [100, 300, 1000, 3000, 10000, 30000];
      plots.push({
        plot_index: i,
        state: 'locked',
        seed_id: null,
        planted_at: null,
        unlock_price: costs[5 - i] ?? 50000,
      });
    }
  }
  return plots;
}

function renderHud() {
  document.getElementById('farm-coins').textContent = farm.farm_coins ?? 0;
  document.getElementById('farm-level').textContent = `Lv.${farm.farm_level ?? 1}`;
  document.getElementById('shop-coins').textContent = farm.farm_coins ?? 0;
  document.getElementById('bag-coins').textContent = farm.farm_coins ?? 0;

  const total = (farm.inventory || []).reduce((s, i) => s + i.quantity, 0);
  const badge = document.getElementById('bag-badge');
  if (total > 0) {
    badge.textContent = total;
    badge.classList.remove('hidden');
  } else {
    badge.classList.add('hidden');
  }

  document.getElementById('backpack-count').textContent = `${total} items collected`;
}

function plotAsset(plot) {
  if (isReady(plot) && plot.seed_id) {
    const seed = seeds[plot.seed_id];
    if (seed) return assetPlanted(seed.assets.planted);
  }
  switch (plot.state) {
    case 'locked':
      return '/assets/farm/plot-tile-green.webp';
    case 'empty':
      return '/assets/farm/plot-tile.webp';
    case 'growing':
    case 'ready':
      return '/assets/farm/plot-seeded.webp';
    default:
      return '/assets/farm/plot-tile.webp';
  }
}

function isReady(plot) {
  if (!plot.seed_id || !plot.planted_at) return false;
  if (plot.state !== 'growing' && plot.state !== 'ready') return false;
  const seed = seeds[plot.seed_id];
  if (!seed) return false;
  const elapsed = (Date.now() - new Date(plot.planted_at).getTime()) / 1000;
  return elapsed >= seed.growSeconds;
}

function isGrowing(plot) {
  return plot.state === 'growing' && plot.seed_id && !isReady(plot);
}

function growthProgress(plot) {
  const seed = seeds[plot.seed_id];
  if (!seed || !plot.planted_at) return 0;
  const elapsed = (Date.now() - new Date(plot.planted_at).getTime()) / 1000;
  return Math.min(1, Math.max(0, elapsed / seed.growSeconds));
}

function renderPlots() {
  const grid = document.getElementById('farm-grid');
  grid.innerHTML = (farm.plots || [])
    .map((plot, i) => {
      const growing = isGrowing(plot);
      const ready = isReady(plot);
      let indicator = '';

      if (growing) {
        const seed = seeds[plot.seed_id];
        const progress = growthProgress(plot);
        const offset = CIRC * (1 - progress);
        indicator = `
          <div class="grow-indicator">
            <div class="grow-ring-wrap">
              <svg viewBox="0 0 44 44" aria-hidden="true">
                <circle class="track" cx="22" cy="22" r="18"></circle>
                <circle class="progress" cx="22" cy="22" r="18"
                  stroke-dasharray="${CIRC.toFixed(2)}"
                  stroke-dashoffset="${offset.toFixed(2)}"></circle>
              </svg>
              <img class="grow-icon" src="${assetIcon(seed.assets.icon)}" alt="">
            </div>
            <div class="grow-connector"></div>
          </div>`;
      }

      const lockOverlay =
        plot.state === 'locked'
          ? '<div class="plot-lock" aria-hidden="true">🔒</div>'
          : '';

      return `<div class="plot-cell" data-plot="${i}" role="gridcell">
        <img class="plot-img" src="${plotAsset(plot)}" alt="">
        ${lockOverlay}
        ${indicator}
      </div>`;
    })
    .join('');

  grid.querySelectorAll('.plot-cell').forEach((el) => {
    el.addEventListener('click', () => onPlotTap(Number(el.dataset.plot)));
  });
}

async function onPlotTap(index) {
  const plot = farm.plots[index];
  if (!plot) return;

  if (plot.state === 'locked') {
    unlockPlotIndex = index;
    document.getElementById('unlock-price').textContent = plot.unlock_price;
    document.getElementById('dialog-unlock').classList.remove('hidden');
    return;
  }

  if (plot.state === 'empty') {
    if (selectedSeed) {
      await plantSeed(index);
    } else {
      Arcade.toast('🛒 Buy seeds first — tap Seeds below', 'lose');
    }
    return;
  }

  if (isGrowing(plot)) {
    if (isReady(plot)) {
      await harvest(index);
    } else {
      const seed = seeds[plot.seed_id];
      const remaining = seed.growSeconds * 1000 - (Date.now() - new Date(plot.planted_at).getTime());
      Arcade.toast(`⏱️ ${seed.name} ready in ${formatRemaining(remaining)}`, 'win');
    }
    return;
  }

  if (plot.state === 'ready' || isReady(plot)) {
    await harvest(index);
  }
}

function clearSelectedSeed() {
  selectedSeed = null;
  updateSeedBanner();
}

function updateSeedBanner() {
  const banner = document.getElementById('seed-banner');
  if (!selectedSeed) {
    banner.classList.add('hidden');
    return;
  }
  banner.classList.remove('hidden');
  document.getElementById('seed-banner-img').src = assetSeed(selectedSeed.assets.seed);
  document.getElementById('seed-banner-text').textContent = `${selectedSeed.name} selected — tap a plot to plant`;
}

function selectSeed(seed) {
  if (farm.farm_level < seed.requiredLevel) {
    Arcade.toast(`🔒 Requires farm level ${seed.requiredLevel}`, 'lose');
    return;
  }
  if (farm.farm_coins < seed.price) {
    Arcade.toast('❌ Not enough coins', 'lose');
    return;
  }
  selectedSeed = seed;
  updateSeedBanner();
  closeSheet('sheet-shop');
  Arcade.toast(`🌱 ${seed.name} selected — tap a plot to plant`, 'win');
}

async function plantSeed(index) {
  if (!selectedSeed) return;
  const seedId = selectedSeed.id;
  selectedSeed = null;
  updateSeedBanner();

  try {
    await Arcade.post('/api/fast-farm/buy-seed', {
      seed_id: seedId,
      plot_index: index,
    });
    Arcade.toast('🌱 Planted! Wait for it to grow', 'win');
    await refreshFarm();
  } catch (e) {
    Arcade.toast(e.message || 'Failed to plant', 'lose');
  }
}

async function harvest(index) {
  const plot = farm.plots[index];
  const seed = seeds[plot?.seed_id];
  if (!seed) return;

  try {
    const r = await Arcade.post('/api/fast-farm/harvest', { plot_index: index });
    const amount = r.harvested?.amount ?? seed.harvestAmount;
    addFloatEffect(`+${amount} ${seed.name}`, 'green');
    Arcade.toast(`🌾 Harvested ${amount}× ${seed.name}!`, 'win');
    await refreshFarm();
    if (document.getElementById('sheet-backpack') && !document.getElementById('sheet-backpack').classList.contains('hidden')) {
      renderBackpack();
    }
  } catch (e) {
    Arcade.toast(e.message || 'Failed to harvest', 'lose');
  }
}

async function confirmUnlock() {
  if (unlockPlotIndex == null) return;
  try {
    await Arcade.post('/api/fast-farm/unlock-plot', { plot_index: unlockPlotIndex });
    closeSheet('dialog-unlock');
    unlockPlotIndex = null;
    Arcade.toast('🎉 Plot unlocked!', 'win');
    await refreshFarm();
  } catch (e) {
    Arcade.toast(e.message || 'Failed to unlock', 'lose');
  }
}

function openShop() {
  renderSeedShop();
  document.getElementById('sheet-shop').classList.remove('hidden');
}

function renderSeedShop() {
  const el = document.getElementById('seed-grid');
  const level = farm.farm_level ?? 1;
  const coins = farm.farm_coins ?? 0;

  el.innerHTML = seedList
    .map((seed) => {
      const unlocked = level >= seed.requiredLevel;
      const canAfford = coins >= seed.price;
      let cls = 'seed-card';
      if (!unlocked) cls += ' locked';
      else if (!canAfford) cls += ' afford-none';

      let overlay = '';
      if (!unlocked) {
        overlay = `<div class="seed-card-overlay"><span>🔒</span><span class="lock-badge">🌿 Level ${seed.requiredLevel}</span></div>`;
      } else if (!canAfford) {
        overlay = `<div class="seed-card-overlay"><span class="lock-badge">💸 Need more coins</span></div>`;
      }

      return `<div class="${cls}" data-seed="${seed.id}">
        ${overlay}
        <div class="seed-card-img"><img src="${assetSeed(seed.assets.seed)}" alt=""></div>
        <h4>${seed.name}</h4>
        <p class="desc">${seed.description}</p>
        <div class="seed-card-meta">
          <span>⏱️ ${formatGrow(seed.growSeconds)}</span>
          <span>🌾 x${seed.harvestAmount}</span>
        </div>
        <div class="seed-card-price"><span class="coin-icon">🪙</span> ${seed.price}</div>
      </div>`;
    })
    .join('');

  el.querySelectorAll('.seed-card:not(.locked):not(.afford-none)').forEach((card) => {
    card.addEventListener('click', () => selectSeed(seeds[card.dataset.seed]));
  });
}

function openBackpack(tab = 'inventory') {
  sellQty = {};
  renderBackpack();
  switchBackpackTab(tab);
  document.getElementById('sheet-backpack').classList.remove('hidden');
}

function switchBackpackTab(tab) {
  document.querySelectorAll('.sheet-tab').forEach((t) => {
    t.classList.toggle('active', t.dataset.tab === tab);
  });
  document.getElementById('tab-inventory').classList.toggle('hidden', tab !== 'inventory');
  document.getElementById('tab-sell').classList.toggle('hidden', tab !== 'sell');
}

function renderBackpack() {
  const inv = farm.inventory || [];
  const invEl = document.getElementById('tab-inventory');
  const sellEl = document.getElementById('tab-sell');

  if (!inv.length) {
    const empty = `<div class="empty-backpack">
      <div class="emoji">🌱</div>
      <h3>Backpack empty</h3>
      <p>Harvest crops to fill your bag!</p>
    </div>`;
    invEl.innerHTML = empty;
    sellEl.innerHTML = empty;
    return;
  }

  invEl.innerHTML = `<div class="inv-grid">${inv
    .map((item) => {
      const seed = seeds[item.crop_id];
      if (!seed) return '';
      return `<div class="inv-card">
        <span class="inv-qty">x${item.quantity}</span>
        <img src="${assetIcon(seed.assets.icon)}" alt="">
        <span>${seed.name}</span>
      </div>`;
    })
    .join('')}</div>`;

  sellEl.innerHTML = inv
    .map((item) => {
      const seed = seeds[item.crop_id];
      if (!seed) return '';
      const qty = sellQty[item.crop_id] ?? 0;
      return `<div class="sell-row" data-crop="${item.crop_id}">
        <img src="${assetIcon(seed.assets.icon)}" alt="">
        <div class="sell-info">
          <strong>${seed.name}</strong>
          <small>Available: ${item.quantity} · 🪙 ${seed.sellPrice} each</small>
        </div>
        <div class="qty-controls">
          <button type="button" class="qty-btn qty-minus" ${qty <= 0 ? 'disabled' : ''}>−</button>
          <span class="qty-val">${qty}</span>
          <button type="button" class="qty-btn qty-plus" ${qty >= item.quantity ? 'disabled' : ''}>+</button>
        </div>
        ${qty > 0 ? `<button type="button" class="btn-dialog primary sell-one" style="margin-left:8px;padding:8px 12px">Sell</button>` : ''}
      </div>`;
    })
    .join('');

  sellEl.querySelectorAll('.sell-row').forEach((row) => {
    const cropId = row.dataset.crop;
    const max = inv.find((i) => i.crop_id === cropId)?.quantity ?? 0;
    row.querySelector('.qty-minus')?.addEventListener('click', () => {
      sellQty[cropId] = Math.max(0, (sellQty[cropId] ?? 0) - 1);
      renderBackpack();
      switchBackpackTab('sell');
    });
    row.querySelector('.qty-plus')?.addEventListener('click', () => {
      sellQty[cropId] = Math.min(max, (sellQty[cropId] ?? 0) + 1);
      renderBackpack();
      switchBackpackTab('sell');
    });
    row.querySelector('.sell-one')?.addEventListener('click', () => sellCrop(cropId, sellQty[cropId] ?? 0));
  });
}

async function sellCrop(cropId, quantity) {
  if (!quantity) return;
  try {
    const r = await Arcade.post('/api/fast-farm/sell', { crop_id: cropId, quantity });
    addFloatEffect(`+${r.earned_coins} 🪙`, 'amber');
    if (r.leveled_up) {
      Arcade.toast(`🎉 Farm level ${r.farm_level}!`, 'win');
    }
    sellQty[cropId] = 0;
    await refreshFarm();
    renderBackpack();
    switchBackpackTab('sell');
  } catch (e) {
    Arcade.toast(e.message || 'Failed to sell', 'lose');
  }
}

function closeSheet(id) {
  document.getElementById(id)?.classList.add('hidden');
  if (id === 'dialog-unlock') unlockPlotIndex = null;
}

function addFloatEffect(text, colorClass) {
  const el = document.createElement('div');
  el.className = `float-effect ${colorClass}`;
  el.textContent = text;
  el.style.top = '50%';
  document.getElementById('fx-layer').appendChild(el);
  setTimeout(() => el.remove(), 2000);
}
