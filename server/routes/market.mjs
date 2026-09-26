import { requireOperator } from '../auth/operator-auth.mjs';
import { buildContext, extractPlayerId } from '../auth/player-context.mjs';
import { createWalletForOperator } from '../wallet/wallet-adapter.mjs';
import { getMarketSnapshot, recordSale, MARKET_ITEMS } from '../economy/black-market.mjs';
import { addScore } from '../economy/leaderboard.mjs';
import { displayName, readProfile } from '../profile.mjs';
import { getPlayerData, savePlayerData, removeInventory, txId } from '../store/player-store.mjs';

function liveItemPrice(itemId) {
  const snap = getMarketSnapshot();
  const item = snap.items.find((i) => i.id === itemId);
  return item?.price ?? MARKET_ITEMS[itemId]?.basePrice ?? 0;
}

export function handleGetMarket(req, res) {
  const operator = requireOperator(req, res);
  if (!operator) return;
  const playerId = extractPlayerId(req);
  const ctx = buildContext(operator, playerId);
  const session = getPlayerData(ctx);
  const snap = getMarketSnapshot();
  res.json({
    ...snap,
    inventory: session.arcade.inventory,
  });
}

export async function handleSell(req, res) {
  const operator = requireOperator(req, res);
  if (!operator) return;
  const playerId = extractPlayerId(req);
  const ctx = buildContext(operator, playerId);
  const { itemId, qty = 1 } = req.body || {};
  if (!MARKET_ITEMS[itemId] || qty < 1) {
    return res.status(400).json({ error: 'Invalid item' });
  }
  const session = getPlayerData(ctx);
  if (!removeInventory(session, itemId, qty)) {
    return res.status(400).json({ error: 'Not enough items' });
  }
  const unitPrice = liveItemPrice(itemId);
  const total = unitPrice * qty;
  recordSale(itemId, qty);
  const wallet = createWalletForOperator(operator);
  const credit = await wallet.credit(ctx, {
    amount: total,
    game: 'market',
    roundId: `sell_${itemId}`,
    transactionId: txId('sell'),
    reason: `Sold ${qty}x ${itemId}`,
  });
  session.arcade.stats.marketEarnings += total;
  savePlayerData(ctx, session);
  addScore('market', playerId, displayName(session), total, { avatar: readProfile(session).avatar });
  res.json({
    ok: true,
    total,
    unitPrice,
    balance: credit.balance,
    inventory: session.arcade.inventory,
    market: getMarketSnapshot(),
  });
}
