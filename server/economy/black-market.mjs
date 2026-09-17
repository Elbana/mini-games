import fs from 'fs';
import path from 'path';
import { MARKET_DIR } from '../config.mjs';

/** @type {Record<string, { id: string, name: string, basePrice: number, category: string, icon: string }>} */
export const MARKET_ITEMS = {
  candy_sugar: { id: 'candy_sugar', name: 'Sugar Candy', basePrice: 12, category: 'candy', icon: '🍬' },
  candy_crystal: { id: 'candy_crystal', name: 'Crystal Candy', basePrice: 55, category: 'candy', icon: '💎' },
  candy_royal: { id: 'candy_royal', name: 'Royal Candy', basePrice: 220, category: 'candy', icon: '👑' },
  crop_carrot: { id: 'crop_carrot', name: 'Carrot Crate', basePrice: 18, category: 'crop', icon: '🥕' },
  crop_potato: { id: 'crop_potato', name: 'Potato Sack', basePrice: 22, category: 'crop', icon: '🥔' },
  crop_beans: { id: 'crop_beans', name: 'Bean Bundle', basePrice: 28, category: 'crop', icon: '🫘' },
  crop_corn: { id: 'crop_corn', name: 'Corn Bushel', basePrice: 35, category: 'crop', icon: '🌽' },
  crop_cabbage: { id: 'crop_cabbage', name: 'Cabbage Head', basePrice: 40, category: 'crop', icon: '🥬' },
  crop_berry: { id: 'crop_berry', name: 'Berry Basket', basePrice: 50, category: 'crop', icon: '🫐' },
  crop_pumpkin: { id: 'crop_pumpkin', name: 'Pumpkin', basePrice: 65, category: 'crop', icon: '🎃' },
  crop_mushroom: { id: 'crop_mushroom', name: 'Mushroom Pack', basePrice: 80, category: 'crop', icon: '🍄' },
  fish_sardine: { id: 'fish_sardine', name: 'Sardine', basePrice: 8, category: 'fish', icon: '🐟' },
  fish_bass: { id: 'fish_bass', name: 'Bass', basePrice: 25, category: 'fish', icon: '🐠' },
  fish_tuna: { id: 'fish_tuna', name: 'Tuna', basePrice: 60, category: 'fish', icon: '🐡' },
  fish_shark: { id: 'fish_shark', name: 'Shark', basePrice: 150, category: 'fish', icon: '🦈' },
  fish_leviathan: { id: 'fish_leviathan', name: 'Leviathan', basePrice: 500, category: 'fish', icon: '🐋' },
};

const STATE_FILE = path.join(MARKET_DIR, 'state.json');
const DAY_MS = 24 * 60 * 60 * 1000;

function ensureDir() {
  fs.mkdirSync(MARKET_DIR, { recursive: true });
}

function defaultState() {
  const prices = {};
  const salesLog = {};
  for (const id of Object.keys(MARKET_ITEMS)) {
    prices[id] = MARKET_ITEMS[id].basePrice;
    salesLog[id] = [];
  }
  return { prices, salesLog, updatedAt: Date.now() };
}

function loadState() {
  ensureDir();
  if (!fs.existsSync(STATE_FILE)) return defaultState();
  try {
    return { ...defaultState(), ...JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')) };
  } catch {
    return defaultState();
  }
}

function saveState(state) {
  ensureDir();
  state.updatedAt = Date.now();
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

function pruneSales(sales) {
  const cutoff = Date.now() - DAY_MS;
  return sales.filter((s) => s.at > cutoff);
}

function recalcPrice(itemId, state) {
  const item = MARKET_ITEMS[itemId];
  if (!item) return 0;
  const recent = pruneSales(state.salesLog[itemId] || []);
  state.salesLog[itemId] = recent;
  const volume = recent.reduce((sum, s) => sum + s.qty, 0);
  const supplyPressure = Math.min(0.45, volume * 0.008);
  const lowActivityBoost = volume < 5 ? 0.12 : volume < 20 ? 0.05 : 0;
  const multiplier = 1 - supplyPressure + lowActivityBoost;
  const price = Math.max(1, Math.round(item.basePrice * multiplier));
  state.prices[itemId] = price;
  return price;
}

export function getMarketSnapshot() {
  const state = loadState();
  const items = Object.values(MARKET_ITEMS).map((item) => {
    const price = recalcPrice(item.id, state);
    const recent = state.salesLog[item.id] || [];
    const volume24h = recent.reduce((s, r) => s + r.qty, 0);
    const trend = price > item.basePrice ? 'up' : price < item.basePrice ? 'down' : 'flat';
    return { ...item, price, basePrice: item.basePrice, volume24h, trend };
  });
  saveState(state);
  return { items, updatedAt: state.updatedAt };
}

export function recordSale(itemId, qty) {
  const state = loadState();
  if (!MARKET_ITEMS[itemId]) return null;
  state.salesLog[itemId] = pruneSales(state.salesLog[itemId] || []);
  state.salesLog[itemId].push({ qty, at: Date.now() });
  const price = recalcPrice(itemId, state);
  saveState(state);
  return price;
}

export function getItemPrice(itemId) {
  const snap = getMarketSnapshot();
  return snap.items.find((i) => i.id === itemId)?.price ?? MARKET_ITEMS[itemId]?.basePrice ?? 0;
}
