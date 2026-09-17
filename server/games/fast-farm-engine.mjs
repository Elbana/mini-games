/** Fast Farm v5 — care-step survival. 10 care rounds per crop; losses are expected. */

export const SEEDS = {
  carrot: {
    id: 'carrot',
    name: 'Carrot',
    price: 12,
    harvestAmount: 1,
    marketItem: 'crop_carrot',
    description: 'Cheap starter — still easy to kill.',
    assets: { seed: 'carrot', planted: 'carrot', icon: 'carrot' },
  },
  potato: {
    id: 'potato',
    name: 'Potato',
    price: 14,
    harvestAmount: 1,
    marketItem: 'crop_potato',
    description: 'Hardy look, not hardy care.',
    assets: { seed: 'potato', planted: 'potato', icon: 'potato' },
  },
  beans: {
    id: 'beans',
    name: 'Beans',
    price: 18,
    harvestAmount: 1,
    marketItem: 'crop_beans',
    description: 'Extra fuss for a slim payout.',
    assets: { seed: 'beans', planted: 'beans', icon: 'beans' },
  },
  corn: {
    id: 'corn',
    name: 'Corn',
    price: 22,
    harvestAmount: 1,
    marketItem: 'crop_corn',
    description: 'Mid stake, mid grief.',
    assets: { seed: 'corn', planted: 'corn', icon: 'corn' },
  },
  cabbage: {
    id: 'cabbage',
    name: 'Cabbage',
    price: 26,
    harvestAmount: 1,
    marketItem: 'crop_cabbage',
    description: 'Slow care loop, tiny reward.',
    assets: { seed: 'cabbage', planted: 'cabbage', icon: 'cabbage' },
  },
  berry: {
    id: 'berry',
    name: 'Berry',
    price: 32,
    harvestAmount: 2,
    marketItem: 'crop_berry',
    description: 'Rare double yield if you survive.',
    assets: { seed: 'berry', planted: 'berry', icon: 'berry' },
  },
  pumpkin: {
    id: 'pumpkin',
    name: 'Pumpkin',
    price: 40,
    harvestAmount: 1,
    marketItem: 'crop_pumpkin',
    description: 'Big seed tax, small hope.',
    assets: { seed: 'pumkin', planted: 'pumkin', icon: 'pumpkin' },
  },
  mushroom: {
    id: 'mushroom',
    name: 'Mushroom',
    price: 48,
    harvestAmount: 1,
    marketItem: 'crop_mushroom',
    description: 'Whale bait — usually a loss.',
    assets: { seed: 'Mushrooms', planted: 'Mushrooms', icon: 'Mushrooms' },
  },
};

export const PLOT_COUNT = 9;
export const CARE_STEPS_TO_HARVEST = 10;
export const CARE_WINDOW_SEC = 6.5;
export const WILT_GRACE_SEC = 3.5;
export const DEAD_AFTER_WILT_SEC = 5;
export const FERTILIZE_COST = 4;
export const HEAL_COST = 6;

/** 10 rounds — mostly water, 2 fert + 1 sick so 3 plots is tense but doable. */
export const CARE_SCHEDULE = [
  'water',
  'water',
  'water',
  'fertilize',
  'water',
  'water',
  'sick',
  'water',
  'fertilize',
  'water',
];

export function defaultPlots() {
  return Array.from({ length: PLOT_COUNT }, (_, i) => ({
    plot_index: i,
    state: 'empty',
    seed_id: null,
    planted_at: null,
    care_step: 0,
    care_due_at: null,
    care_type: null,
  }));
}

export function createInitialFarm() {
  return { version: 5, plots: defaultPlots() };
}

export function normalizeFarm(raw) {
  if (!raw?.plots?.length || raw.version !== 5) {
    return createInitialFarm();
  }
  const farm = {
    version: 5,
    plots: raw.plots.map((p, i) => ({
      plot_index: p.plot_index ?? i,
      state: p.state === 'locked' ? 'empty' : (p.state ?? 'empty'),
      seed_id: p.seed_id ?? null,
      planted_at: p.planted_at ?? null,
      care_step: p.care_step ?? 0,
      care_due_at: p.care_due_at ?? null,
      care_type: p.care_type ?? null,
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
    });
  }
  return farm;
}

function dueMs(plot) {
  return plot.care_due_at ? new Date(plot.care_due_at).getTime() : null;
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

export function isCareOverdue(plot, now = Date.now()) {
  return needsCare(plot, now);
}

export function applyGrowthState(plot, now = Date.now()) {
  const p = { ...plot };
  if (!p.seed_id || p.state === 'empty') return p;
  if (p.state === 'dead') return p;

  if (p.care_step >= CARE_STEPS_TO_HARVEST) {
    p.state = 'ready';
    return p;
  }

  const due = dueMs(p);
  if (!due) return p;

  const overdue = now - due;
  if (overdue > (WILT_GRACE_SEC + DEAD_AFTER_WILT_SEC) * 1000) {
    p.state = 'dead';
  } else if (overdue > WILT_GRACE_SEC * 1000) {
    p.state = 'wilting';
  } else if (p.state !== 'wilting') {
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
  return (
    (type === 'sick' && (needsCare(plot, now) || plot.state === 'wilting')) ||
    plot.state === 'dead'
  );
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
  const expected = careActionForPlot(plot);
  if (action !== expected) return false;
  return needsCare(plot, now) || plot.state === 'wilting';
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
  const planted = {
    ...plot,
    state: 'growing',
    seed_id: seedId,
    planted_at: new Date(now).toISOString(),
    care_step: 0,
    care_type: CARE_SCHEDULE[0],
    care_due_at: new Date(now + CARE_WINDOW_SEC * 1000 + jitter).toISOString(),
  };
  return planted;
}

function advanceCare(plot, now = Date.now()) {
  const next = {
    ...plot,
    care_step: (plot.care_step || 0) + 1,
  };
  if (next.care_step >= CARE_STEPS_TO_HARVEST) {
    return { ...next, state: 'ready', care_due_at: null, care_type: null };
  }
  return scheduleNextCare(next, now);
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
    return scheduleNextCare(
      { ...plot, state: 'growing', care_step: plot.care_step || 0 },
      now,
    );
  }
  if (!canPerformCare(plot, 'heal', now)) {
    throw new Error('This crop is not sick');
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
  };
}
