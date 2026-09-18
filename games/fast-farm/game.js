/** Fast Farm v7 — chill care, daily harvest swings, sell at Black Market. */

let seeds = {};
let seedList = [];
let farm = null;
let walletBalance = 0;
let careRules = { stepsToHarvest: 6, careWindowSec: 18 };
let dailyMood = null;
let activePlot = null;
let tickTimer = null;
let actionBusy = false;
let skipPlotRender = false;
let lastPlotsJson = '';
const FARM_TICK_MS = 1500;
const MARKET_TO_SEED = {
  crop_carrot: 'carrot',
  crop_potato: 'potato',
  crop_beans: 'beans',
  crop_corn: 'corn',
  crop_cabbage: 'cabbage',
  crop_berry: 'berry',
  crop_pumpkin: 'pumpkin',
  crop_mushroom: 'mushroom',
};

document.addEventListener('DOMContentLoaded', init);

async function init() {
  document.getElementById('btn-hub').href = `/?token=${Arcade.token}&player=${Arcade.player}`;

  const cfg = await Arcade.get('/api/fast-farm/config');
  seedList = cfg.seeds || [];
  seeds = Object.fromEntries(seedList.map((s) => [s.id, s]));
  if (cfg.careRules) careRules = cfg.careRules;

  setupFarmToast();
  bindUi();
  await refreshFarm();
  await refreshWallet();
  startFarmTick();
  const syncFarmTick = () => {
    if (window.__arcadePaused || document.visibilityState !== 'visible') stopFarmTick();
    else startFarmTick();
  };
  document.addEventListener('visibilitychange', syncFarmTick);
  document.addEventListener('pagehide', stopFarmTick);
  registerArcadeGameShutdown(stopFarmTick);
}

function startFarmTick() {
  if (tickTimer) return;
  tickTimer = setInterval(refreshFarm, FARM_TICK_MS);
}

function stopFarmTick() {
  if (!tickTimer) return;
  clearInterval(tickTimer);
  tickTimer = null;
}

function setupFarmToast() {
  const zone = document.getElementById('toast-zone');
  const MAX_TOASTS = 2;

  Arcade.toast = (msg, type = '') => {
    while (zone.children.length >= MAX_TOASTS) {
      zone.lastElementChild?.remove();
    }
    const el = document.createElement('div');
    el.className = `farm-toast ${type}`.trim();
    el.textContent = msg;
    zone.insertBefore(el, zone.firstChild);
    requestAnimationFrame(() => el.classList.add('show'));
    setTimeout(() => {
      el.classList.remove('show');
      setTimeout(() => el.remove(), 180);
    }, 900);
  };
}

