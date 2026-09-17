export const CAST_COST = 12;
export const BAIT_PACK_COST = 50;
export const BAIT_PACK_SIZE = 8;

export const FISH_TABLE = [
  { id: 'fish_sardine', name: 'Sardine', weight: 45, minSkill: 0, icon: '🐟' },
  { id: 'fish_bass', name: 'Bass', weight: 28, minSkill: 0.35, icon: '🐠' },
  { id: 'fish_tuna', name: 'Tuna', weight: 15, minSkill: 0.55, icon: '🐡' },
  { id: 'fish_shark', name: 'Shark', weight: 8, minSkill: 0.72, icon: '🦈' },
  { id: 'fish_leviathan', name: 'Leviathan', weight: 4, minSkill: 0.88, icon: '🐋' },
];

/** Motivating bite tiers — shown when the fight starts */
export const FIGHT_TIERS = {
  common: {
    label: 'Something bit!',
    sub: 'Steady… keep it in the green',
    color: '#93e6c8',
    pull: 0.28,
    greenHalf: 0.22,
    progressRate: 0.28,
    fishIds: ['fish_sardine', 'fish_bass'],
  },
  nice: {
    label: 'Nice Fish!',
    sub: "Don't let this one go",
    color: '#6ecbff',
    pull: 0.34,
    greenHalf: 0.2,
    progressRate: 0.24,
    fishIds: ['fish_bass', 'fish_tuna'],
  },
  big: {
    label: 'BIG FISH!',
    sub: 'Hang on — this is a fighter',
    color: '#ffd56e',
    pull: 0.4,
    greenHalf: 0.18,
    progressRate: 0.2,
    fishIds: ['fish_tuna', 'fish_shark'],
  },
  super: {
    label: 'SUPER FISH!!',
    sub: 'Huge catch — reel carefully!',
    color: '#ff9f43',
    pull: 0.46,
    greenHalf: 0.16,
    progressRate: 0.17,
    fishIds: ['fish_shark', 'fish_leviathan'],
  },
  monster: {
    label: 'MONSTER!!',
    sub: 'Legendary beast on the line!',
    color: '#ff6bcb',
    pull: 0.52,
    greenHalf: 0.14,
    progressRate: 0.14,
    fishIds: ['fish_leviathan'],
  },
};

export function rollFightTier() {
  const r = Math.random();
  if (r < 0.4) return 'common';
  if (r < 0.65) return 'nice';
  if (r < 0.82) return 'big';
  if (r < 0.93) return 'super';
  return 'monster';
}

export function pickFishForTier(tierKey) {
  const tier = FIGHT_TIERS[tierKey] || FIGHT_TIERS.common;
  const ids = tier.fishIds;
  const pool = FISH_TABLE.filter((f) => ids.includes(f.id));
  if (!pool.length) return FISH_TABLE[0];
  return pool[Math.floor(Math.random() * pool.length)];
}

export function skillFromTiming(accuracy) {
  return Math.max(0, Math.min(1, accuracy));
}

export function pickFish(skill) {
  const eligible = FISH_TABLE.filter((f) => skill >= f.minSkill);
  if (!eligible.length) return FISH_TABLE[0];
  const total = eligible.reduce((s, f) => s + f.weight, 0);
  let r = Math.random() * total;
  for (const f of eligible) {
    r -= f.weight;
    if (r <= 0) return f;
  }
  return eligible[eligible.length - 1];
}

export function createCastSession({ x = 0.5, y = 0.5 } = {}) {
  const tierKey = rollFightTier();
  const tier = FIGHT_TIERS[tierKey];
  const fish = pickFishForTier(tierKey);
  const biteDelay = 3500 + Math.floor(Math.random() * 4500);

  return {
    id: `cast_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    castX: Math.max(0.08, Math.min(0.92, Number(x) || 0.5)),
    castY: Math.max(0.12, Math.min(0.88, Number(y) || 0.5)),
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

export function evaluateFight(_session, { outcome, greenRatio = 0 } = {}) {
  const g = Math.max(0, Math.min(1, Number(greenRatio) || 0));
  if (outcome === 'escaped') {
    return { grade: 'fail', accuracy: 0, reason: 'escaped' };
  }
  if (outcome === 'snapped') {
    return { grade: 'fail', accuracy: 0, reason: 'snapped' };
  }
  if (outcome !== 'caught') {
    return { grade: 'fail', accuracy: 0, reason: 'unknown' };
  }
  if (g >= 0.55) return { grade: 'perfect', accuracy: g };
  if (g >= 0.3) return { grade: 'good', accuracy: g };
  return { grade: 'miss', accuracy: g };
}

export function getFishById(id) {
  return FISH_TABLE.find((f) => f.id === id) || FISH_TABLE[0];
}
