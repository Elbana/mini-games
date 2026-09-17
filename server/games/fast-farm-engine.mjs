/** Fast-growing crops — seconds, not minutes */

export const CROPS = {
  carrot: {
    id: 'carrot',
    name: 'Carrot',
    seedCost: 15,
    growSec: 25,
    wiltSec: 12,
    rewardItem: 'crop_carrot',
    rewardQty: [1, 2],
    asset: 'carrot',
  },
  potato: {
    id: 'potato',
    name: 'Potato',
    seedCost: 18,
    growSec: 30,
    wiltSec: 14,
    rewardItem: 'crop_potato',
    rewardQty: [1, 2],
    asset: 'potato',
  },
  berry: {
    id: 'berry',
    name: 'Berry',
    seedCost: 25,
    growSec: 35,
    wiltSec: 15,
    rewardItem: 'crop_berry',
    rewardQty: [1, 3],
    asset: 'berry',
  },
  corn: {
    id: 'corn',
    name: 'Corn',
    seedCost: 32,
    growSec: 45,
    wiltSec: 18,
    rewardItem: 'crop_corn',
    rewardQty: [1, 2],
    asset: 'corn',
  },
  mushroom: {
    id: 'mushroom',
    name: 'Mushroom',
    seedCost: 45,
    growSec: 55,
    wiltSec: 20,
    rewardItem: 'crop_mushroom',
    rewardQty: [1, 2],
    asset: 'Mushrooms',
  },
  pumpkin: {
    id: 'pumpkin',
    name: 'Pumpkin',
    seedCost: 55,
    growSec: 65,
    wiltSec: 22,
    rewardItem: 'crop_pumpkin',
    rewardQty: [1, 1],
    asset: 'pumkin',
  },
};

export const PLOT_COUNT = 6;
export const HEAL_COST = 8;

export function emptyPlots() {
  return Array.from({ length: PLOT_COUNT }, (_, i) => ({
    id: i,
    crop: null,
    plantedAt: null,
    readyAt: null,
    wiltAt: null,
    dead: false,
    needsWater: false,
  }));
}

export function advancePlot(plot, now = Date.now()) {
  if (!plot.crop || plot.dead) return plot;
  const crop = CROPS[plot.crop];
  if (!crop) return plot;
  const t = now / 1000;
  const ready = plot.readyAt / 1000;
  const wilt = plot.wiltAt / 1000;
  if (t >= wilt) {
    plot.dead = true;
    plot.needsWater = false;
  } else if (t >= ready) {
    plot.needsWater = Math.random() < 0.35 && t < ready + crop.wiltSec * 0.5;
  }
  return plot;
}

export function rollHarvestQty(cropId) {
  const crop = CROPS[cropId];
  const [min, max] = crop.rewardQty;
  return min + Math.floor(Math.random() * (max - min + 1));
}
