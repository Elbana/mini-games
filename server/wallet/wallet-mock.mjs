import { loadSession, saveSession } from '../session/session-store.mjs';
import { DEFAULT_BALANCE } from '../config.mjs';

export function createMockWallet() {
  return {
    async getBalance(ctx) {
      const session = loadSession(ctx.sessionKey);
      if (session.balance == null) session.balance = DEFAULT_BALANCE;
      return session.balance;
    },

    async debit(ctx, tx) {
      const session = loadSession(ctx.sessionKey);
      const balance = session.balance ?? DEFAULT_BALANCE;
      if (balance < tx.amount) {
        const err = new Error('Insufficient balance');
        err.code = 'INSUFFICIENT_BALANCE';
        throw err;
      }
      session.balance = balance - tx.amount;
      saveSession(ctx.sessionKey, session);
      return { balance: session.balance, transactionId: tx.transactionId };
    },

    async credit(ctx, tx) {
      const session = loadSession(ctx.sessionKey);
      const balance = session.balance ?? DEFAULT_BALANCE;
      session.balance = balance + tx.amount;
      saveSession(ctx.sessionKey, session);
      return { balance: session.balance, transactionId: tx.transactionId };
    },

    async rollback() {},
  };
}
