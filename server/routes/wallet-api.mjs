import { requireOperator } from '../auth/operator-auth.mjs';
import { buildContext, extractPlayerId } from '../auth/player-context.mjs';
import { createWalletForOperator } from '../wallet/wallet-adapter.mjs';

export async function handleGetBalance(req, res) {
  const operator = requireOperator(req, res);
  if (!operator) return;
  const playerId = extractPlayerId(req);
  const ctx = buildContext(operator, playerId);
  const wallet = createWalletForOperator(operator);
  try {
    const balance = await wallet.getBalance(ctx);
    res.json({ balance, playerId });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
}
