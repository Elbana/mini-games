/** Fast Farm v7 — chill care loops + daily harvest / market variance. */

import {
  rollFarmBlightAfterCare,
  rollFarmBlightTick,
  cropFertilizeCost,
  cropHealCost,
  cropMarketBase,
} from '../economy/unfair-loss.mjs';
import { getDailyFarmMood } from '../economy/daily-variance.mjs';

function tier(price, harvestAmount, id, name, marketItem, desc, assets) {
  return {
    id,
    name,
    price,
    harvestAmount,
    marketItem,
    description: desc,
    assets,
    fertilizeCost: cropFertilizeCost(price),
    healCost: cropHealCost(price),
    marketBase: cropMarketBase(price),
  };
}

export const SEEDS = {
  carrot: tier(200, 3, 'carrot', 'Carrot', 'crop_carrot', 'Starter crop — cheap but fragile.', {
    seed: 'carrot', planted: 'carrot', icon: 'carrot',
  }),
  potato: tier(600, 2, 'potato', 'Potato', 'crop_potato', 'Low stakes, low mercy.', {
    seed: 'potato', planted: 'potato', icon: 'potato',
  }),
  beans: tier(1500, 2, 'beans', 'Beans', 'crop_beans', 'Mid grind begins here.', {
    seed: 'beans', planted: 'beans', icon: 'beans',
  }),
  corn: tier(4000, 1, 'corn', 'Corn', 'crop_corn', 'Golden rows, thin margins.', {
    seed: 'corn', planted: 'corn', icon: 'corn',
  }),
  cabbage: tier(10000, 1, 'cabbage', 'Cabbage', 'crop_cabbage', 'Heavy seed, heavy risk.', {
    seed: 'cabbage', planted: 'cabbage', icon: 'cabbage',
  }),
  berry: tier(25000, 1, 'berry', 'Berry', 'crop_berry', 'High roller berries.', {
    seed: 'berry', planted: 'berry', icon: 'berry',
  }),
  pumpkin: tier(55000, 1, 'pumpkin', 'Pumpkin', 'crop_pumpkin', 'Whale patch — expect losses.', {
    seed: 'pumkin', planted: 'pumkin', icon: 'pumpkin',
  }),
  mushroom: tier(100000, 1, 'mushroom', 'Mushroom', 'crop_mushroom', '100k seed. Rare payday.', {
    seed: 'Mushrooms', planted: 'Mushrooms', icon: 'Mushrooms',
  }),
};

export const PLOT_COUNT = 9;
export const CARE_STEPS_TO_HARVEST = 6;
export const CARE_WINDOW_SEC = 18;
export const WILT_GRACE_SEC = 10;
export const DEAD_AFTER_WILT_SEC = 14;

export const CARE_SCHEDULE = ['water', 'water', 'fertilize', 'water', 'sick', 'water'];

export function careCostsForSeed(seedId) {
  const seed = SEEDS[seedId];
  if (!seed) return { fertilize: 15, heal: 25 };
  return { fertilize: seed.fertilizeCost, heal: seed.healCost };
}

export function defaultPlots() {
  return Array.from({ length: PLOT_COUNT }, (_, i) => ({
    plot_index: i,
    state: 'empty',
    seed_id: null,
    planted_at: null,
    care_step: 0,
    care_due_at: null,
    care_type: null,
    last_unfair_check: null,
    death_reason: null,
  }));
}

export function createInitialFarm() {
  return { version: 7, plots: defaultPlots() };
}

export function normalizeFarm(raw) {
  if (!raw?.plots?.length || (raw.version !== 6 && raw.version !== 7)) {
    return createInitialFarm();
  }
  const farm = {
    version: 7,
    plots: raw.plots.map((p, i) => ({
      plot_index: p.plot_index ?? i,
      state: p.state === 'locked' ? 'empty' : p.state === 'wilting' ? 'growing' : (p.state ?? 'empty'),
      seed_id: p.seed_id ?? null,
      planted_at: p.planted_at ?? null,
      care_step: p.care_step ?? 0,
      care_due_at: p.care_due_at ?? null,
      care_type: p.care_type ?? null,
      last_unfair_check: p.last_unfair_check ?? null,
      death_reason: p.death_reason ?? null,
    })),
  };
  while (farm.plots.length < PLOT_COUNT) {
    farm.plots.push({
      plot_index: farm.plots.length,
      state: 'empty',
      seed_id: null,
      planted_at: null,
      care_step: 0,
      care_due_at: null,
      care_type: null,
      last_unfair_check: null,
      death_reason: null,
    });
  }
  return farm;
}

function dueMs(plot) {
  return plot.care_due_at ? new Date(plot.care_due_at).getTime() : null;
}

function applyBlight(plot, blight, now) {
  if (!blight) return plot;
  return {
    ...plot,
    state: 'dead',
    death_reason: blight.type,
    last_unfair_check: new Date(now).toISOString(),
  };
}

export function currentCareType(plot) {
  if (plot.state === 'ready' || plot.care_step >= CARE_STEPS_TO_HARVEST) return null;
  return plot.care_type ?? CARE_SCHEDULE[plot.care_step] ?? 'water';
}

