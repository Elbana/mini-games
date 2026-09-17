import { loadSession, saveSession } from '../session/session-store.mjs';

export function getPlayerData(ctx) {
  const session = loadSession(ctx.sessionKey);
  if (!session.arcade) {
    session.arcade = {
      inventory: {},
      candyBattle: null,
      farm: { version: 6, plots: [] },
      fishing: { gear: { rod: 1, bait: 10 } },
      stats: { candyWins: 0, farmHarvests: 0, fishCaught: 0, marketEarnings: 0 },
    };
  }
  return session;
}

export function savePlayerData(ctx, session) {
  saveSession(ctx.sessionKey, session);
}

export function addInventory(session, itemId, qty) {
  session.arcade.inventory[itemId] = (session.arcade.inventory[itemId] || 0) + qty;
}

export function removeInventory(session, itemId, qty) {
  const have = session.arcade.inventory[itemId] || 0;
  if (have < qty) return false;
  session.arcade.inventory[itemId] = have - qty;
  if (session.arcade.inventory[itemId] === 0) delete session.arcade.inventory[itemId];
  return true;
}

export function txId(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}
