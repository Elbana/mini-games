import fs from 'fs';
import path from 'path';
import { SESSION_DIR } from '../config.mjs';

function ensureDir() {
  fs.mkdirSync(SESSION_DIR, { recursive: true });
}

function filePath(key) {
  const safe = key.replace(/[^a-zA-Z0-9_-]/g, '_');
  return path.join(SESSION_DIR, `${safe}.json`);
}

export function sessionKey(operatorId, playerId) {
  return `${operatorId}_${playerId}`;
}

export function loadSession(key) {
  ensureDir();
  const fp = filePath(key);
  if (!fs.existsSync(fp)) return {};
  try {
    return JSON.parse(fs.readFileSync(fp, 'utf8'));
  } catch {
    return {};
  }
}

export function saveSession(key, data) {
  ensureDir();
  fs.writeFileSync(filePath(key), JSON.stringify(data, null, 2));
}
