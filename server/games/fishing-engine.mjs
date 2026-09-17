export const CAST_COST = 0;

export const BAIT_TABLE = [
  { id: 'bait_worm', name: 'Worm', price: 80, icon: '🪱', packSize: 10, tierBoost: 0 },
  { id: 'bait_shrimp', name: 'Shrimp', price: 350, icon: '🦐', packSize: 8, tierBoost: 0.12 },
  { id: 'bait_lure', name: 'Flash Lure', price: 1200, icon: '✨', packSize: 6, tierBoost: 0.28 },
  { id: 'bait_golden', name: 'Golden Bait', price: 8000, icon: '🌟', packSize: 4, tierBoost: 0.48 },
];

export const FISH_RANKS = {
  common: { label: 'Common', stars: 1, color: '#93e6c8' },
  uncommon: { label: 'Uncommon', stars: 2, color: '#6ecbff' },
  rare: { label: 'Rare', stars: 3, color: '#ffd56e' },
  epic: { label: 'Epic', stars: 4, color: '#ff9f43' },
  legendary: { label: 'Legendary', stars: 5, color: '#ff6bcb' },
  mythic: { label: 'Mythic', stars: 6, color: '#c084fc' },
};

export const FISH_TABLE = [
  { id: 'fish_sardine', name: 'Sardine', rank: 'common', weight: 40, icon: '🐟', sellBase: 12 },
  { id: 'fish_bass', name: 'Bass', rank: 'common', weight: 28, icon: '🐠', sellBase: 28 },
  { id: 'fish_tuna', name: 'Tuna', rank: 'uncommon', weight: 18, icon: '🐡', sellBase: 65 },
  { id: 'fish_swordfish', name: 'Swordfish', rank: 'rare', weight: 10, icon: '🗡️', sellBase: 140 },
  { id: 'fish_shark', name: 'Shark', rank: 'epic', weight: 6, icon: '🦈', sellBase: 320 },
  { id: 'fish_leviathan', name: 'Leviathan', rank: 'legendary', weight: 3, icon: '🐋', sellBase: 850 },
  { id: 'fish_phantom', name: 'Phantom Ray', rank: 'mythic', weight: 1, icon: '👻', sellBase: 5000, mythic: true },
];

export const FIGHT_TIERS = {
  common: {
    label: 'Something bit!',
    sub: 'Steady… keep it in the green',
    color: '#93e6c8',
    pull: 0.38,
    greenHalf: 0.2,
    progressRate: 0.22,
    fishRanks: ['common'],
  },
  nice: {
    label: 'Nice Fish!',
    sub: "Don't let this one go",
    color: '#6ecbff',
    pull: 0.46,
    greenHalf: 0.17,
    progressRate: 0.18,
    fishRanks: ['common', 'uncommon'],
  },
  big: {
    label: 'BIG FISH!',
    sub: 'Hang on — this is a fighter',
    color: '#ffd56e',
    pull: 0.54,
    greenHalf: 0.15,
    progressRate: 0.15,
    fishRanks: ['uncommon', 'rare'],
  },
  super: {
    label: 'SUPER FISH!!',
    sub: 'Huge catch — reel carefully!',
    color: '#ff9f43',
    pull: 0.62,
    greenHalf: 0.13,
    progressRate: 0.12,
    fishRanks: ['rare', 'epic'],
  },
  monster: {
    label: 'MONSTER!!',
    sub: 'Legendary beast on the line!',
    color: '#ff6bcb',
    pull: 0.72,
    greenHalf: 0.11,
    progressRate: 0.1,
    fishRanks: ['epic', 'legendary'],
  },
};

export function normalizeFishingGear(fishing) {
  if (!fishing) fishing = {};
  if (!fishing.baitStock) {
    const legacy = fishing.bait ?? fishing.gear?.bait ?? 0;
    fishing.baitStock = { bait_worm: legacy };
    delete fishing.bait;
  }
  for (const b of BAIT_TABLE) {
    fishing.baitStock[b.id] = Math.max(0, Number(fishing.baitStock[b.id]) || 0);
  }
  if (!fishing.selectedBait || !BAIT_TABLE.some((b) => b.id === fishing.selectedBait)) {
    fishing.selectedBait = 'bait_worm';
  }
  fishing.gear = { rod: fishing.gear?.rod || 1 };
  return fishing;
}

export function getBaitById(id) {
  return BAIT_TABLE.find((b) => b.id === id) || BAIT_TABLE[0];
}

export function rollFightTier(baitBoost = 0) {
  let r = Math.random() - baitBoost * 0.35;
  if (r < 0.35) return 'common';
  if (r < 0.58) return 'nice';
  if (r < 0.76) return 'big';
  if (r < 0.9) return 'super';
  return 'monster';
}

export function pickFishForTier(tierKey) {
  const tier = FIGHT_TIERS[tierKey] || FIGHT_TIERS.common;
  const pool = FISH_TABLE.filter((f) => !f.mythic && tier.fishRanks.includes(f.rank));
  if (!pool.length) return FISH_TABLE[0];
  const total = pool.reduce((s, f) => s + f.weight, 0);
  let r = Math.random() * total;
  for (const f of pool) {
    r -= f.weight;
    if (r <= 0) return f;
  }
  return pool[pool.length - 1];
}

export function rollMythicCatch(baitId) {
  const bait = getBaitById(baitId);
  let chance = 0.002;
  if (bait.id === 'bait_lure') chance = 0.006;
  if (bait.id === 'bait_golden') chance = 0.018;
  if (Math.random() < chance) return FISH_TABLE.find((f) => f.mythic);
  return null;
}

export function createCastSession({ x = 0.5, y = 0.5, baitId = 'bait_worm' } = {}) {
  const bait = getBaitById(baitId);
  const tierKey = rollFightTier(bait.tierBoost);
  const tier = FIGHT_TIERS[tierKey];
  const fish = pickFishForTier(tierKey);
  const biteDelay = 3500 + Math.floor(Math.random() * 4500);

  return {
    id: `cast_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    castX: Math.max(0.08, Math.min(0.92, Number(x) || 0.5)),
    castY: Math.max(0.12, Math.min(0.88, Number(y) || 0.5)),
    baitId: bait.id,
    tierKey,
    tierLabel: tier.label,
    tierSub: tier.sub,
    tierColor: tier.color,
    fishPull: tier.pull + (Math.random() - 0.5) * 0.06,
    greenHalf: tier.greenHalf,
    progressRate: tier.progressRate,
    biteDelay,
    fishId: fish.id,
    expiresAt: Date.now() + 90000,
  };
}

export function evaluateFight(_session, { won, greenRatio = 0, failReason = 'escaped' } = {}) {
  const g = Math.max(0, Math.min(1, Number(greenRatio) || 0));
  if (!won) {
    return { grade: 'fail', accuracy: 0, reason: failReason };
  }
  if (g >= 0.55) return { grade: 'perfect', accuracy: g };
  if (g >= 0.3) return { grade: 'good', accuracy: g };
  return { grade: 'miss', accuracy: g };
}

export function resolveCatchFish(cast) {
  const mythic = rollMythicCatch(cast.baitId);
  if (mythic) return mythic;
  return getFishById(cast.fishId);
}

export function getFishById(id) {
  return FISH_TABLE.find((f) => f.id === id) || FISH_TABLE[0];
}

export function fishMeta(fish) {
  const rank = FISH_RANKS[fish.rank] || FISH_RANKS.common;
  return {
    ...fish,
    rankLabel: rank.label,
    rankColor: rank.color,
    rankStars: rank.stars,
  };
}
