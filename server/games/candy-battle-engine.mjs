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
  { level: 1, name: 'Gummy Slime', hp: 60, attack: [4, 8], tier: 'sugar', bonusCandyChance: 0.15 },
  { level: 2, name: 'Jelly Bat', hp: 80, attack: [5, 10], tier: 'sugar', bonusCandyChance: 0.18 },
  { level: 3, name: 'Caramel Golem', hp: 110, attack: [6, 12], tier: 'crystal', bonusCandyChance: 0.2 },
  { level: 4, name: 'Licorice Dragon', hp: 140, attack: [8, 14], tier: 'crystal', bonusCandyChance: 0.22 },
  { level: 5, name: 'Marshmallow King', hp: 180, attack: [10, 16], tier: 'royal', bonusCandyChance: 0.25 },
  { level: 6, name: 'Dark Fudge Titan', hp: 220, attack: [12, 18], tier: 'royal', bonusCandyChance: 0.28 },
];

export function monsterForLevel(level) {
  return MONSTERS.find((m) => m.level === level) || MONSTERS[MONSTERS.length - 1];
}

export function damageFromMatch(matchSize, combo = 1) {
  const base = { 3: 8, 4: 14, 5: 22, 6: 32 }[matchSize] || matchSize * 5;
  return Math.round(base * (1 + (combo - 1) * 0.25));
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
