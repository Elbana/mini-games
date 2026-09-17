/** Fast Farm — mirrors Riko Flutter farm_models.dart + farm.js server. */

export const SEEDS = {
  carrot: {
    id: 'carrot',
    name: 'Carrot',
    price: 5,
    growSeconds: 300,
    harvestAmount: 2,
    sellPrice: 4,
    requiredLevel: 1,
    description: 'Fast growing, perfect for beginners!',
    assets: { seed: 'carrot', planted: 'carrot', icon: 'carrot' },
  },
  potato: {
    id: 'potato',
    name: 'Potato',
    price: 8,
    growSeconds: 900,
    harvestAmount: 2,
    sellPrice: 6,
    requiredLevel: 1,
    description: 'A staple crop with steady returns.',
    assets: { seed: 'potato', planted: 'potato', icon: 'potato' },
  },
  beans: {
    id: 'beans',
    name: 'Beans',
    price: 15,
    growSeconds: 1800,
    harvestAmount: 3,
    sellPrice: 7,
    requiredLevel: 2,
    description: 'Magical beans with decent yield!',
    assets: { seed: 'beans', planted: 'beans', icon: 'beans' },
  },
  corn: {
    id: 'corn',
    name: 'Corn',
    price: 25,
    growSeconds: 3600,
    harvestAmount: 2,
    sellPrice: 18,
    requiredLevel: 2,
    description: 'Golden sweetness – worth the wait!',
    assets: { seed: 'corn', planted: 'corn', icon: 'corn' },
  },
  cabbage: {
    id: 'cabbage',
    name: 'Cabbage',
    price: 50,
    growSeconds: 7200,
    harvestAmount: 2,
    sellPrice: 35,
    requiredLevel: 3,
    description: 'Crunchy and valuable!',
    assets: { seed: 'cabbage', planted: 'cabbage', icon: 'cabbage' },
  },
  berry: {
    id: 'berry',
    name: 'Berry',
    price: 100,
    growSeconds: 14400,
    harvestAmount: 3,
    sellPrice: 45,
    requiredLevel: 4,
    description: 'Sweet and plentiful harvest!',
    assets: { seed: 'berry', planted: 'berry', icon: 'berry' },
  },
  pumpkin: {
    id: 'pumpkin',
    name: 'Pumpkin',
    price: 250,
    growSeconds: 28800,
    harvestAmount: 2,
    sellPrice: 175,
    requiredLevel: 5,
    description: 'Premium crop – big overnight profits!',
    assets: { seed: 'pumkin', planted: 'pumkin', icon: 'pumpkin' },
  },
  mushroom: {
    id: 'mushroom',
    name: 'Mushroom',
    price: 500,
    growSeconds: 57600,
    harvestAmount: 2,
    sellPrice: 400,
    requiredLevel: 7,
    description: "Rare fungi – the patient farmer's gold!",
    assets: { seed: 'Mushrooms', planted: 'Mushrooms', icon: 'Mushrooms' },
  },
};

export const PLOT_COUNT = 9;

export const LEVEL_XP = [0, 50, 200, 600, 1600, 4100, 9100, 19100];

export const SLOT_UNLOCK_COSTS = [100, 300, 1000, 3000, 10000, 30000];

export function levelFromXp(xp) {
  for (let i = LEVEL_XP.length - 1; i >= 0; i--) {
    if (xp >= LEVEL_XP[i]) return i + 1;
  }
  return 1;
}

export function xpToNextLevel(xp) {
  const level = levelFromXp(xp);
  if (level >= LEVEL_XP.length) return 0;
  return LEVEL_XP[level] - xp;
}

export function defaultPlots() {
  const plots = [];
  for (let i = 0; i < PLOT_COUNT; i++) {
    if (i >= 6) {
      plots.push({
        plot_index: i,
        state: 'empty',
        seed_id: null,
        planted_at: null,
        unlock_price: 0,
      });
    } else {
      const lockedIdx = 5 - i;
      const cost =
        lockedIdx < SLOT_UNLOCK_COSTS.length ? SLOT_UNLOCK_COSTS[lockedIdx] : 50000;
      plots.push({
        plot_index: i,
        state: 'locked',
        seed_id: null,
        planted_at: null,
        unlock_price: cost,
      });
    }
  }
  return plots;
}

export function createInitialFarm() {
  return {
    version: 2,
    farm_coins: 100,
    farm_xp: 0,
    plots: defaultPlots(),
    inventory: [],
  };
}

export function normalizeFarm(raw) {
  const looksLegacy =
    raw?.plots?.length &&
    (raw.plots[0]?.crop !== undefined || raw.plots[0]?.id !== undefined);
  if (!raw?.plots?.length || raw.version !== 2 || looksLegacy) {
    return createInitialFarm();
  }
  const farm = {
    version: 2,
    farm_coins: raw.farm_coins ?? 100,
    farm_xp: raw.farm_xp ?? 0,
    plots: raw.plots.map((p, i) => ({
      plot_index: p.plot_index ?? i,
      state: p.state ?? 'empty',
      seed_id: p.seed_id ?? null,
      planted_at: p.planted_at ?? null,
      unlock_price: p.unlock_price ?? 0,
    })),
    inventory: Array.isArray(raw.inventory) ? raw.inventory : [],
  };
  while (farm.plots.length < PLOT_COUNT) {
    farm.plots.push({
      plot_index: farm.plots.length,
      state: 'empty',
      seed_id: null,
      planted_at: null,
      unlock_price: 0,
    });
  }
  return farm;
}

export function applyGrowthState(plot) {
  const p = { ...plot };
  if (p.state === 'growing' && p.seed_id && p.planted_at) {
    const seed = SEEDS[p.seed_id];
    if (seed) {
      const elapsed = (Date.now() - new Date(p.planted_at).getTime()) / 1000;
      if (elapsed >= seed.growSeconds) {
        p.state = 'ready';
      }
    }
  }
  return p;
}

export function isReadyToHarvest(plot) {
  if (!plot.seed_id || !plot.planted_at) return false;
  if (plot.state !== 'growing' && plot.state !== 'ready') return false;
  const seed = SEEDS[plot.seed_id];
  if (!seed) return false;
  const elapsed = (Date.now() - new Date(plot.planted_at).getTime()) / 1000;
  return elapsed >= seed.growSeconds;
}

export function growthProgress(plot) {
  if (!plot.seed_id || !plot.planted_at) return 0;
  const seed = SEEDS[plot.seed_id];
  if (!seed) return 0;
  const elapsed = (Date.now() - new Date(plot.planted_at).getTime()) / 1000;
  return Math.min(1, Math.max(0, elapsed / seed.growSeconds));
}

export function inventoryQty(farm, cropId) {
  const item = farm.inventory.find((i) => i.crop_id === cropId);
  return item?.quantity ?? 0;
}

export function addToInventory(farm, cropId, qty) {
  const item = farm.inventory.find((i) => i.crop_id === cropId);
  if (item) item.quantity += qty;
  else farm.inventory.push({ crop_id: cropId, quantity: qty });
}

export function removeFromInventory(farm, cropId, qty) {
  const item = farm.inventory.find((i) => i.crop_id === cropId);
  if (!item || item.quantity < qty) return false;
  item.quantity -= qty;
  if (item.quantity <= 0) {
    farm.inventory = farm.inventory.filter((i) => i.crop_id !== cropId);
  }
  return true;
}
