import { requireGameAccess } from '../auth/operator-auth.mjs';
import { buildContext, extractPlayerId } from '../auth/player-context.mjs';
import { createWalletForOperator } from '../wallet/wallet-adapter.mjs';
import {
  CAST_COST,
  BAIT_PACK_COST,
  BAIT_PACK_SIZE,
  FISH_TABLE,
  createCastSession,
  evaluateReel,
  pickFish,
} from '../games/fishing-engine.mjs';
import { getPlayerData, savePlayerData, addInventory, txId } from '../store/player-store.mjs';
import { addScore } from '../economy/leaderboard.mjs';

const SLUG = 'fishing';

export function handleGetFishingConfig(_req, res) {
  res.json({
    castCost: CAST_COST,
    baitPackCost: BAIT_PACK_COST,
    baitPackSize: BAIT_PACK_SIZE,
    fish: FISH_TABLE,
  });
}

export function handleGetFishingState(req, res) {
  const operator = requireGameAccess(req, res, SLUG);
  if (!operator) return;
  const ctx = buildContext(operator, extractPlayerId(req));
  const session = getPlayerData(ctx);
  res.json({
    gear: session.arcade.fishing,
    pendingCast: session.arcade.pendingCast || null,
    inventory: session.arcade.inventory,
  });
}

export async function handleBuyBait(req, res) {
  const operator = requireGameAccess(req, res, SLUG);
  if (!operator) return;
  const ctx = buildContext(operator, extractPlayerId(req));
  const wallet = createWalletForOperator(operator);
  try {
    const debit = await wallet.debit(ctx, {
      amount: BAIT_PACK_COST,
      game: SLUG,
      roundId: 'buy_bait',
      transactionId: txId('bait'),
      reason: 'Bait pack',
    });
    const session = getPlayerData(ctx);
    session.arcade.fishing.bait += BAIT_PACK_SIZE;
    savePlayerData(ctx, session);
    res.json({ gear: session.arcade.fishing, balance: debit.balance });
  } catch (err) {
    res.status(400).json({ error: err.message, code: err.code });
  }
}

export async function handleCast(req, res) {
  const operator = requireGameAccess(req, res, SLUG);
  if (!operator) return;
  const ctx = buildContext(operator, extractPlayerId(req));
  const session = getPlayerData(ctx);
  if (session.arcade.fishing.bait < 1) {
    return res.status(400).json({ error: 'No bait — buy a pack' });
  }
  const wallet = createWalletForOperator(operator);
  try {
    const debit = await wallet.debit(ctx, {
      amount: CAST_COST,
      game: SLUG,
      roundId: 'cast',
      transactionId: txId('cast'),
      reason: 'Fishing cast',
    });
    session.arcade.fishing.bait -= 1;
    const cast = createCastSession();
    session.arcade.pendingCast = cast;
    savePlayerData(ctx, session);
    res.json({ cast, balance: debit.balance, gear: session.arcade.fishing });
  } catch (err) {
    res.status(400).json({ error: err.message, code: err.code });
  }
}

export function handleReel(req, res) {
  const operator = requireGameAccess(req, res, SLUG);
  if (!operator) return;
  const ctx = buildContext(operator, extractPlayerId(req));
  const { castId, pointer } = req.body || {};
  const session = getPlayerData(ctx);
  const cast = session.arcade.pendingCast;
  if (!cast || cast.id !== castId || Date.now() > cast.expiresAt) {
    return res.status(400).json({ error: 'Cast expired' });
  }
  const result = evaluateReel(cast, Number(pointer));
  session.arcade.pendingCast = null;
  let fish = null;
  if (result.grade !== 'fail') {
    fish = pickFish(result.accuracy);
    addInventory(session, fish.id, 1);
    session.arcade.stats.fishCaught += 1;
    addScore(SLUG, ctx.playerId, ctx.playerId, result.grade === 'perfect' ? 30 : 15, {
      win: result.grade === 'perfect',
    });
  }
  savePlayerData(ctx, session);
  res.json({
    result,
    fish,
    inventory: session.arcade.inventory,
  });
}
