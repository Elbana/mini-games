import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

export const IS_PRODUCTION = process.env.NODE_ENV === 'production';
export const PORT = parseInt(process.env.PORT || '5190', 10);
export const GAMES_ROOT = path.join(ROOT, 'games');
export const ASSETS_ROOT = path.join(ROOT, 'assets');
export const DATA_ROOT = process.env.DATA_ROOT || path.join(ROOT, 'data');
export const SESSION_DIR = path.join(DATA_ROOT, 'sessions');
export const MARKET_DIR = path.join(DATA_ROOT, 'market');
export const LEADERBOARD_DIR = path.join(DATA_ROOT, 'leaderboards');
export const OPERATORS_FILE = path.join(ROOT, 'server', 'config', 'operators.json');

export const DEFAULT_BALANCE = parseInt(process.env.DEFAULT_BALANCE || '500000', 10);
export const WALLET_MOCK = process.env.WALLET_MOCK === '1' || !IS_PRODUCTION;
export const OPERATOR_WALLET_BASE_URL = process.env.OPERATOR_WALLET_BASE_URL || '';
export const WALLET_TIMEOUT_MS = parseInt(process.env.WALLET_TIMEOUT_MS || '8000', 10);
export const REQUIRE_AUTH = process.env.REQUIRE_AUTH === '1';

export const CORS_ORIGINS = (process.env.CORS_ORIGINS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
