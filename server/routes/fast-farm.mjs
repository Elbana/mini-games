import { requireGameAccess } from '../auth/operator-auth.mjs';
import { buildContext, extractPlayerId } from '../auth/player-context.mjs';
import {
  SEEDS,
  PLOT_COUNT,
  levelFromXp,
  normalizeFarm,
  applyGrowthState,
  isReadyToHarvest,
  addToInventory,
  removeFromInventory,
} from '../games/fast-farm-engine.mjs';
import { getPlayerData, savePlayerData } from '../store/player-store.mjs';
import { addScore } from '../economy/leaderboard.mjs';

const SLUG = 'fast-farm';

function ensureFarm(session) {
  session.arcade.farm = normalizeFarm(session.arcade.farm);
  return session.arcade.farm;
}

function farmPayload(farm) {
  const plots = farm.plots.map(applyGrowthState);
  return {
    success: true,
    farm_coins: farm.farm_coins,
    farm_xp: farm.farm_xp,
    farm_level: levelFromXp(farm.farm_xp),
    plots: plots.map((p) => ({
      plot_index: p.plot_index,
      state: p.state,
      seed_id: p.seed_id,
      planted_at: p.planted_at,
      unlock_price: p.unlock_price,
    })),
    inventory: farm.inventory.filter((i) => i.quantity > 0),
  };
}

export function handleGetFarmConfig(_req, res) {
  res.json({
    seeds: Object.values(SEEDS),
    plotCount: PLOT_COUNT,
    levelXp: [0, 50, 200, 600, 1600, 4100, 9100, 19100],
  });
}

export function handleGetFarmState(req, res) {
  const operator = requireGameAccess(req, res, SLUG);
  if (!operator) return;
  const ctx = buildContext(operator, extractPlayerId(req));
  const session = getPlayerData(ctx);
  const farm = ensureFarm(session);
  savePlayerData(ctx, session);
  res.json(farmPayload(farm));
}

export function handleBuySeed(req, res) {
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
  const level = levelFromXp(farm.farm_xp);

  if (level < seed.requiredLevel) {
    return res.status(400).json({ success: false, error: `Requires farm level ${seed.requiredLevel}` });
  }
  if (farm.farm_coins < seed.price) {
    return res.status(400).json({ success: false, error: 'Insufficient farm coins' });
  }

  const plot = farm.plots[plot_index];
  if (!plot || plot.state !== 'empty') {
    return res.status(400).json({ success: false, error: 'Plot is not available' });
  }

  farm.farm_coins -= seed.price;
  const now = new Date().toISOString();
  farm.plots[plot_index] = {
    ...plot,
    state: 'growing',
    seed_id,
    planted_at: now,
  };

  savePlayerData(ctx, session);
  res.json({
    success: true,
    farm_coins: farm.farm_coins,
    plot: farm.plots[plot_index],
  });
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

  if (!plot?.seed_id || !plot.planted_at) {
    return res.status(400).json({ success: false, error: 'Nothing to harvest' });
  }
  if (!isReadyToHarvest(plot)) {
    return res.status(400).json({ success: false, error: 'Not ready to harvest yet' });
  }

  const seed = SEEDS[plot.seed_id];
  addToInventory(farm, plot.seed_id, seed.harvestAmount);
  session.arcade.stats.farmHarvests += 1;
  addScore(SLUG, ctx.playerId, ctx.playerId, seed.harvestAmount * 10, { win: true });

  farm.plots[plot_index] = {
    plot_index,
    state: 'empty',
    seed_id: null,
    planted_at: null,
    unlock_price: plot.unlock_price,
  };

  savePlayerData(ctx, session);
  res.json({
    success: true,
    harvested: { crop_id: plot.seed_id, amount: seed.harvestAmount },
    inventory: farm.inventory.filter((i) => i.quantity > 0),
  });
}

export function handleSell(req, res) {
  const operator = requireGameAccess(req, res, SLUG);
  if (!operator) return;
  const ctx = buildContext(operator, extractPlayerId(req));
  const { crop_id, quantity } = req.body || {};
  const seed = SEEDS[crop_id];
  if (!seed || !quantity || quantity <= 0) {
    return res.status(400).json({ success: false, error: 'crop_id and positive quantity required' });
  }

  const session = getPlayerData(ctx);
  const farm = ensureFarm(session);
  if (!removeFromInventory(farm, crop_id, quantity)) {
    return res.status(400).json({ success: false, error: 'Insufficient crop quantity' });
  }

  const totalPrice = quantity * seed.sellPrice;
  const xpGained = Math.ceil((quantity * seed.sellPrice) / 2);
  const oldLevel = levelFromXp(farm.farm_xp);
  farm.farm_coins += totalPrice;
  farm.farm_xp += xpGained;
  const newLevel = levelFromXp(farm.farm_xp);

  savePlayerData(ctx, session);
  res.json({
    success: true,
    earned_coins: totalPrice,
    earned_xp: xpGained,
    farm_coins: farm.farm_coins,
    farm_xp: farm.farm_xp,
    farm_level: newLevel,
    leveled_up: newLevel > oldLevel,
    inventory: farm.inventory.filter((i) => i.quantity > 0),
  });
}

export function handleUnlockPlot(req, res) {
  const operator = requireGameAccess(req, res, SLUG);
  if (!operator) return;
  const ctx = buildContext(operator, extractPlayerId(req));
  const { plot_index } = req.body || {};
  if (plot_index == null) {
    return res.status(400).json({ success: false, error: 'plot_index required' });
  }

  const session = getPlayerData(ctx);
  const farm = ensureFarm(session);
  const plot = farm.plots[plot_index];

  if (!plot || plot.state !== 'locked') {
    return res.status(400).json({ success: false, error: 'Plot is not locked' });
  }
  if (farm.farm_coins < plot.unlock_price) {
    return res.status(400).json({ success: false, error: 'Insufficient farm coins' });
  }

  farm.farm_coins -= plot.unlock_price;
  farm.plots[plot_index] = {
    ...plot,
    state: 'empty',
  };

  savePlayerData(ctx, session);
  res.json({
    success: true,
    farm_coins: farm.farm_coins,
    plot: farm.plots[plot_index],
  });
}
