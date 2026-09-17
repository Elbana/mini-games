/** Fast Farm v5 — 10 care rounds per crop. No timer. Crops look sick when neglected. */

let seeds = {};
let seedList = [];
let farm = null;
let walletBalance = 0;
let careCosts = { fertilize: 4, heal: 6 };
let careRules = { stepsToHarvest: 10, careWindowSec: 6.5 };
let activePlot = null;
let tickTimer = null;
let plotLayout = { left: '6%', bottom: '10%', width: '74%' };

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
  if (cfg.plotLayout) plotLayout = cfg.plotLayout;
  if (cfg.careCosts) careCosts = cfg.careCosts;
  if (cfg.careRules) careRules = cfg.careRules;
  applyPlotLayout();

  bindUi();
  await refreshFarm();
  tickTimer = setInterval(refreshFarm, 800);
}

function applyPlotLayout() {
  const scene = document.getElementById('farm-scene');
  if (!scene) return;
  scene.style.left = plotLayout.left;
  scene.style.bottom = plotLayout.bottom;
  scene.style.width = plotLayout.width;
}

function bindUi() {
  document.getElementById('btn-harvest').addEventListener('click', openBackpack);
  document.querySelectorAll('[data-close]').forEach((el) => {
    el.addEventListener('click', () => closeSheet(el.dataset.close));
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

async function refreshFarm() {
  const st = await Arcade.get('/api/fast-farm/state');
  farm = {
    plots: st.plots?.length ? st.plots : defaultPlots(),
    inventory: st.inventory || {},
  };
  if (st.careCosts) careCosts = st.careCosts;
  if (st.careRules) careRules = st.careRules;
  await refreshWallet();
  renderHud();
  renderPlots();
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

function plotBaseAsset(plot) {
  if (plot.state === 'empty') return '/assets/farm/plot-tile.webp';
  if (plot.state === 'dead') return '/assets/farm/plot-tile.webp';
  return '/assets/farm/plot-seeded.webp';
}

function cropVisualClass(plot) {
  if (plot.ready || plot.state === 'ready') return 'crop-ready';
  if (plot.state === 'dead') return 'crop-dead';
  if (plot.state === 'wilting') return 'crop-wilting';
  if (plot.care_type === 'sick' && plot.needs_care) return 'crop-sick';
  if (plot.needs_fertilize || plot.care_type === 'fertilize') return 'crop-hungry';
  if (plot.needs_water || plot.care_type === 'water') return plot.needs_care ? 'crop-thirsty' : 'crop-ok';
  return 'crop-ok';
}

function careLabel(plot) {
  if (plot.ready || plot.state === 'ready') return '⭐';
  if (plot.state === 'dead') return '💀';
  if (plot.state === 'wilting') return '⚠️';
  if (plot.needs_heal || plot.care_type === 'sick') return '🤒';
  if (plot.needs_fertilize || plot.care_type === 'fertilize') return '🌿';
  if (plot.needs_water && plot.needs_care) return '💧';
  return '';
}

function renderPlots() {
  const grid = document.getElementById('farm-grid');
  grid.innerHTML = (farm.plots || [])
    .map((plot, i) => {
      const growing = plot.seed_id && plot.state !== 'empty' && plot.state !== 'dead';
      const seed = plot.seed_id ? seeds[plot.seed_id] : null;
      const cropCls = cropVisualClass(plot);
      const badge = careLabel(plot);
      const step = plot.care_step || 0;
      const steps = careRules.stepsToHarvest || 10;

      let cropHtml = '';
      if (growing || plot.ready || plot.state === 'ready') {
        const src = plot.ready || plot.state === 'ready'
          ? assetPlanted(seed.assets.planted)
          : assetIcon(seed.assets.icon);
        cropHtml = `
          <div class="plot-crop ${cropCls}">
            <img class="crop-sprite" src="${src}" alt="">
            ${plot.state !== 'ready' && !plot.ready ? '<span class="sick-veil"></span>' : ''}
            ${cropCls === 'crop-sick' || cropCls === 'crop-wilting' ? '<span class="sick-bugs">🦠</span>' : ''}
          </div>`;
      }

      const cls = [
        'plot-cell',
        plot.needs_care ? 'needs-care' : '',
        cropCls,
        plot.ready ? 'ready' : '',
        plot.state === 'dead' ? 'dead' : '',
      ]
        .filter(Boolean)
        .join(' ');

      const progressHtml =
        growing && !plot.ready
          ? `<div class="care-pips">${Array.from({ length: steps }, (_, j) =>
              `<span class="care-pip ${j < step ? 'done' : j === step && plot.needs_care ? 'now' : ''}"></span>`,
            ).join('')}</div>`
          : '';

      return `<div class="${cls}" data-plot="${i}" role="gridcell">
        <img class="plot-img" src="${plotBaseAsset(plot)}" alt="">
        ${cropHtml}
        ${badge ? `<span class="plot-badge care">${badge}</span>` : ''}
        ${progressHtml}
      </div>`;
    })
    .join('');

  grid.querySelectorAll('.plot-cell').forEach((el) => {
    el.addEventListener('click', () => handlePlotTap(Number(el.dataset.plot)));
  });
}

async function handlePlotTap(index) {
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

  if (plot.needs_water && plot.needs_care) {
    await runPlotAction('water', index);
    return;
  }

  if (plot.needs_fertilize && plot.needs_care) {
    await runPlotAction('fertilize', index);
    return;
  }

  if (plot.state === 'wilting' && plot.care_type === 'water') {
    await runPlotAction('water', index);
    return;
  }

  if ((plot.care_type === 'sick' && plot.needs_care) || plot.state === 'wilting') {
    openPlotSheet(index);
    return;
  }

  openPlotSheet(index);
}

function openPlotSheet(index, show = true) {
  activePlot = index;
  const plot = farm.plots[index];
  if (!plot) return;

  const seed = plot.seed_id ? seeds[plot.seed_id] : null;
  document.getElementById('plot-sheet-title').textContent = seed
    ? `${seed.name} — Plot ${index + 1}`
    : `Plot ${index + 1}`;

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
    return `<p class="sheet-intro">10 care rounds per crop. Miss one → wilt → dead.</p>
      <div class="seed-pick-list">${seedList
        .map((s) => {
          const ok = walletBalance >= s.price;
          return `<button type="button" class="seed-pick-row ${ok ? '' : 'disabled'}" data-action="plant" data-seed="${s.id}" ${ok ? '' : 'disabled'}>
            <img src="${assetSeed(s.assets.seed)}" alt="">
            <span class="seed-pick-info">
              <strong>${s.name}</strong>
              <small>${steps} care rounds · x${s.harvestAmount} harvest</small>
            </span>
            <span class="seed-pick-price">🪙 ${s.price}</span>
          </button>`;
        })
        .join('')}</div>`;
  }

  if (plot.state === 'dead') {
    return `<p class="sheet-intro warn">Crop died. Heal to retry (same progress) or clear.</p>
      <div class="action-row">
        <button type="button" class="action-btn heal" data-action="heal">💊 Revive 🪙${careCosts.heal}</button>
        <button type="button" class="action-btn clear" data-action="clear">🗑️ Clear plot</button>
      </div>`;
  }

  if (plot.ready || plot.state === 'ready') {
    return `<p class="sheet-intro success">Survived all ${steps} rounds!</p>
      <div class="action-row">
        <button type="button" class="action-btn harvest" data-action="harvest">🌾 Harvest</button>
      </div>`;
  }

  const careName =
    plot.care_type === 'fertilize' ? 'Fertilizer' : plot.care_type === 'sick' ? 'Medicine' : 'Water';

  let html = `<p class="sheet-intro">Round <strong>${step + 1}/${steps}</strong> — needs <strong>${careName}</strong></p>
    <div class="action-row">`;

  if (plot.care_type === 'water' || plot.state === 'wilting') {
    html += `<button type="button" class="action-btn water ${plot.needs_care ? 'pulse' : ''}" data-action="water">💧 Water</button>`;
  }
  if (plot.care_type === 'fertilize') {
    html += `<button type="button" class="action-btn fert ${plot.needs_care ? 'pulse' : ''}" data-action="fertilize">🌿 Fertilize 🪙${careCosts.fertilize}</button>`;
  }
  if (plot.care_type === 'sick' || plot.state === 'wilting') {
    html += `<button type="button" class="action-btn heal ${plot.needs_care ? 'pulse' : ''}" data-action="heal">💊 Heal 🪙${careCosts.heal}</button>`;
  }

  html += `</div><p class="care-tip">~${careRules.careWindowSec}s per round. Stagger planting so plots don't all scream at once.</p>`;
  return html;
}

async function runPlotAction(action, index, seedId) {
  if (action === 'plant') {
    if (!seedId) return;
    try {
      await Arcade.post('/api/fast-farm/buy-seed', { seed_id: seedId, plot_index: index });
      Arcade.toast('🌱 Planted — stay alert!', 'win');
      closeSheet('sheet-plot');
      await refreshFarm();
    } catch (e) {
      Arcade.toast(e.message || 'Failed to plant', 'lose');
    }
    return;
  }

  const routes = {
    water: '/api/fast-farm/water',
    fertilize: '/api/fast-farm/fertilize',
    heal: '/api/fast-farm/heal',
    clear: '/api/fast-farm/clear',
    harvest: '/api/fast-farm/harvest',
  };

  try {
    const r = await Arcade.post(routes[action], { plot_index: index });
    if (action === 'water') {
      addFloatEffect('💧', 'blue');
      Arcade.toast('💧 Watered!', 'win');
    }
    if (action === 'fertilize') Arcade.toast('🌿 Fed!', 'win');
    if (action === 'heal') Arcade.toast('💊 Healed!', 'win');
    if (action === 'clear') {
      Arcade.toast('Plot cleared', 'win');
      closeSheet('sheet-plot');
    }
    if (action === 'harvest') {
      const seed = seeds[farm.plots[index]?.seed_id];
      addFloatEffect(`+${r.harvested?.amount || '?'} ${seed?.name || ''}`, 'green');
      Arcade.toast('🌾 Harvested!', 'win');
      closeSheet('sheet-plot');
    }
    await refreshFarm();
  } catch (e) {
    Arcade.toast(e.message || 'Action failed', 'lose');
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
      <p>Survive 10 care rounds, harvest, sell at Black Market.</p>
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

function addFloatEffect(text, colorClass) {
  const el = document.createElement('div');
  el.className = `float-effect ${colorClass}`;
  el.textContent = text;
  el.style.top = '45%';
  document.getElementById('fx-layer').appendChild(el);
  setTimeout(() => el.remove(), 2000);
}
