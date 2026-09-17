const TIERS = [
  { min: 1, words: ['SWEET!', 'NICE!'] },
  { min: 2, words: ['TASTY!', 'GOOD!'] },
  { min: 3, words: ['DELICIOUS!', 'WOW!'] },
  { min: 4, words: ['SUPER!', 'GREAT!'] },
  { min: 5, words: ['AMAZING!', 'AWESOME!'] },
  { min: 6, words: ['INCREDIBLE!', 'UNSTOPPABLE!'] },
  { min: 8, words: ['LEGENDARY!', 'GODLIKE!'] },
];

export function comboWord(combo, matchSize = 3) {
  const score = combo + (matchSize >= 5 ? 2 : matchSize >= 4 ? 1 : 0);
  let pick = TIERS[0];
  for (const t of TIERS) {
    if (score >= t.min) pick = t;
  }
  return pick.words[Math.floor(Math.random() * pick.words.length)];
}