function bindUi() {
  document.getElementById('btn-harvest').addEventListener('click', openBackpack);
  document.querySelectorAll('[data-close]').forEach((el) => {
    el.addEventListener('click', () => closeSheet(el.dataset.close));
  });

  const scene = document.getElementById('farm-scene');
  let lastPlotTapAt = 0;

  function tapPlotFromEvent(e, clientX, clientY) {
    if (actionBusy) return;
    if (e.target?.closest?.('.farm-top-bar, .farm-sheet:not(.hidden)')) return;

    const now = Date.now();
    if (now - lastPlotTapAt < 100) return;

    const target =
      e.target?.closest?.('.plot-cell') ||
      document.elementFromPoint(clientX, clientY)?.closest?.('.plot-cell');
    if (!target) return;

    lastPlotTapAt = now;
    if (e.cancelable) e.preventDefault();
    handlePlotTap(Number(target.dataset.plot));
  }

  const tapOpts = { capture: true, passive: false };
  scene.addEventListener('pointerup', (e) => tapPlotFromEvent(e, e.clientX, e.clientY), tapOpts);
  scene.addEventListener('click', (e) => tapPlotFromEvent(e, e.clientX, e.clientY), tapOpts);
  scene.addEventListener(
    'touchend',
    (e) => {
      const t = e.changedTouches[0];
      if (!t) return;
      tapPlotFromEvent(e, t.clientX, t.clientY);
    },
    tapOpts
  );
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

function fmtCoins(n) {
  return Arcade.formatCoins(n);
}

function plotCareCosts(plot) {
  if (plot?.care_costs) return plot.care_costs;
  const seed = seeds[plot?.seed_id];
  if (!seed) return { fertilize: 15, heal: 25 };
  return { fertilize: seed.fertilizeCost, heal: seed.healCost };
}

async function refreshFarm() {
  if (window.__arcadePaused) return;
  const st = await Arcade.get('/api/fast-farm/state');
  if (window.__arcadePaused) return;
  const newPlots = st.plots?.length ? st.plots : defaultPlots();
  const plotsJson = JSON.stringify(newPlots);
  const inventoryJson = JSON.stringify(st.inventory || {});
  const plotsChanged = plotsJson !== lastPlotsJson;
  const inventoryChanged = inventoryJson !== JSON.stringify(farm?.inventory || {});

  farm = { plots: newPlots, inventory: st.inventory || {} };
  if (st.careRules) careRules = st.careRules;
  if (st.dailyMood) {
    dailyMood = st.dailyMood;
    renderDailyMood();
  }

  if (inventoryChanged) renderHud();
  if (!skipPlotRender && plotsChanged) {
    lastPlotsJson = plotsJson;
    renderPlots();
  }
  if (activePlot != null && !document.getElementById('sheet-plot').classList.contains('hidden')) {
    openPlotSheet(activePlot, false);
  }
}

async function refreshWallet() {
  try {
    const bal = await Arcade.get('/api/v1/balance');
    walletBalance = bal.balance ?? 0;
  } catch {
    walletBalance = 0;
  }
}

function defaultPlots() {
  return Array.from({ length: 9 }, (_, i) => ({
    plot_index: i,
    state: 'empty',
    seed_id: null,
    care_step: 0,
    care_type: null,
  }));
}

function renderHud() {
  const inv = farm.inventory || {};
  const entries = Object.entries(inv).filter(([, qty]) => qty > 0);
  const total = entries.reduce((s, [, n]) => s + n, 0);
  const chip = document.getElementById('btn-harvest');
  const chipText = document.getElementById('harvest-chip-text');

  if (total > 0) {
    chip.classList.remove('hidden');
    const top = entries
      .sort((a, b) => b[1] - a[1])
      .slice(0, 2)
      .map(([itemId, qty]) => {
        const seed = seeds[MARKET_TO_SEED[itemId]];
        return seed ? `${seed.name} ×${qty}` : `×${qty}`;
      });
    const extra = entries.length > 2 ? ` +${entries.length - 2}` : '';
    chipText.textContent = top.join(' · ') + extra;
  } else {
    chip.classList.add('hidden');
  }

  document.getElementById('backpack-count').textContent =
    total > 0 ? `${total} crops harvested — sell in Hub` : '0 crops harvested';
}

function plotIsReady(plot) {
  return plot.ready || plot.state === 'ready';
}

function plotBaseAsset(plot, seed) {
  if (plot.state === 'empty' || plot.state === 'dead') return '/assets/farm/plot-tile.webp';
  if (plotIsReady(plot) && seed) return assetPlanted(seed.assets.planted);
  return '/assets/farm/plot-seeded.webp';
}

function careIsActive(plot) {
  return plot.needs_care || plot.state === 'wilting';
}

function cropVisualClass(plot) {
  if (plot.ready || plot.state === 'ready') return 'crop-ready';
  if (plot.state === 'dead') return 'crop-dead';
  if (!careIsActive(plot)) return 'crop-ok';
  if (plot.state === 'wilting') return 'crop-wilting';
  if (plot.care_type === 'sick') return 'crop-sick';
  if (plot.care_type === 'fertilize') return 'crop-hungry';
  if (plot.care_type === 'water') return 'crop-thirsty';
  return 'crop-ok';
}

function careLabel(plot) {
  if (plot.ready || plot.state === 'ready') return '⭐';
  if (plot.state === 'dead') return '💀';
  if (!careIsActive(plot)) return '';
  if (plot.state === 'wilting') return '⚠️';
  if (plot.care_type === 'sick') return '🤒';
  if (plot.care_type === 'fertilize') return '🌿';
  if (plot.care_type === 'water') return '💧';
  return '';
}

function careActionForPlot(plot) {
  if (plot.care_type === 'fertilize') return 'fertilize';
  if (plot.care_type === 'sick') return 'heal';
  return 'water';
}

function renderPlots() {
  const grid = document.getElementById('farm-grid');
  grid.innerHTML = (farm.plots || [])
    .map((plot, i) => {
      const growing = plot.seed_id && plot.state !== 'empty' && plot.state !== 'dead';
      const seed = plot.seed_id ? seeds[plot.seed_id] : null;
      const cropCls = cropVisualClass(plot);
      const badge = careLabel(plot);

      let cropHtml = '';
      if (growing && !plotIsReady(plot) && seed) {
        cropHtml = `
          <div class="plot-crop ${cropCls}">
            <img class="crop-sprite" src="${assetIcon(seed.assets.icon)}" alt="">
            <span class="sick-veil"></span>
            ${cropCls === 'crop-sick' || cropCls === 'crop-wilting' ? '<span class="sick-bugs">🦠</span>' : ''}
          </div>`;
      }

      const cls = [
        'plot-cell',
        plot.needs_care ? 'needs-care' : '',
        cropCls,
        plotIsReady(plot) ? 'ready' : '',
        plot.state === 'dead' ? 'dead' : '',
      ]
        .filter(Boolean)
        .join(' ');

      return `<div class="${cls}" data-plot="${i}" role="gridcell">
        <div class="plot-stack">
          <img class="plot-img" src="${plotBaseAsset(plot, seed)}" alt="" decoding="async">
          ${cropHtml}
          ${badge ? `<span class="plot-badge care">${badge}</span>` : ''}
        </div>
      </div>`;
    })
    .join('');
}

async function handlePlotTap(index) {
  if (actionBusy) return;
  const plot = farm.plots[index];
  if (!plot) return;

  if (plot.state === 'empty') {
    openPlotSheet(index);
    return;
  }

  if (plot.ready || plot.state === 'ready') {
    await runPlotAction('harvest', index);
    return;
  }

  if (plot.state === 'dead') {
    openPlotSheet(index);
    return;
  }

  if (careIsActive(plot)) {
    const action = careActionForPlot(plot);
    if (action === 'water') {
      await runPlotAction('water', index);
      return;
    }
    if (action === 'fertilize') {
      await runPlotAction('fertilize', index);
      return;
    }
    if (action === 'heal') {
      await runPlotAction('heal', index);
      return;
    }
    openPlotSheet(index);
    return;
  }

  openPlotSheet(index);
}

async function openPlotSheet(index, show = true) {
  activePlot = index;
  const plot = farm.plots[index];
  if (!plot) return;

  if (plot.state === 'empty' || show) {
    await refreshWallet();
  }

  const seed = plot.seed_id ? seeds[plot.seed_id] : null;
  document.getElementById('plot-sheet-title').textContent = seed
    ? `${seed.name} — Plot ${index + 1}`
    : `Plot ${index + 1}`;

  const panel = document.querySelector('#sheet-plot .sheet-panel');
  const isSeed = plot.state === 'empty';
  panel.classList.toggle('sheet-seed-mode', isSeed);
  panel.classList.toggle('sheet-action-mode', !isSeed);

  const body = document.getElementById('plot-sheet-body');
  body.innerHTML = buildPlotSheetContent(plot, seed);

  body.querySelectorAll('[data-action]').forEach((btn) => {
    btn.addEventListener('click', () => {
      runPlotAction(btn.dataset.action, index, btn.dataset.seed);
    });
  });

  if (show) document.getElementById('sheet-plot').classList.remove('hidden');
}

function buildPlotSheetContent(plot, seed) {
  const steps = careRules.stepsToHarvest || 10;
  const step = plot.care_step || 0;

  if (plot.state === 'empty') {
    return `<p class="sheet-intro compact">Pick a seed — tap to plant instantly</p>
      <div class="seed-quick-grid">${[...seedList]
        .sort((a, b) => a.price - b.price)
        .map((s) => {
          const ok = walletBalance >= s.price;
          return `<button type="button" class="seed-quick-btn ${ok ? '' : 'disabled'}" data-action="plant" data-seed="${s.id}" ${ok ? '' : 'disabled'}>
            <img src="${assetSeed(s.assets.seed)}" alt="">
            <span class="seed-quick-name">${s.name}</span>
            <span class="seed-quick-price">🪙${fmtCoins(s.price)}</span>
            <span class="seed-quick-sell">→${fmtCoins(s.marketBase)}</span>
          </button>`;
        })
        .join('')}</div>`;
  }

  if (plot.state === 'dead') {
    const blight = plot.death_reason === 'blight';
    const costs = plotCareCosts(plot);
    return `<p class="sheet-intro warn">${blight ? '🌪️ Sudden blight — nothing you could do!' : 'Crop died from neglect.'} Heal to retry or clear.</p>
      <div class="action-row">
        <button type="button" class="action-btn heal" data-action="heal">💊 Revive 🪙${fmtCoins(costs.heal)}</button>
        <button type="button" class="action-btn clear" data-action="clear">🗑️ Clear plot</button>
      </div>`;
  }

  if (plot.ready || plot.state === 'ready') {
    return `<p class="sheet-intro success">Survived all ${steps} rounds!</p>
      <div class="action-row">
        <button type="button" class="action-btn harvest" data-action="harvest">🌾 Harvest</button>
      </div>`;
  }

  const nextName =
    plot.care_type === 'fertilize' ? 'fertilizer' : plot.care_type === 'sick' ? 'medicine' : 'water';

  if (!careIsActive(plot)) {
    return `<p class="sheet-intro">Round <strong>${step + 1}/${steps}</strong> — growing fine. Next: <strong>${nextName}</strong> soon.</p>
      <p class="care-tip">Wait for the badge to appear, then tap the plot.</p>`;
  }

  const careName =
    plot.care_type === 'fertilize' ? 'Fertilizer' : plot.care_type === 'sick' ? 'Medicine' : 'Water';
  const costs = plotCareCosts(plot);

  let html = `<p class="sheet-intro">Round <strong>${step + 1}/${steps}</strong> — needs <strong>${careName}</strong> now!</p>
    <div class="action-row">`;

  const action = careActionForPlot(plot);
  if (action === 'water') {
    html += `<button type="button" class="action-btn water pulse" data-action="water">💧 Water</button>`;
  } else if (action === 'fertilize') {
    html += `<button type="button" class="action-btn fert pulse" data-action="fertilize">🌿 Fertilize 🪙${fmtCoins(costs.fertilize)}</button>`;
  } else {
    html += `<button type="button" class="action-btn heal pulse" data-action="heal">💊 Heal 🪙${fmtCoins(costs.heal)}</button>`;
  }

  html += `</div><p class="care-tip">Take your time — about ${careRules.careWindowSec}s per care step.</p>`;
  return html;
}

async function runPlotAction(action, index, seedId) {
  if (actionBusy) return;
  actionBusy = true;
  skipPlotRender = true;

  try {
    if (action === 'plant') {
      if (!seedId) return;
      await Arcade.post('/api/fast-farm/buy-seed', { seed_id: seedId, plot_index: index });
      Arcade.toast('🌱 Planted!', 'win');
      closeSheet('sheet-plot');
      return;
    }

    const routes = {
      water: '/api/fast-farm/water',
      fertilize: '/api/fast-farm/fertilize',
      heal: '/api/fast-farm/heal',
      clear: '/api/fast-farm/clear',
      harvest: '/api/fast-farm/harvest',
    };

    const r = await Arcade.post(routes[action], { plot_index: index });
    if (r.unfair_loss) {
      Arcade.toast('🌪️ Sudden blight — crop died!', 'lose');
    } else if (action === 'water') Arcade.toast('💧 Watered!', 'win');
    else if (action === 'fertilize') Arcade.toast('🌿 Fed!', 'win');
    else if (action === 'heal') Arcade.toast('💊 Healed!', 'win');
    if (action === 'clear') {
      Arcade.toast('Cleared', 'win');
      closeSheet('sheet-plot');
    }
    if (action === 'harvest') {
      const seed = seeds[farm.plots[index]?.seed_id];
      const amt = r.harvested?.amount || 1;
      const tier = r.harvested?.tier;
      const hype =
        tier === 'jackpot' ? '🎉 JACKPOT harvest!' :
        tier === 'great' ? '✨ Great haul!' :
        tier === 'good' ? '🌾 Nice crop!' :
        tier === 'poor' ? '🌾 Small harvest' : '🌾 Harvested!';
      Arcade.toast(`${hype} +${amt} ${seed?.name || ''}`, tier === 'poor' ? '' : 'win');
      closeSheet('sheet-plot');
    }
  } catch (e) {
    Arcade.toast(e.message || 'Action failed', 'lose');
  } finally {
    skipPlotRender = false;
    actionBusy = false;
    await refreshWallet();
    await refreshFarm();
  }
}

async function openBackpack() {
  renderBackpack();
  document.getElementById('sheet-backpack').classList.remove('hidden');
}

function renderBackpack() {
  const inv = farm.inventory || {};
  const invEl = document.getElementById('tab-inventory');
  const entries = Object.entries(inv).filter(([, qty]) => qty > 0);

  if (!entries.length) {
    invEl.innerHTML = `<div class="empty-backpack">
      <div class="emoji">🌱</div>
      <h3>Bag empty</h3>
      <p>Grow crops, harvest, sell at Black Market — some days pay big!</p>
    </div>`;
    return;
  }

  invEl.innerHTML = `<div class="inv-grid">${entries
    .map(([itemId, qty]) => {
      const seedId = MARKET_TO_SEED[itemId];
      const seed = seeds[seedId];
      if (!seed) return '';
      return `<div class="inv-card">
        <span class="inv-qty">x${qty}</span>
        <img src="${assetIcon(seed.assets.icon)}" alt="">
        <span>${seed.name}</span>
      </div>`;
    })
    .join('')}</div>`;
}

function closeSheet(id) {
  document.getElementById(id)?.classList.add('hidden');
  if (id === 'sheet-plot') activePlot = null;
}

function renderDailyMood() {
  const el = document.getElementById('farm-daily-mood');
  if (!el || !dailyMood?.headline) return;
  el.textContent = dailyMood.headline;
  el.classList.toggle('farm-mood-hot', dailyMood.kind === 'bounty');
  el.classList.toggle('farm-mood-storm', dailyMood.kind === 'stormy');
}

