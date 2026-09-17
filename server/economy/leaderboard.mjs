import fs from 'fs';
import path from 'path';
import { LEADERBOARD_DIR } from '../config.mjs';

const GAMES = ['candy-battle', 'fast-farm', 'fishing', 'market'];

function fileFor(game) {
  return path.join(LEADERBOARD_DIR, `${game}.json`);
}

function loadBoard(game) {
  fs.mkdirSync(LEADERBOARD_DIR, { recursive: true });
  const fp = fileFor(game);
  if (!fs.existsSync(fp)) return [];
  try {
    return JSON.parse(fs.readFileSync(fp, 'utf8'));
  } catch {
    return [];
  }
}

function saveBoard(game, entries) {
  fs.mkdirSync(LEADERBOARD_DIR, { recursive: true });
  fs.writeFileSync(fileFor(game), JSON.stringify(entries, null, 2));
}

export function addScore(game, playerId, displayName, delta, meta = {}) {
  if (!GAMES.includes(game)) return;
  const entries = loadBoard(game);
  let row = entries.find((e) => e.playerId === playerId);
  if (!row) {
    row = { playerId, displayName: displayName || playerId.slice(0, 8), score: 0, wins: 0 };
    entries.push(row);
  }
  row.score += delta;
  if (meta.win) row.wins = (row.wins || 0) + 1;
  if (displayName) row.displayName = displayName;
  row.updatedAt = Date.now();
  entries.sort((a, b) => b.score - a.score);
  saveBoard(game, entries.slice(0, 100));
}

export function getLeaderboard(game, limit = 20) {
  const entries = loadBoard(game);
  return entries.slice(0, limit).map((e, i) => ({ rank: i + 1, ...e }));
}
