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

export function damageFromMatch(matchSize, combo = 1) {
  const base = { 3: 4, 4: 7, 5: 12, 6: 18 }[matchSize] || matchSize * 3;
  return Math.round(base * (1 + (combo - 1) * 0.12));
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
