/** Fast Farm v7 — chill care, daily harvest swings, sell at Black Market. */

let seeds = {};
let seedList = [];
let farm = null;
let walletBalance = 0;
let careRules = { stepsToHarvest: 6, careWindowSec: 18 };
let dailyMood = null;
let activePlot = null;
let activeTool = null;
let tickTimer = null;
let actionBusy = false;
let skipPlotRender = false;
let lastPlotsJson = '';
let farmSounds = null;
const FARM_TICK_MS = 1500;

function sfx(name, opts) {
  farmSounds?.play(name, opts);
}

const TOOL_FX = {
  water: { emoji: '🪣', class: 'fx-water', particles: 'water' },
  fertilize: { emoji: '🧴', class: 'fx-fertilize', particles: 'fert' },
  heal: { class: 'fx-spray', particles: 'spray', icon: 'spray' },
  harvest: { emoji: '🧺', class: 'fx-harvest' },
  plant: { emoji: '🌱', class: 'fx-plant' },
  clear: { emoji: '🧹', class: 'fx-clear' },
};

document.addEventListener('DOMContentLoaded', init);

async function init() {
  document.getElementById('btn-hub').href = `/?token=${Arcade.token}&player=${Arcade.player}`;

  const cfg = await Arcade.get('/api/fast-farm/config');
  seedList = cfg.seeds || [];
  seeds = Object.fromEntries(seedList.map((s) => [s.id, s]));
  if (cfg.careRules) careRules = cfg.careRules;

  setupFarmToast();
  farmSounds = new FarmSounds();
  document.body.addEventListener('pointerdown', () => farmSounds?.unlock(), { once: true });
  buildCropStack();
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
  registerArcadeGameShutdown(() => {
    stopFarmTick();
    farmSounds?.destroy();
    farmSounds = null;
  });
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
  document.querySelectorAll('[data-close]').forEach((el) => {
    el.addEventListener('click', () => closeSheet(el.dataset.close));
  });

  bindToolbar();
  bindHelpAndSound();

  const scene = document.getElementById('farm-scene');
  let lastPlotTapAt = 0;

  function tapPlotFromEvent(e, clientX, clientY) {
    if (actionBusy) return;
    if (e.target?.closest?.('.farm-top-bar, .farm-toolbar, .farm-sheet:not(.hidden), .farm-crop-stack')) return;

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

function bindToolbar() {
  document.querySelectorAll('.farm-tool[data-tool]').forEach((btn) => {
    btn.addEventListener('click', () => {
      selectTool(btn.dataset.tool);
    });
  });
}

function bindHelpAndSound() {
  const helpBtn = document.getElementById('btn-help');
  const helpClose = document.getElementById('help-close');
  const soundBtn = document.getElementById('btn-sound');

  helpBtn?.addEventListener('click', () => {
    sfx('click', { volume: 0.18 });
    document.getElementById('sheet-help')?.classList.remove('hidden');
  });

  helpClose?.addEventListener('click', () => {
    sfx('click', { volume: 0.15 });
    closeSheet('sheet-help');
  });

  function syncSoundBtn() {
    if (!soundBtn || !farmSounds) return;
    const muted = farmSounds.isMuted();
    soundBtn.textContent = muted ? '🔇' : '🔊';
    soundBtn.setAttribute('aria-pressed', muted ? 'true' : 'false');
    soundBtn.setAttribute('aria-label', muted ? 'Sound off' : 'Sound on');
  }

  soundBtn?.addEventListener('click', () => {
    farmSounds?.toggleMuted();
    syncSoundBtn();
    if (!farmSounds?.isMuted()) {
      farmSounds?.unlock();
      sfx('click', { volume: 0.18 });
    }
  });

  syncSoundBtn();
}

function selectTool(tool) {
  const changed = activeTool !== tool;
  activeTool = tool;
  document.querySelectorAll('.farm-tool[data-tool]').forEach((btn) => {
    const on = btn.dataset.tool === tool;
    btn.classList.toggle('selected', on);
    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
  });
  if (!tool) return;

  if (changed) sfx('toolSelect', { volume: 0.24 });

  if (!changed) return;

  const labels = {
    water: 'Tap a thirsty plot to water',
    fertilize: 'Tap a plot that needs fertilizer',
    heal: 'Tap a plot with pests to spray insecticide',
    clear: 'Tap a dead plot to clear',
  };
  Arcade.toast(labels[tool] || 'Tap a plot');
}

function countPlotsNeedingTool(tool) {
  return (farm.plots || []).filter((p) => canUseToolOnPlot(tool, p).ok).length;
}

function updateToolbarBadges() {
  const counts = {
    water: 0,
    fertilize: 0,
    heal: 0,
    clear: 0,
  };
  for (const plot of farm.plots || []) {
    if (plot.state === 'dead') counts.clear += 1;
    else if (careIsActive(plot)) {
      const action = careActionForPlot(plot);
      if (action === 'water') counts.water += 1;
      else if (action === 'fertilize') counts.fertilize += 1;
      else if (action === 'heal') counts.heal += 1;
    }
  }

  document.querySelectorAll('.farm-tool[data-tool]').forEach((btn) => {
    const tool = btn.dataset.tool;
    const badge = btn.querySelector('.farm-tool-badge');
    const n = counts[tool] || 0;
    if (badge) {
      badge.textContent = String(n);
      badge.classList.toggle('hidden', n <= 0);
    }
  });

}

function canUseToolOnPlot(tool, plot) {
  if (!plot) return { ok: false, msg: 'No plot' };

  if (tool === 'plant') {
    return plot.state === 'empty'
      ? { ok: true }
      : { ok: false, msg: 'That plot already has a crop — pick Plant only on empty soil' };
  }

  if (tool === 'clear') {
    return plot.state === 'dead'
      ? { ok: true }
      : { ok: false, msg: 'Clear is only for dead plots' };
  }

  if (tool === 'harvest') {
    return plot.ready || plot.state === 'ready'
      ? { ok: true }
      : { ok: false, msg: 'Nothing ready to pick here yet' };
  }

  if (tool === 'heal') {
    if (plot.state === 'dead') return { ok: false, msg: 'Crop is dead — clear the plot first' };
    if (careIsActive(plot) && careActionForPlot(plot) === 'heal') return { ok: true };
    return { ok: false, msg: 'This crop does not need insecticide' };
  }

  if (tool === 'water') {
    if (plot.state === 'empty') return { ok: false, msg: 'Plant something first' };
    if (plot.state === 'dead') return { ok: false, msg: 'Clear the dead plot first' };
    if (plot.ready || plot.state === 'ready') return { ok: false, msg: 'Ready to pick — use the basket' };
    if (careIsActive(plot) && careActionForPlot(plot) === 'water') return { ok: true };
    return { ok: false, msg: 'This plot does not need water right now' };
  }

  if (tool === 'fertilize') {
    if (plot.state === 'empty') return { ok: false, msg: 'Plant something first' };
    if (plot.state === 'dead') return { ok: false, msg: 'Clear the dead plot first' };
    if (plot.ready || plot.state === 'ready') return { ok: false, msg: 'Ready to pick — use the basket' };
    if (careIsActive(plot) && careActionForPlot(plot) === 'fertilize') return { ok: true };
    return { ok: false, msg: 'This plot does not need fertilizer right now' };
  }

  return { ok: false, msg: 'Unknown tool' };
}

function getPlotVisualAnchor(plotIndex, mode = 'center') {
  const plotCell = document.querySelector(`.plot-cell[data-plot="${plotIndex}"]`);
  if (!plotCell) return null;

  const mound = plotCell.querySelector('.plot-mound');
  const sprite = plotCell.querySelector('.crop-sprite');
  const anchorEl = mound || sprite || plotCell.querySelector('.plot-crop') || plotCell.querySelector('.plot-stack');
  if (!anchorEl) return null;

  const rect = anchorEl.getBoundingClientRect();
  if (rect.width <= 0 && rect.height <= 0) return null;

  const yRatio = mode === 'tool' ? 0.32 : mode === 'harvest' ? 0.38 : 0.5;

  return {
    cx: rect.left + rect.width * 0.5,
    cy: rect.top + rect.height * yRatio,
    width: rect.width,
    height: rect.height,
  };
}

function playToolUseAnimation(plotIndex, tool) {
  const plotCell = document.querySelector(`.plot-cell[data-plot="${plotIndex}"]`);
  const layer = document.getElementById('fx-layer');
  const cfg = TOOL_FX[tool];
  const anchor = getPlotVisualAnchor(plotIndex, 'tool');
  if (!plotCell || !layer || !cfg || !anchor) return Promise.resolve();

  const cx = anchor.cx;
  const cy = anchor.cy - anchor.height * 0.06;

  sfx(tool, { volume: tool === 'heal' ? 0.1 : 0.28 });

  const el = document.createElement('div');
  el.className = `farm-tool-fx ${cfg.class}`;
  if (cfg.icon === 'spray') {
    el.innerHTML = '<span class="fx-spray-can" aria-hidden="true"></span>';
  } else {
    el.textContent = cfg.emoji;
  }
  el.style.left = `${cx}px`;
  el.style.top = `${cy}px`;
  layer.appendChild(el);

  const particles = [];
  if (cfg.particles === 'water') {
    for (let i = 0; i < 7; i++) {
      const drop = document.createElement('span');
      drop.className = 'farm-tool-particle water-drop';
      drop.textContent = '💧';
      drop.style.left = `${cx + (Math.random() - 0.5) * 36}px`;
      drop.style.top = `${cy + 8}px`;
      drop.style.setProperty('--dx', `${(Math.random() - 0.5) * 18}px`);
      drop.style.animationDelay = `${80 + i * 45}ms`;
      layer.appendChild(drop);
      particles.push(drop);
    }
  } else if (cfg.particles === 'fert') {
    for (let i = 0; i < 6; i++) {
      const spark = document.createElement('span');
      spark.className = 'farm-tool-particle fert-spark';
      spark.textContent = '✨';
      spark.style.left = `${cx + (Math.random() - 0.5) * 40}px`;
      spark.style.top = `${cy}px`;
      spark.style.setProperty('--dx', `${(Math.random() - 0.5) * 24}px`);
      spark.style.setProperty('--dy', `${12 + Math.random() * 22}px`);
      spark.style.animationDelay = `${60 + i * 40}ms`;
      layer.appendChild(spark);
      particles.push(spark);
    }
  } else if (cfg.particles === 'spray') {
    for (let i = 0; i < 9; i++) {
      const mist = document.createElement('span');
      mist.className = 'farm-tool-particle spray-mist';
      mist.style.left = `${cx + (Math.random() - 0.5) * 48}px`;
      mist.style.top = `${cy - 4 + Math.random() * 8}px`;
      mist.style.setProperty('--dx', `${(Math.random() - 0.5) * 32}px`);
      mist.style.setProperty('--dy', `${-8 - Math.random() * 28}px`);
      mist.style.animationDelay = `${40 + i * 35}ms`;
      layer.appendChild(mist);
      particles.push(mist);
    }
  }

  return new Promise((resolve) => {
    setTimeout(() => {
      el.remove();
      particles.forEach((p) => p.remove());
      resolve();
    }, tool === 'water' || tool === 'harvest' ? 900 : 820);
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
  updateToolbarBadges();
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

function orderedSeeds() {
  return [...seedList].sort((a, b) => a.price - b.price);
}

function formatCropCount(n) {
  const num = Math.max(0, Math.floor(Number(n) || 0));
  if (num < 1000) return String(num);
  const tiers = [
    { div: 1e9, suffix: 'b' },
    { div: 1e6, suffix: 'm' },
    { div: 1e3, suffix: 'k' },
  ];
  for (const { div, suffix } of tiers) {
    if (num >= div) {
      const v = num / div;
      if (v >= 100) return `${Math.floor(v)}${suffix}`;
      const text = v >= 10 ? v.toFixed(0) : v.toFixed(1);
      return `${text.replace(/\.0$/, '')}${suffix}`;
    }
  }
  return String(num);
}

function buildCropStack() {
  const stack = document.getElementById('farm-crop-stack');
  if (!stack) return;
  stack.innerHTML = orderedSeeds()
    .map((seed) => {
      const itemId = seed.marketItem;
      return `<div class="crop-stack-row" data-item="${itemId}" id="crop-row-${itemId}">
        <span class="crop-stack-count" id="count-${itemId}" data-value="0">0</span>
        <img class="crop-stack-icon" src="${assetIcon(seed.assets.icon)}" alt="${seed.name}">
      </div>`;
    })
    .join('');
}

function setCropCount(itemId, count, animate = false) {
  const el = document.getElementById(`count-${itemId}`);
  const row = document.getElementById(`crop-row-${itemId}`);
  if (!el) return;

  const next = Math.max(0, Number(count) || 0);
  const prev = Number(el.dataset.value || 0);
  row?.classList.toggle('has-stock', next > 0);

  if (animate && next > prev) {
    el.classList.remove('count-bump');
    void el.offsetWidth;
    el.classList.add('count-bump');
    animateCountRoll(el, prev, next);
    row?.classList.remove('crop-stack-pop');
    void row?.offsetWidth;
    row?.classList.add('crop-stack-pop');
  } else {
    el.textContent = formatCropCount(next);
  }
  el.dataset.value = String(next);
}

function animateCountRoll(el, from, to, duration = 280) {
  const start = performance.now();
  function tick(now) {
    const t = Math.min(1, (now - start) / duration);
    const eased = 1 - (1 - t) ** 3;
    el.textContent = formatCropCount(Math.round(from + (to - from) * eased));
    if (t < 1) requestAnimationFrame(tick);
    else el.textContent = formatCropCount(to);
  }
  requestAnimationFrame(tick);
}

function bumpCountQuick(countEl, value, row) {
  if (!countEl) return;
  countEl.textContent = formatCropCount(value);
  countEl.dataset.value = String(value);
  countEl.classList.remove('count-bump', 'count-tick');
  void countEl.offsetWidth;
  countEl.classList.add('count-tick');
  sfx('harvestTick', { volume: 0.07 });
  row?.classList.add('crop-stack-pop');
  setTimeout(() => row?.classList.remove('crop-stack-pop'), 320);
}

function easeOutBack(t) {
  const c1 = 1.525;
  const c3 = c1 + 1;
  return 1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2;
}

function easeInQuad(t) {
  return t * t;
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function renderHud() {
  const inv = farm.inventory || {};
  for (const seed of orderedSeeds()) {
    setCropCount(seed.marketItem, inv[seed.marketItem] || 0, false);
  }
}

function playHarvestCollectAnimation(plotIndex, itemId, amount, tier = 'normal', prevTotal = 0, newTotal = 0) {
  const plotCell = document.querySelector(`.plot-cell[data-plot="${plotIndex}"]`);
  const targetRow = document.getElementById(`crop-row-${itemId}`);
  const countEl = document.getElementById(`count-${itemId}`);
  const iconEl = targetRow?.querySelector('.crop-stack-icon');
  const layer = document.getElementById('fx-layer');
  if (!plotCell || !targetRow || !iconEl || !layer || !countEl) return Promise.resolve();

  const anchor = getPlotVisualAnchor(plotIndex, 'harvest');
  const countBox = countEl.getBoundingClientRect();
  const iconSrc = iconEl.src;
  const harvestAmt = Math.max(1, Math.round(amount));
  const visualCount = Math.min(harvestAmt, tier === 'mega' ? 14 : tier === 'great' ? 12 : 10);
  const isBigHaul = tier === 'mega' || tier === 'great';
  if (!anchor) return Promise.resolve();

  const { cx, cy } = anchor;
  const tx = countBox.left + countBox.width * 0.5;
  const ty = countBox.top + countBox.height * 0.5;
  const size = isBigHaul ? 38 : 34;

  const addPerLand = [];
  let remaining = harvestAmt;
  for (let i = 0; i < visualCount; i++) {
    const slice = Math.ceil(remaining / (visualCount - i));
    addPerLand.push(slice);
    remaining -= slice;
  }

  let runningCount = prevTotal;
  setCropCount(itemId, prevTotal, false);

  const plusFloat = document.createElement('div');
  plusFloat.className = `harvest-float-plus${isBigHaul ? ' mega-haul' : ''}`;
  plusFloat.textContent = `+${harvestAmt}`;
  plusFloat.style.left = `${cx}px`;
  plusFloat.style.top = `${cy - 28}px`;
  layer.appendChild(plusFloat);

  const burst = document.createElement('div');
  burst.className = 'harvest-burst-ring';
  burst.style.left = `${cx}px`;
  burst.style.top = `${cy}px`;
  layer.appendChild(burst);

  const particles = [];
  for (let i = 0; i < visualCount; i++) {
    const angle = (Math.PI * 2 * i) / visualCount - Math.PI / 2 + (Math.random() - 0.5) * 0.25;
    const spreadR = 38 + (i % 3) * 10;
    const clusterX = cx + Math.cos(angle) * spreadR;
    const clusterY = cy + Math.sin(angle) * spreadR * 0.72;
    const el = document.createElement('img');
    el.className = `harvest-fly${isBigHaul ? ' mega-haul' : ''}`;
    el.src = iconSrc;
    el.alt = '';
    el.style.width = `${size}px`;
    el.style.height = `${size}px`;
    layer.appendChild(el);
    particles.push({
      el,
      cx,
      cy,
      clusterX,
      clusterY,
      x: cx,
      y: cy,
      scale: 0,
      opacity: 0,
      landed: false,
      landIndex: i,
      rushOffset: i * 28,
    });
  }

  const SPAWN_MS = 340;
  const CLUSTER_MS = 220;
  const RUSH_MS = 340;
  const start = performance.now();

  return new Promise((resolve) => {
    function frame(now) {
      const elapsed = now - start;

      if (elapsed < SPAWN_MS) {
        const t = elapsed / SPAWN_MS;
        const e = easeOutBack(t);
        for (const p of particles) {
          p.x = lerp(p.cx, p.clusterX, e);
          p.y = lerp(p.cy, p.clusterY, e);
          p.scale = e * (isBigHaul ? 1.15 : 1.05);
          p.opacity = Math.min(1, t * 1.8);
        }
      } else if (elapsed < SPAWN_MS + CLUSTER_MS) {
        const t = (elapsed - SPAWN_MS) / CLUSTER_MS;
        const pulse = 1 + Math.sin(t * Math.PI * 2) * 0.06;
        const pull = 0.55 + t * 0.35;
        for (const p of particles) {
          p.x = lerp(p.cx, p.clusterX, pull);
          p.y = lerp(p.cy, p.clusterY, pull) - Math.sin(t * Math.PI) * 6;
          p.scale = (isBigHaul ? 1.12 : 1.02) * pulse;
          p.opacity = 1;
        }
      } else {
        const rushElapsed = elapsed - SPAWN_MS - CLUSTER_MS;
        for (const p of particles) {
          const localMs = Math.max(0, rushElapsed - p.rushOffset);
          const lt = Math.min(1, localMs / RUSH_MS);
          const e = easeInQuad(lt);
          if (lt < 1) {
            const arc = Math.sin(lt * Math.PI) * -18;
            p.x = lerp(p.clusterX, tx, e);
            p.y = lerp(p.clusterY, ty, e) + arc;
            p.scale = lerp(isBigHaul ? 1.1 : 1, 0.45, e);
            p.opacity = lt > 0.88 ? 1 - (lt - 0.88) / 0.12 : 1;
          } else if (!p.landed) {
            p.landed = true;
            p.opacity = 0;
            runningCount += addPerLand[p.landIndex];
            bumpCountQuick(countEl, runningCount, targetRow);
            targetRow.classList.toggle('has-stock', runningCount > 0);
          }
        }
      }

      for (const p of particles) {
        p.el.style.transform = `translate(${p.x - size / 2}px, ${p.y - size / 2}px) scale(${p.scale})`;
        p.el.style.opacity = String(p.opacity);
      }

      if (elapsed < SPAWN_MS + CLUSTER_MS + RUSH_MS + visualCount * 28 + 180) {
        requestAnimationFrame(frame);
      } else {
        particles.forEach((p) => p.el.remove());
        plusFloat.remove();
        burst.remove();
        setCropCount(itemId, newTotal, false);
        countEl.classList.add('count-bump');
        targetRow.classList.add('crop-stack-pop');
        resolve();
      }
    }
    requestAnimationFrame(frame);
  });
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
  return plot.needs_care;
}

function cropVisualClass(plot) {
  if (plot.ready || plot.state === 'ready') return 'crop-ready';
  if (plot.state === 'dead') return 'crop-dead';
  if (!plot.needs_care) return 'crop-ok';
  if (plot.care_type === 'sick') return 'crop-pests';
  if (plot.care_type === 'fertilize') return 'crop-hungry';
  if (plot.care_type === 'water') return 'crop-thirsty';
  return 'crop-ok';
}

function careLabel(plot) {
  if (plot.ready || plot.state === 'ready') return '⭐';
  if (plot.state === 'dead') return '💀';
  if (!plot.needs_care) return '';
  if (plot.care_type === 'sick') return '🐛';
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
            <span class="crop-veil"></span>
            ${cropCls === 'crop-pests' ? '<span class="pest-dots" aria-hidden="true"><i></i><i></i><i></i></span>' : ''}
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
          <div class="plot-mound" aria-hidden="true"></div>
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
    sfx('click', { volume: 0.2 });
    openPlotSheet(index);
    return;
  }

  if (plot.ready || plot.state === 'ready') {
    await runPlotAction('harvest', index);
    return;
  }

  if (plot.state === 'dead') {
    if (activeTool && activeTool !== 'clear') {
      sfx('error', { volume: 0.2 });
      Arcade.toast('Clear the dead plot first', 'lose');
      return;
    }
    await applyToolToPlot('clear', index);
    return;
  }

  if (!activeTool) {
    if (careIsActive(plot)) {
      sfx('click', { volume: 0.2 });
      openPlotSheet(index);
      return;
    }
    return;
  }

  const check = canUseToolOnPlot(activeTool, plot);
  if (!check.ok) {
    sfx('error', { volume: 0.2 });
    Arcade.toast(check.msg, 'lose');
    return;
  }

  await applyToolToPlot(activeTool, index);
}

async function applyToolToPlot(tool, index, seedId) {
  if (actionBusy) return;
  actionBusy = true;
  await playToolUseAnimation(index, tool);
  await runPlotAction(tool, index, seedId, true, true);
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
      const action = btn.dataset.action;
      if (action === 'plant') {
        runPlotAction('plant', index, btn.dataset.seed);
        return;
      }
      selectTool(action);
      applyToolToPlot(action, index);
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
    return `<p class="sheet-intro warn">${blight ? '🌪️ Sudden blight — crop is gone.' : 'Crop died from neglect.'} Clear the plot and plant again.</p>
      <div class="action-row">
        <button type="button" class="action-btn clear pulse" data-action="clear">🧹 Clear plot</button>
      </div>`;
  }

  if (plot.ready || plot.state === 'ready') {
    return `<p class="sheet-intro success">Survived all ${steps} rounds!</p>
      <div class="action-row">
        <button type="button" class="action-btn harvest" data-action="harvest">🌾 Harvest</button>
      </div>`;
  }

  const nextName =
    plot.care_type === 'fertilize' ? 'fertilizer' : plot.care_type === 'sick' ? 'insecticide' : 'water';

  if (!careIsActive(plot)) {
    return `<p class="sheet-intro">Round <strong>${step + 1}/${steps}</strong> — growing fine. Next: <strong>${nextName}</strong> soon.</p>
      <p class="care-tip">Wait for the badge to appear, then tap the plot.</p>`;
  }

  const careName =
    plot.care_type === 'fertilize' ? 'Fertilizer' : plot.care_type === 'sick' ? 'Insecticide' : 'Water';
  const costs = plotCareCosts(plot);

  let html = `<p class="sheet-intro">Round <strong>${step + 1}/${steps}</strong> — needs <strong>${careName}</strong> now!</p>
    <div class="action-row">`;

  const action = careActionForPlot(plot);
  if (action === 'water') {
    html += `<button type="button" class="action-btn water pulse" data-action="water">💧 Water</button>`;
  } else if (action === 'fertilize') {
    html += `<button type="button" class="action-btn fert pulse" data-action="fertilize">🧴 Fertilizer 🪙${fmtCoins(costs.fertilize)}</button>`;
  } else {
    html += `<button type="button" class="action-btn spray pulse" data-action="heal">🐛 Insecticide 🪙${fmtCoins(costs.heal)}</button>`;
  }

  html += `</div><p class="care-tip">Take your time — about ${careRules.careWindowSec}s per care step.</p>`;
  return html;
}

async function runPlotAction(action, index, seedId, skipToolFx = false, keepBusy = false) {
  if (!keepBusy) {
    if (actionBusy) return;
    actionBusy = true;
  }
  skipPlotRender = true;

  try {
    if (action === 'plant') {
      if (!seedId) return;
      await Arcade.post('/api/fast-farm/buy-seed', { seed_id: seedId, plot_index: index });
      sfx('plant', { volume: 0.08 });
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
      sfx('blight', { volume: 0.32 });
      Arcade.toast('🌪️ Sudden blight — crop died!', 'lose');
    } else if (action === 'water') Arcade.toast('💧 Watered!', 'win');
    else if (action === 'fertilize') Arcade.toast('🌿 Fertilized!', 'win');
    else if (action === 'heal') Arcade.toast('🐛 Pests cleared!', 'win');
    if (action === 'clear') {
      sfx('clear', { volume: 0.36 });
      Arcade.toast('Cleared', 'win');
      closeSheet('sheet-plot');
    }
    if (action === 'harvest') {
      sfx('harvest', { volume: 0.72 });
      const seed = seeds[farm.plots[index]?.seed_id];
      const itemId = r.harvested?.itemId;
      const amt = r.harvested?.amount || 1;
      const tier = r.harvested?.tier || 'normal';
      if (itemId && r.inventory) {
        const prevTotal = farm.inventory?.[itemId] || 0;
        const newTotal = r.inventory[itemId] || 0;
        farm.inventory = r.inventory;
        await playHarvestCollectAnimation(index, itemId, amt, tier, prevTotal, newTotal);
      }
      if (tier === 'mega') sfx('harvestMega', { volume: 0.34 });
      else if (tier === 'great') sfx('harvestGreat', { volume: 0.3 });

      const hype =
        tier === 'mega' ? '🎉 Mega harvest!' :
        tier === 'great' ? '✨ Great haul!' :
        tier === 'good' ? '🌾 Nice crop!' :
        tier === 'poor' ? '🌾 Small harvest' : '🌾 Harvested!';
      Arcade.toast(`${hype} +${amt} ${seed?.name || ''}`, tier === 'poor' ? '' : 'win');
      closeSheet('sheet-plot');
    }
  } catch (e) {
    sfx('error', { volume: 0.22 });
    Arcade.toast(e.message || 'Action failed', 'lose');
  } finally {
    skipPlotRender = false;
    actionBusy = false;
    await refreshWallet();
    await refreshFarm();
  }
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

