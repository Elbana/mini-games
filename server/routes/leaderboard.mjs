import { getLeaderboard } from '../economy/leaderboard.mjs';

export function handleGetLeaderboard(req, res) {
  const game = req.params.game || 'candy-battle';
  res.json({ game, entries: getLeaderboard(game) });
}
