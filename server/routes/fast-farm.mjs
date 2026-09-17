import { requireGameAccess } from '../auth/operator-auth.mjs';
import { buildContext, extractPlayerId } from '../auth/player-context.mjs';
import { createWalletForOperator } from '../wallet/wallet-adapter.mjs';
import {
  CROPS,
  emptyPlots,
  advancePlot,
  HEAL_COST,
  rollHarvestQty,
} from '../games/fast-farm-engine.mjs';
import { getPlayerData, savePlayerData, addInventory, txId } from '../store/player-store.mjs';
import { addScore } from '../economy/leaderboard.mjs';

const SLUG = 'fast-farm';

function ensureFarm(session) {
  if (!session.arcade.farm?.plots?.length) {
    session.arcade.farm = { plots: emptyPlots() };
  }
  return session.arcade.farm;
}

export function handleGetFarmConfig(_req, res) {
  res.json({ crops: CROPS, plotCount: 6, healCost: HEAL_COST });
}

export function handleGetFarmState(req, res) {
  const operator = requireGameAccess(req, res, SLUG);
  if (!operator) return;
  const ctx = buildContext(operator, extractPlayerId(req));
  const session = getPlayerData(ctx);
  const farm = ensureFarm(session);
  const now = Date.now();
  farm.plots = farm.plots.map((p) => advancePlot({ ...p }, now));
  savePlayerData(ctx, session);
  res.json({ farm, inventory: session.arcade.inventory, crops: CROPS });
}

export async function handlePlant(req, res) {
  const operator = requireGameAccess(req, res, SLUG);
  if (!operator) return;
  const ctx = buildContext(operator, extractPlayerId(req));
  const { plotId, cropId } = req.body || {};
  const crop = CROPS[cropId];
  if (!crop) return res.status(400).json({ error: 'Unknown crop' });
  const session = getPlayerData(ctx);
  const farm = ensureFarm(session);
  const plot = farm.plots[plotId];
  if (!plot || (plot.crop && !plot.dead)) {
    return res.status(400).json({ error: 'Plot unavailable' });
  }
  const wallet = createWalletForOperator(operator);
  try {
    const debit = await wallet.debit(ctx, {
      amount: crop.seedCost,
      game: SLUG,
      roundId: `plant_${plotId}`,
      transactionId: txId('plant'),
      reason: `Plant ${crop.name}`,
    });
    const now = Date.now();
    plot.crop = cropId;
    plot.plantedAt = now;
    plot.readyAt = now + crop.growSec * 1000;
    plot.wiltAt = plot.readyAt + crop.wiltSec * 1000;
    plot.dead = false;
    plot.needsWater = false;
    savePlayerData(ctx, session);
    res.json({ farm, balance: debit.balance });
  } catch (err) {
    res.status(400).json({ error: err.message, code: err.code });
  }
}

export async function handleWater(req, res) {
  const operator = requireGameAccess(req, res, SLUG);
  if (!operator) return;
  const ctx = buildContext(operator, extractPlayerId(req));
  const { plotId } = req.body || {};
  const session = getPlayerData(ctx);
  const farm = ensureFarm(session);
  const plot = farm.plots[plotId];
  if (!plot?.crop || plot.dead) {
    return res.status(400).json({ error: 'Nothing to heal' });
  }
  const wallet = createWalletForOperator(operator);
  try {
    const debit = await wallet.debit(ctx, {
      amount: HEAL_COST,
      game: SLUG,
      roundId: `heal_${plotId}`,
      transactionId: txId('heal'),
      reason: 'Heal crop',
    });
    plot.needsWater = false;
    plot.wiltAt += 8000;
    savePlayerData(ctx, session);
    res.json({ farm, balance: debit.balance });
  } catch (err) {
    res.status(400).json({ error: err.message, code: err.code });
  }
}

export function handleHarvest(req, res) {
  const operator = requireGameAccess(req, res, SLUG);
  if (!operator) return;
  const ctx = buildContext(operator, extractPlayerId(req));
  const { plotId } = req.body || {};
  const session = getPlayerData(ctx);
  const farm = ensureFarm(session);
  const plot = advancePlot({ ...farm.plots[plotId] }, Date.now());
  farm.plots[plotId] = plot;
  if (!plot.crop || plot.dead) {
    return res.status(400).json({ error: 'Crop dead — clear and replant' });
  }
  const now = Date.now();
  if (now < plot.readyAt) {
    return res.status(400).json({ error: 'Not ready yet' });
  }
  const crop = CROPS[plot.crop];
  const qty = rollHarvestQty(plot.crop);
  addInventory(session, crop.rewardItem, qty);
  session.arcade.stats.farmHarvests += 1;
  addScore(SLUG, ctx.playerId, ctx.playerId, qty * 15, { win: true });
  farm.plots[plotId] = {
    id: plotId,
    crop: null,
    plantedAt: null,
    readyAt: null,
    wiltAt: null,
    dead: false,
    needsWater: false,
  };
  savePlayerData(ctx, session);
  res.json({
    ok: true,
    qty,
    itemId: crop.rewardItem,
    farm,
    inventory: session.arcade.inventory,
  });
}

export function handleClearPlot(req, res) {
  const operator = requireGameAccess(req, res, SLUG);
  if (!operator) return;
  const ctx = buildContext(operator, extractPlayerId(req));
  const { plotId } = req.body || {};
  const session = getPlayerData(ctx);
  const farm = ensureFarm(session);
  farm.plots[plotId] = {
    id: plotId,
    crop: null,
    plantedAt: null,
    readyAt: null,
    wiltAt: null,
    dead: false,
    needsWater: false,
  };
  savePlayerData(ctx, session);
  res.json({ farm });
}
