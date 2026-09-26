import { requireGameAccess } from '../auth/operator-auth.mjs';
import { buildContext, extractPlayerId } from '../auth/player-context.mjs';
import { createWalletForOperator } from '../wallet/wallet-adapter.mjs';
import {
  SEEDS,
  PLOT_COUNT,
  CARE_STEPS_TO_HARVEST,
  CARE_WINDOW_SEC,
  careCostsForSeed,
  normalizeFarm,
  applyGrowthState,
  isReadyToHarvest,
  needsWater,
  needsFertilize,
  needsHeal,
  canFertilize,
  currentCareType,
  needsCare,
  careProgress,
  newPlantedPlot,
  afterWater,
  afterFertilize,
  afterHeal,
  emptyPlot,
} from '../games/fast-farm-engine.mjs';
import { getPlayerData, savePlayerData, addInventory, txId } from '../store/player-store.mjs';
import { addScore } from '../economy/leaderboard.mjs';
import { displayName, readProfile } from '../profile.mjs';
import { getDailyFarmMood, rollFarmHarvestYield, MIN_HARVEST_YIELD } from '../economy/daily-variance.mjs';

const SLUG = 'fast-farm';

function ensureFarm(session) {
  session.arcade.farm = normalizeFarm(session.arcade.farm);
  return session.arcade.farm;
}

function serializePlot(p, now = Date.now()) {
  const plot = applyGrowthState(p, now);
  const costs = plot.seed_id ? careCostsForSeed(plot.seed_id) : null;
  return {
    plot_index: plot.plot_index,
    state: plot.state,
    seed_id: plot.seed_id,
    planted_at: plot.planted_at,
    care_step: plot.care_step,
    care_due_at: plot.care_due_at,
    care_type: currentCareType(plot),
    care_progress: careProgress(plot),
    needs_care: needsCare(plot, now),
    needs_water: needsWater(plot, now),
    needs_fertilize: needsFertilize(plot, now),
    needs_heal: needsHeal(plot, now),
    can_fertilize: canFertilize(plot, now),
    ready: isReadyToHarvest(plot),
    death_reason: plot.death_reason || null,
    care_costs: costs,
  };
}

function farmPayload(farm, session) {
  const now = Date.now();
  const dailyMood = getDailyFarmMood(new Date(now));
  return {
    success: true,
    plots: farm.plots.map((p) => serializePlot(p, now)),
    inventory: session.arcade.inventory || {},
    careRules: {
      stepsToHarvest: CARE_STEPS_TO_HARVEST,
      careWindowSec: CARE_WINDOW_SEC,
    },
    dailyMood,
  };
}

export function handleGetFarmConfig(_req, res) {
  res.json({
    seeds: Object.values(SEEDS),
    plotCount: PLOT_COUNT,
    harvestMin: MIN_HARVEST_YIELD,
    careRules: {
      stepsToHarvest: CARE_STEPS_TO_HARVEST,
      careWindowSec: CARE_WINDOW_SEC,
    },
  });
}

export function handleGetFarmState(req, res) {
  const operator = requireGameAccess(req, res, SLUG);
  if (!operator) return;
  const ctx = buildContext(operator, extractPlayerId(req));
  const session = getPlayerData(ctx);
  const farm = ensureFarm(session);
  farm.plots = farm.plots.map((p) => applyGrowthState(p));
  savePlayerData(ctx, session);
  res.json(farmPayload(farm, session));
}

export async function handleBuySeed(req, res) {
  const operator = requireGameAccess(req, res, SLUG);
  if (!operator) return;
  const ctx = buildContext(operator, extractPlayerId(req));
  const { seed_id, plot_index } = req.body || {};
  const seed = SEEDS[seed_id];
  if (!seed) return res.status(400).json({ success: false, error: 'Unknown seed' });
  if (plot_index == null) {
    return res.status(400).json({ success: false, error: 'plot_index required' });
  }

  const session = getPlayerData(ctx);
  const farm = ensureFarm(session);
  const plot = farm.plots[plot_index];
  if (!plot || plot.state !== 'empty') {
    return res.status(400).json({ success: false, error: 'Plot is not available' });
  }

  const wallet = createWalletForOperator(operator);
  try {
    const debit = await wallet.debit(ctx, {
      amount: seed.price,
      game: SLUG,
      roundId: `plant_${plot_index}`,
      transactionId: txId('farm_plant'),
      reason: `Plant ${seed.name}`,
    });

    farm.plots[plot_index] = newPlantedPlot(plot, seed_id);
    savePlayerData(ctx, session);
    res.json({
      success: true,
      balance: debit.balance,
      plot: serializePlot(farm.plots[plot_index]),
    });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message, code: err.code });
  }
}