export function needsCare(plot, now = Date.now()) {
  if (!plot.seed_id || plot.state === 'empty' || plot.state === 'dead' || plot.state === 'ready') {
    return false;
  }
  const due = dueMs(plot);
  return due != null && now >= due;
}

export function applyGrowthState(plot, now = Date.now()) {
  let p = { ...plot };
  if (!p.seed_id || p.state === 'empty') return p;
  if (p.state === 'dead') return p;

  if (p.care_step >= CARE_STEPS_TO_HARVEST) {
    p.state = 'ready';
    return p;
  }

  const { blightMult } = getDailyFarmMood(new Date(now));
  const tickBlight = rollFarmBlightTick(p, now, blightMult);
  if (tickBlight) return applyBlight(p, tickBlight, now);
  p.last_unfair_check = new Date(now).toISOString();

  const due = dueMs(p);
  if (!due) return p;

  const overdue = now - due;
  if (overdue > (WILT_GRACE_SEC + DEAD_AFTER_WILT_SEC) * 1000) {
    p.state = 'dead';
    p.death_reason = p.death_reason || 'neglect';
  } else {
    p.state = 'growing';
  }

  return p;
}

export function isReadyToHarvest(plot) {
  return plot.care_step >= CARE_STEPS_TO_HARVEST && plot.state !== 'dead';
}

export function careProgress(plot) {
  return Math.min(1, (plot.care_step || 0) / CARE_STEPS_TO_HARVEST);
}

export function needsWater(plot, now = Date.now()) {
  return currentCareType(plot) === 'water' && needsCare(plot, now);
}

export function needsFertilize(plot, now = Date.now()) {
  return currentCareType(plot) === 'fertilize' && needsCare(plot, now);
}

export function needsHeal(plot, now = Date.now()) {
  const type = currentCareType(plot);
  return type === 'sick' && needsCare(plot, now);
}

export function careActionForPlot(plot) {
  const type = currentCareType(plot);
  if (type === 'fertilize') return 'fertilize';
  if (type === 'sick') return 'heal';
  return 'water';
}

export function canPerformCare(plot, action, now = Date.now()) {
  if (!plot.seed_id || plot.state === 'empty' || plot.state === 'ready' || plot.state === 'dead') {
    return false;
  }
  if (action !== careActionForPlot(plot)) return false;
  return needsCare(plot, now);
}

export function canFertilize(plot, now = Date.now()) {
  return needsFertilize(plot, now) && plot.state !== 'dead';
}

function scheduleNextCare(plot, now = Date.now()) {
  if (plot.care_step >= CARE_STEPS_TO_HARVEST) {
    return { ...plot, state: 'ready', care_due_at: null, care_type: null };
  }
  const jitter = Math.floor(Math.random() * 2800);
  return {
    ...plot,
    state: 'growing',
    care_due_at: new Date(now + CARE_WINDOW_SEC * 1000 + jitter).toISOString(),
    care_type: CARE_SCHEDULE[plot.care_step] ?? 'water',
  };
}

export function newPlantedPlot(plot, seedId, now = Date.now()) {
  const jitter = Math.floor(Math.random() * 3200);
  return {
    ...plot,
    state: 'growing',
    seed_id: seedId,
    planted_at: new Date(now).toISOString(),
    care_step: 0,
    care_type: CARE_SCHEDULE[0],
    care_due_at: new Date(now + CARE_WINDOW_SEC * 1000 + jitter).toISOString(),
    last_unfair_check: new Date(now).toISOString(),
    death_reason: null,
  };
}

function advanceCare(plot, now = Date.now()) {
  const { blightMult } = getDailyFarmMood(new Date(now));
  let next = {
    ...plot,
    care_step: (plot.care_step || 0) + 1,
    death_reason: null,
  };
  if (next.care_step >= CARE_STEPS_TO_HARVEST) {
    return { ...next, state: 'ready', care_due_at: null, care_type: null };
  }
  next = scheduleNextCare(next, now);
  return applyBlight(next, rollFarmBlightAfterCare(blightMult), now);
}

export function afterWater(plot, now = Date.now()) {
  if (!canPerformCare(plot, 'water', now)) {
    if (currentCareType(plot) !== 'water') throw new Error('This crop needs something else right now');
    throw new Error('Too early — crop is fine for now');
  }
  return advanceCare({ ...plot, state: 'growing' }, now);
}

export function afterFertilize(plot, now = Date.now()) {
  if (!canPerformCare(plot, 'fertilize', now)) {
    if (currentCareType(plot) !== 'fertilize') throw new Error('This crop does not need fertilizer now');
    throw new Error('Too early to fertilize');
  }
  return advanceCare({ ...plot, state: 'growing' }, now);
}

export function afterHeal(plot, now = Date.now()) {
  if (plot.state === 'dead') {
    throw new Error('Crop is dead — clear the plot and replant');
  }
  if (!canPerformCare(plot, 'heal', now)) {
    throw new Error('This crop does not need insecticide');
  }
  return advanceCare({ ...plot, state: 'growing' }, now);
}

export function emptyPlot(plotIndex) {
  return {
    plot_index: plotIndex,
    state: 'empty',
    seed_id: null,
    planted_at: null,
    care_step: 0,
    care_due_at: null,
    care_type: null,
    last_unfair_check: null,
    death_reason: null,
  };
}
