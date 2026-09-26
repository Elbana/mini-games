import { requireGameAccess } from '../auth/operator-auth.mjs';
import { buildContext, extractPlayerId } from '../auth/player-context.mjs';
import { createWalletForOperator } from '../wallet/wallet-adapter.mjs';
import {
  BAIT_TABLE,
  FISH_TABLE,
  FISH_RANKS,
  createCastSession,
  evaluateFight,
  fishMeta,
  getBaitById,
  normalizeFishingGear,
  resolveCatchFish,
} from '../games/fishing-engine.mjs';
import { getPlayerData, savePlayerData, addInventory, txId } from '../store/player-store.mjs';
import { addScore } from '../economy/leaderboard.mjs';
import { displayName, readProfile } from '../profile.mjs';
import { rollFishingMisfortune } from '../economy/unfair-loss.mjs';
import {
  getDailyFishingMood,
  rollFishingDoubleCatch,
} from '../economy/daily-variance.mjs';

const SLUG = 'fishing';

export function handleGetFishingConfig(_req, res) {
  res.json({
    baits: BAIT_TABLE,
    fish: FISH_TABLE,
    ranks: FISH_RANKS,
    dailyMood: getDailyFishingMood(),
  });
}

export function handleGetFishingState(req, res) {
  const operator = requireGameAccess(req, res, SLUG);
  if (!operator) return;
  const ctx = buildContext(operator, extractPlayerId(req));
  const session = getPlayerData(ctx);
  session.arcade.fishing = normalizeFishingGear(session.arcade.fishing);
  res.json({
    gear: session.arcade.fishing,
    pendingCast: session.arcade.pendingCast || null,
    inventory: session.arcade.inventory,
  });
}

export async function handleSelectBait(req, res) {
  const operator = requireGameAccess(req, res, SLUG);
  if (!operator) return;
  const ctx = buildContext(operator, extractPlayerId(req));
  const { baitId } = req.body || {};
  const session = getPlayerData(ctx);
  session.arcade.fishing = normalizeFishingGear(session.arcade.fishing);
  if (!BAIT_TABLE.some((b) => b.id === baitId)) {
    return res.status(400).json({ error: 'Unknown bait type' });
  }
  session.arcade.fishing.selectedBait = baitId;
  savePlayerData(ctx, session);
  res.json({ gear: session.arcade.fishing });
}

export async function handleBuyBait(req, res) {
  const operator = requireGameAccess(req, res, SLUG);
  if (!operator) return;
  const ctx = buildContext(operator, extractPlayerId(req));
  const { baitId } = req.body || {};
  const bait = getBaitById(baitId);
  const session = getPlayerData(ctx);
  session.arcade.fishing = normalizeFishingGear(session.arcade.fishing);
  const wallet = createWalletForOperator(operator);
  try {
    const debit = await wallet.debit(ctx, {
      amount: bait.price,
      game: SLUG,
      roundId: 'buy_bait',
      transactionId: txId('bait'),
      reason: `${bait.name} pack`,
    });
    session.arcade.fishing.baitStock[bait.id] += bait.packSize;
    session.arcade.fishing.selectedBait = bait.id;
    savePlayerData(ctx, session);
    res.json({ gear: session.arcade.fishing, balance: debit.balance, bought: bait });
  } catch (err) {
    res.status(400).json({ error: err.message, code: err.code });
  }
}

export async function handleCast(req, res) {
  const operator = requireGameAccess(req, res, SLUG);
  if (!operator) return;
  const ctx = buildContext(operator, extractPlayerId(req));
  const session = getPlayerData(ctx);
  session.arcade.fishing = normalizeFishingGear(session.arcade.fishing);
  const { x, y, baitId: reqBait } = req.body || {};
  const baitId = reqBait || session.arcade.fishing.selectedBait;
  const bait = getBaitById(baitId);
  const stock = session.arcade.fishing.baitStock[bait.id] || 0;
  if (stock < 1) {
    return res.status(400).json({ error: `No ${bait.name} — open bait shop to buy` });
  }
  session.arcade.fishing.baitStock[bait.id] -= 1;
  session.arcade.fishing.selectedBait = bait.id;
  const dailyMood = getDailyFishingMood();
  const cast = createCastSession({ x, y, baitId: bait.id, dailyTierBoost: dailyMood.tierBoost });
  session.arcade.pendingCast = cast;
  savePlayerData(ctx, session);
  res.json({ cast, gear: session.arcade.fishing, dailyMood });
}

export function handleReel(req, res) {
  const operator = requireGameAccess(req, res, SLUG);
  if (!operator) return;
  const ctx = buildContext(operator, extractPlayerId(req));
  const { castId, outcome, greenRatio, progress } = req.body || {};
  const session = getPlayerData(ctx);
  const cast = session.arcade.pendingCast;
  if (!cast || cast.id !== castId || Date.now() > cast.expiresAt) {
    return res.status(400).json({ error: 'Cast expired — cast again' });
  }

  const prog = Number(progress) || 0;
  let won = prog >= 0.98 || outcome === 'caught';
  const failReason = outcome === 'snapped' ? 'snapped' : 'escaped';
  const result = evaluateFight(cast, { won, greenRatio, failReason });
  const dailyMood = getDailyFishingMood();
  let misfortune = null;
  let catchQty = 1;

  session.arcade.pendingCast = null;
  let fish = null;

  if (won) {
    misfortune = rollFishingMisfortune(result, dailyMood.misfortuneMult);
    if (misfortune) {
      won = false;
    } else {
      fish = resolveCatchFish(cast, dailyMood);
      catchQty = rollFishingDoubleCatch(dailyMood) ? 2 : 1;
      addInventory(session, fish.id, catchQty);
      session.arcade.stats.fishCaught += catchQty;
      addScore(SLUG, ctx.playerId, displayName(session), result.grade === 'perfect' ? 30 : 15, {
        win: result.grade === 'perfect',
        avatar: readProfile(session).avatar,
      });
    }
  }

  savePlayerData(ctx, session);
  res.json({
    result,
    won,
    misfortune,
    catchQty: won ? catchQty : 0,
    fish: fish ? fishMeta(fish) : null,
    tierKey: cast.tierKey,
    tierLabel: cast.tierLabel,
    baitId: cast.baitId,
    inventory: session.arcade.inventory,
    dailyMood,
  });
}
