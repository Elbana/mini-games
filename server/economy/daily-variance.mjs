/**
 * Daily variance — same UTC day feels consistent per player, but swings day-to-day.
 * Baseline play stays modest; bounty / hot-market days create big-win moments.
 */

const CROP_IDS = ['carrot', 'potato', 'beans', 'corn', 'cabbage', 'berry', 'pumpkin', 'mushroom'];

export function dayKey(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

function hashSeed(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seededRng(scope, date = new Date()) {
  return mulberry32(hashSeed(`${scope}:${dayKey(date)}`));
}

/** @typedef {'bounty'|'normal'|'lean'|'stormy'} FarmDayKind */

export function getDailyFarmMood(date = new Date()) {
  const rnd = seededRng('farm-mood', date);
  const roll = rnd();
  /** @type {FarmDayKind} */
  const kind = roll < 0.22 ? 'bounty' : roll < 0.58 ? 'normal' : roll < 0.82 ? 'lean' : 'stormy';
  const hotCrop = CROP_IDS[Math.floor(rnd() * CROP_IDS.length)];

  const headlines = {
    bounty: '🌞 Bounty day — lush harvests, calm fields',
    normal: '🌤️ Steady day — reliable farming',
    lean: '🌥️ Lean day — slimmer hauls, stay sharp',
    stormy: '⛈️ Stormy day — extra blight risk',
  };

  const blightMult =
    kind === 'bounty' ? 0.3 : kind === 'normal' ? 0.65 : kind === 'lean' ? 1.15 : 1.85;

  return {
    kind,
    hotCrop,
    hotCropItem: `crop_${hotCrop}`,
    blightMult,
    headline: headlines[kind],
  };
}

/** 0 = whale crops, 1 = starter crops — cheap seeds roll bigger hauls for fun. */
function harvestGenerosity(seedPrice = 200) {
  if (seedPrice <= 600) return 1;
  if (seedPrice <= 4000) return 0.72;
  if (seedPrice <= 25000) return 0.42;
  return 0.18;
}

export function rollFarmHarvestYield({ plotIndex, seedId, baseAmount = 1, seedPrice = 200, date = new Date() }) {
  const mood = getDailyFarmMood(date);
  const rnd = mulberry32(hashSeed(`harvest:${dayKey(date)}:${plotIndex}:${seedId}`));
  const gen = harvestGenerosity(seedPrice);
  let mult = 1;

  if (seedId === mood.hotCrop) mult *= 1.25 + rnd() * 0.55;

  const r = rnd();
  const r2 = rnd();
  const moodLuck =
    mood.kind === 'bounty' ? 1.4 :
    mood.kind === 'normal' ? 1 :
    mood.kind === 'lean' ? 0.88 : 0.78;

  const megaAt = (0.035 + gen * 0.07) * moodLuck;
  const greatAt = megaAt + (0.08 + gen * 0.14);
  const goodAt = greatAt + (0.12 + gen * 0.2);

  if (r < megaAt) {
    mult *= 3 + Math.floor(r2 * 5);
  } else if (r < greatAt) {
    mult *= 2 + Math.floor(r2 * 2.5);
  } else if (r < goodAt) {
    mult *= 1.45 + r2 * 1.1;
  } else if (gen < 0.45 && r > 0.9 && mood.kind !== 'bounty') {
    mult *= 0.5;
  }

  if (gen >= 0.72 && mult < 1.5 && r2 < 0.5) mult = 1.5 + r2 * 0.8;
  if (gen >= 1 && mult < 1.85 && r2 < 0.62) mult = 1.85 + r2 * 0.9;

  let amount = Math.max(1, Math.round(baseAmount * mult));
  if (gen >= 1 && amount <= 2 && r2 > 0.35) amount += 1 + Math.floor(r2 * 2);
  if (gen >= 0.72 && amount === 1 && r2 > 0.25) amount = 2;

  const tier =
    amount >= 10 || mult >= 4.5 ? 'jackpot' :
    amount >= 5 || mult >= 2.4 ? 'great' :
    amount >= 3 || mult >= 1.45 ? 'good' :
    mult < 1 ? 'poor' : 'normal';

  return { amount, tier, hotCrop: seedId === mood.hotCrop };
}

export function getDailyMarketBrief(date = new Date()) {
  const rnd = seededRng('market-brief', date);
  const categories = ['crop', 'fish', 'candy'];
  const hotCategory = categories[Math.floor(rnd() * categories.length)];
  const items = {
    crop: CROP_IDS.map((c) => `crop_${c}`),
    fish: ['fish_sardine', 'fish_bass', 'fish_tuna', 'fish_shark', 'fish_phantom'],
    candy: ['candy_sugar', 'candy_crystal', 'candy_royal'],
  };
  const pool = items[hotCategory] || items.crop;
  const hotItem = pool[Math.floor(rnd() * pool.length)];

  const swing = 0.9 + rnd() * 0.35;
  const headlines = {
    crop: swing >= 1.12 ? '🥕 Crop prices surging today' : swing <= 0.95 ? '🥕 Crop buyers paying less' : '🥕 Mixed crop prices',
    fish: swing >= 1.12 ? '🐟 Fish market is hot' : swing <= 0.95 ? '🐟 Fish prices dipped' : '🐟 Steady fish trade',
    candy: swing >= 1.12 ? '🍬 Candy collectors paying premium' : swing <= 0.95 ? '🍬 Soft candy prices' : '🍬 Normal candy trade',
  };

  return {
    hotCategory,
    hotItem,
    categorySwing: Number(swing.toFixed(2)),
    headline: headlines[hotCategory],
  };
}

export function getDailyMarketMultiplier(category, itemId, date = new Date()) {
  const brief = getDailyMarketBrief(date);
  const rnd = mulberry32(hashSeed(`market:${category}:${itemId}:${dayKey(date)}`));
  let mult = 0.9 + rnd() * 0.38;

  if (category === brief.hotCategory) mult *= brief.categorySwing;
  if (itemId === brief.hotItem) mult *= 1.22;

  const farm = getDailyFarmMood(date);
  if (category === 'crop' && itemId === farm.hotCropItem) mult *= 1.12;

  return Math.max(0.72, Math.min(1.65, mult));
}

export function getDailyFishingMood(date = new Date()) {
  const rnd = seededRng('fish-mood', date);
  const roll = rnd();
  const kind = roll < 0.2 ? 'hot' : roll < 0.55 ? 'normal' : roll < 0.8 ? 'slow' : 'rough';

  const headlines = {
    hot: '🎣 Hot bite day — trophy fish roaming',
    normal: '🎣 Normal seas — steady catches',
    slow: '🎣 Slow day — patience pays on spikes',
    rough: '🎣 Choppy waters — lines snap easier',
  };

  return {
    kind,
    headline: headlines[kind],
    tierBoost: kind === 'hot' ? 0.18 : kind === 'normal' ? 0.06 : kind === 'slow' ? 0 : -0.05,
    misfortuneMult: kind === 'hot' ? 0.45 : kind === 'normal' ? 0.75 : kind === 'slow' ? 1 : 1.35,
    mythicMult: kind === 'hot' ? 2.2 : kind === 'normal' ? 1 : kind === 'slow' ? 0.85 : 0.7,
    doubleCatchChance: kind === 'hot' ? 0.12 : kind === 'normal' ? 0.05 : 0.02,
  };
}

export function rollFishingDoubleCatch(mood, date = new Date()) {
  const rnd = mulberry32(hashSeed(`fish-double:${dayKey(date)}`));
  return rnd() < (mood?.doubleCatchChance ?? 0.05);
}

export function getDailyCandyMood(date = new Date()) {
  const rnd = seededRng('candy-mood', date);
  const roll = rnd();
  const kind = roll < 0.22 ? 'sweet' : roll < 0.58 ? 'normal' : roll < 0.82 ? 'sour' : 'chaos';

  const headlines = {
    sweet: '🍬 Sweet day — loot drops are plump',
    normal: '🍬 Normal match day',
    sour: '🍬 Sour day — tighter rewards',
    chaos: '🍬 Chaos day — monsters hit harder',
  };

  return {
    kind,
    headline: headlines[kind],
    rewardMult: kind === 'sweet' ? 1.55 : kind === 'normal' ? 1 : kind === 'sour' ? 0.82 : 0.9,
    misfortuneMult: kind === 'sweet' ? 0.4 : kind === 'normal' ? 0.75 : kind === 'sour' ? 1 : 1.4,
    bonusBuyInChance: kind === 'sweet' ? 0.22 : 0.12,
  };
}

export function rollCandyRewardQty(tier, mood, date = new Date()) {
  const [min, max] = tier.rewardDrop;
  const rnd = mulberry32(hashSeed(`candy-reward:${dayKey(date)}:${tier.id}`));
  let qty = min + Math.floor(rnd() * (max - min + 1));
  qty = Math.max(1, Math.round(qty * (mood?.rewardMult ?? 1)));

  if (mood?.kind === 'sweet' && rnd() < 0.08) qty *= 2;
  if (mood?.kind === 'chaos' && rnd() < 0.06) qty = Math.max(1, Math.floor(qty * 0.5));

  return qty;
}