export async function handleWater(req, res) {
  const operator = requireGameAccess(req, res, SLUG);
  if (!operator) return;
  const ctx = buildContext(operator, extractPlayerId(req));
  const { plot_index } = req.body || {};
  const session = getPlayerData(ctx);
  const farm = ensureFarm(session);
  const plot = applyGrowthState({ ...farm.plots[plot_index] });

  try {
    farm.plots[plot_index] = afterWater(plot);
    savePlayerData(ctx, session);
    const serialized = serializePlot(farm.plots[plot_index]);
    res.json({
      success: true,
      plot: serialized,
      unfair_loss: serialized.death_reason === 'blight',
    });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
}

export async function handleFertilize(req, res) {
  const operator = requireGameAccess(req, res, SLUG);
  if (!operator) return;
  const ctx = buildContext(operator, extractPlayerId(req));
  const { plot_index } = req.body || {};
  const session = getPlayerData(ctx);
  const farm = ensureFarm(session);
  const plot = applyGrowthState({ ...farm.plots[plot_index] });

  if (!canFertilize(plot)) {
    return res.status(400).json({ success: false, error: 'This crop does not need fertilizer now' });
  }

  const seed = SEEDS[plot.seed_id];
  const wallet = createWalletForOperator(operator);
  try {
    const debit = await wallet.debit(ctx, {
      amount: seed.fertilizeCost,
      game: SLUG,
      roundId: `fert_${plot_index}`,
      transactionId: txId('farm_fert'),
      reason: 'Fertilize crop',
    });
    farm.plots[plot_index] = afterFertilize(plot);
    savePlayerData(ctx, session);
    const serialized = serializePlot(farm.plots[plot_index]);
    res.json({
      success: true,
      balance: debit.balance,
      plot: serialized,
      unfair_loss: serialized.death_reason === 'blight',
    });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message, code: err.code });
  }
}

export async function handleHeal(req, res) {
  const operator = requireGameAccess(req, res, SLUG);
  if (!operator) return;
  const ctx = buildContext(operator, extractPlayerId(req));
  const { plot_index } = req.body || {};
  const session = getPlayerData(ctx);
  const farm = ensureFarm(session);
  const plot = applyGrowthState({ ...farm.plots[plot_index] });

  if (plot.state === 'dead' || !needsHeal(plot)) {
    return res.status(400).json({
      success: false,
      error: plot.state === 'dead'
        ? 'Crop is dead — clear the plot and replant'
        : 'This crop does not need insecticide',
    });
  }

  const seed = SEEDS[plot.seed_id];
  const wallet = createWalletForOperator(operator);
  try {
    const debit = await wallet.debit(ctx, {
      amount: seed.healCost,
      game: SLUG,
      roundId: `heal_${plot_index}`,
      transactionId: txId('farm_heal'),
      reason: 'Heal crop',
    });
    farm.plots[plot_index] = afterHeal(plot);
    savePlayerData(ctx, session);
    const serialized = serializePlot(farm.plots[plot_index]);
    res.json({
      success: true,
      balance: debit.balance,
      plot: serialized,
      unfair_loss: serialized.death_reason === 'blight',
    });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message, code: err.code });
  }
}

export function handleClearPlot(req, res) {
  const operator = requireGameAccess(req, res, SLUG);
  if (!operator) return;
  const ctx = buildContext(operator, extractPlayerId(req));
  const { plot_index } = req.body || {};
  const session = getPlayerData(ctx);
  const farm = ensureFarm(session);
  const plot = farm.plots[plot_index];
  if (plot?.state !== 'dead') {
    return res.status(400).json({ success: false, error: 'Plot is not dead' });
  }
  farm.plots[plot_index] = emptyPlot(plot_index);
  savePlayerData(ctx, session);
  res.json({ success: true, plot: serializePlot(farm.plots[plot_index]) });
}

export function handleHarvest(req, res) {
  const operator = requireGameAccess(req, res, SLUG);
  if (!operator) return;
  const ctx = buildContext(operator, extractPlayerId(req));
  const { plot_index } = req.body || {};
  if (plot_index == null) {
    return res.status(400).json({ success: false, error: 'plot_index required' });
  }

  const session = getPlayerData(ctx);
  const farm = ensureFarm(session);
  const plot = applyGrowthState({ ...farm.plots[plot_index] });

  if (!plot?.seed_id) {
    return res.status(400).json({ success: false, error: 'Nothing to harvest' });
  }
  if (!isReadyToHarvest(plot)) {
    return res.status(400).json({
      success: false,
      error: `Crop is not ready — finish all ${CARE_STEPS_TO_HARVEST} care rounds`,
    });
  }

  const seed = SEEDS[plot.seed_id];
  const harvestRoll = rollFarmHarvestYield({
    plotIndex: plot_index,
    seedId: plot.seed_id,
    seedPrice: seed.price,
  });
  const amount = Math.max(MIN_HARVEST_YIELD, harvestRoll.amount);
  addInventory(session, seed.marketItem, amount);
  session.arcade.stats.farmHarvests += 1;
  addScore(SLUG, ctx.playerId, displayName(session), Math.min(500, Math.round(seed.price / 50)), {
    win: true,
    avatar: readProfile(session).avatar,
  });

  farm.plots[plot_index] = emptyPlot(plot_index);
  savePlayerData(ctx, session);
  res.json({
    success: true,
    harvested: {
      itemId: seed.marketItem,
      amount,
      tier: harvestRoll.tier,
      hotCrop: harvestRoll.hotCrop,
    },
    inventory: session.arcade.inventory,
  });
}

export function handleSell(_req, res) {
  res.status(410).json({ success: false, error: 'Sell crops at the Black Market in the Hub' });
}

export function handleUnlockPlot(_req, res) {
  res.json({ success: true, message: 'All plots are unlocked' });
}
