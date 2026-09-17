import { WALLET_TIMEOUT_MS } from '../config.mjs';

async function request(baseUrl, apiKey, path, body, method = 'POST') {
  const url = `${baseUrl.replace(/\/$/, '')}${path}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), WALLET_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
      },
      body: body != null ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
    const text = await res.text();
    let data = {};
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      throw new Error(`Wallet API invalid JSON (${res.status})`);
    }
    if (!res.ok) {
      const err = new Error(data.error || data.message || `Wallet API ${res.status}`);
      err.code = data.code || 'WALLET_ERROR';
      throw err;
    }
    return data;
  } finally {
    clearTimeout(timer);
  }
}

export function createOperatorHttpWallet(walletConfig) {
  const baseUrl = walletConfig.baseUrl;
  const apiKey = walletConfig.apiKey || '';

  return {
    async getBalance(ctx) {
      const data = await request(
        baseUrl,
        apiKey,
        `/players/${encodeURIComponent(ctx.playerId)}/balance`,
        null,
        'GET'
      );
      return Number(data.balance ?? data.amount ?? 0);
    },

    async debit(ctx, tx) {
      const data = await request(baseUrl, apiKey, '/transactions/debit', {
        playerId: ctx.playerId,
        operatorId: ctx.operator.id,
        amount: tx.amount,
        game: tx.game,
        roundId: tx.roundId,
        transactionId: tx.transactionId,
        reason: tx.reason,
      });
      return {
        balance: Number(data.balance ?? data.amountAfter ?? 0),
        transactionId: data.transactionId || tx.transactionId,
      };
    },

    async credit(ctx, tx) {
      const data = await request(baseUrl, apiKey, '/transactions/credit', {
        playerId: ctx.playerId,
        operatorId: ctx.operator.id,
        amount: tx.amount,
        game: tx.game,
        roundId: tx.roundId,
        transactionId: tx.transactionId,
        reason: tx.reason,
      });
      return {
        balance: Number(data.balance ?? data.amountAfter ?? 0),
        transactionId: data.transactionId || tx.transactionId,
      };
    },

    async rollback(ctx, tx) {
      await request(baseUrl, apiKey, '/transactions/rollback', {
        playerId: ctx.playerId,
        transactionId: tx.transactionId,
      });
    },
  };
}
