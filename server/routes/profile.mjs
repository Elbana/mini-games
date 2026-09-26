import { requireOperator } from '../auth/operator-auth.mjs';
import { buildContext, extractPlayerId } from '../auth/player-context.mjs';
import { getPlayerData, savePlayerData } from '../store/player-store.mjs';
import { displayName, readProfile, writeProfile } from '../profile.mjs';
import { applyProfile } from '../economy/leaderboard.mjs';

function load(req, res) {
  const operator = requireOperator(req, res);
  if (!operator) return null;
  const playerId = extractPlayerId(req);
  const ctx = buildContext(operator, playerId);
  const session = getPlayerData(ctx);
  return { ctx, session, playerId };
}

export function handleGetProfile(req, res) {
  const loaded = load(req, res);
  if (!loaded) return;
  const profile = readProfile(loaded.session);
  res.json({
    playerId: loaded.playerId,
    name: profile.name,
    avatar: profile.avatar,
    displayName: displayName(loaded.session),
  });
}

export function handleSaveProfile(req, res) {
  const loaded = load(req, res);
  if (!loaded) return;
  const profile = writeProfile(loaded.session, req.body || {});
  savePlayerData(loaded.ctx, loaded.session);
  const shown = displayName(loaded.session);
  applyProfile(loaded.playerId, shown, profile.avatar);
  res.json({
    playerId: loaded.playerId,
    name: profile.name,
    avatar: profile.avatar,
    displayName: shown,
  });
}
