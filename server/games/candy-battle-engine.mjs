/** Candy buy-in tiers and monster scaling */

export const CANDY_TIERS = {
  sugar: {
    id: 'sugar',
    name: 'Sugar Candy',
    buyInCost: 8,
    packSize: 25,
    rewardItem: 'candy_sugar',
    rewardDrop: [2, 5],
    color: '#ff6bcb',
  },
  crystal: {
    id: 'crystal',
    name: 'Crystal Candy',
    buyInCost: 40,
    packSize: 20,
    rewardItem: 'candy_crystal',
    rewardDrop: [1, 4],
    color: '#6ecbff',
  },
  royal: {
    id: 'royal',
    name: 'Royal Candy',
    buyInCost: 150,
    packSize: 15,
    rewardItem: 'candy_royal',
    rewardDrop: [1, 3],
    color: '#ffd56e',
  },
};

export const MONSTERS = [
  { level: 1, name: 'Gummy Slime', hp: 220, attack: [8, 14], tier: 'sugar', bonusCandyChance: 0.12 },
  { level: 2, name: 'Jelly Bat', hp: 300, attack: [10, 16], tier: 'sugar', bonusCandyChance: 0.14 },
  { level: 3, name: 'Caramel Golem', hp: 400, attack: [12, 18], tier: 'crystal', bonusCandyChance: 0.16 },
  { level: 4, name: 'Licorice Dragon', hp: 520, attack: [14, 22], tier: 'crystal', bonusCandyChance: 0.18 },
  { level: 5, name: 'Marshmallow King', hp: 650, attack: [16, 24], tier: 'royal', bonusCandyChance: 0.2 },
  { level: 6, name: 'Dark Fudge Titan', hp: 800, attack: [18, 28], tier: 'royal', bonusCandyChance: 0.22 },
];

export function monsterForLevel(level) {
  return MONSTERS.find((m) => m.level === level) || MONSTERS[MONSTERS.length - 1];
}

export const SEASON_LENGTH = 6;
/** Shield keeps this share of the hit. The rest still lands. */
export const SHIELD_KEEP = 0.5;

export const TOOLS = [
  { id: 'bandage', name: 'Bandage', icon: '🩹', packSize: 4, basePrice: 10 },
  { id: 'shield', name: 'Shield', icon: '🛡️', packSize: 3, basePrice: 14 },
  { id: 'charge', name: 'Charge', icon: '⚡', packSize: 3, basePrice: 18 },
];

const LEVEL_PRICE = [0, 1, 1.5, 2.2, 3.4, 5, 7.5];
const BASE_MONSTER_HP = [0, 90, 105, 120, 140, 160, 185];
const BASE_PLAYER_HP = [0, 70, 74, 78, 82, 86, 90];
const MOOD_HP = { fair: 1, tough: 1.4, fierce: 2 };
const MOOD_ATK = { fair: 1, tough: 1.22, fierce: 1.55 };

export function toolById(id) {
  return TOOLS.find((t) => t.id === id) || null;
}

export function toolPrice(tool, level) {
  const lv = Math.min(6, Math.max(1, Number(level) || 1));
  return Math.max(1, Math.round(tool.basePrice * LEVEL_PRICE[lv]));
}

export function rollFightMood() {
  const r = Math.random();
  if (r < 0.48) return 'fair';
  if (r < 0.82) return 'tough';
  return 'fierce';
}

export function buildFight(level) {
  const monster = monsterForLevel(level);
  const mood = rollFightMood();
  const lv = monster.level;
  const monsterHp = Math.round(BASE_MONSTER_HP[lv] * MOOD_HP[mood]);
  const playerHp = BASE_PLAYER_HP[lv];
  return {
    level: lv,
    mood,
    attackScale: MOOD_ATK[mood],
    tierId: monster.tier,
    monsterHp,
    monsterMaxHp: monsterHp,
    playerHp,
    playerMaxHp: playerHp,
    combo: 0,
    rounds: 0,
    monsterName: monster.name,
    toolsUsed: 0,
    shield: false,
    charge: false,
    active: true,
  };
}

export function applyTool(fight, toolId) {
  if (!fight?.active) return { error: 'No active fight' };
  if (toolId === 'bandage') {
    if (fight.playerHp >= fight.playerMaxHp) return { error: 'Health is already full' };
    const heal = Math.max(18, Math.round(fight.playerMaxHp * 0.34));
    fight.playerHp = Math.min(fight.playerMaxHp, fight.playerHp + heal);
    return { heal };
  }
  if (toolId === 'shield') {
    if (fight.shield) return { error: 'Shield is already up' };
    fight.shield = true;
    return { shield: true };
  }
  if (toolId === 'charge') {
    if (fight.charge) return { error: 'Charge is already ready' };
    fight.charge = true;
    return { charge: true };
  }
  return { error: 'Unknown tool' };
}

export function damageFromMatch(matchSize, combo = 1) {
  const base = { 3: 4, 4: 7, 5: 12, 6: 18 }[matchSize] || matchSize * 3;
  return Math.round(base * (1 + (combo - 1) * 0.12));
}

export function softenHit(fight, attack) {
  if (!fight?.shield || attack <= 0) return { attack, soaked: 0 };
  fight.shield = false;
  const taken = Math.max(1, Math.round(attack * SHIELD_KEEP));
  return { attack: taken, soaked: attack - taken };
}

export function rollMonsterAttack(monster) {
  const [min, max] = monster.attack;
  return min + Math.floor(Math.random() * (max - min + 1));
}

export function rollBonusCandies(monster) {
  if (Math.random() > monster.bonusCandyChance) return 0;
  return 1 + Math.floor(Math.random() * 3);
}

export function rollRewardQty(tier) {
  const [min, max] = tier.rewardDrop;
  return min + Math.floor(Math.random() * (max - min + 1));
}
