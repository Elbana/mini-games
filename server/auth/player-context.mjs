import { sessionKey } from '../session/session-store.mjs';

export function extractPlayerId(req) {
  const q = { ...req.query, ...req.body };
  return q.player || req.headers['x-player-id'] || 'guest';
}

export function buildContext(operator, playerId) {
  const sk = sessionKey(operator.id, playerId);
  return { operator, playerId, sessionKey: sk };
}
