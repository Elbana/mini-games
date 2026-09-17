/** Fishing callouts — candy-battle-style hype words by bite tier */

export const BITE_TIERS = {
  common: {
    words: ['FISH!', 'BITE!', 'NIBBLE!'],
    color: '#6ecbff',
    glow: '#0284c7',
  },
  nice: {
    words: ['NICE FISH!', 'GOOD CATCH!', 'TASTY!'],
    color: '#93e6c8',
    glow: '#059669',
  },
  big: {
    words: ['BIG FISH!', 'WHOPPER!', 'FIGHTER!'],
    color: '#ffd56e',
    glow: '#d97706',
  },
  super: {
    words: ['SUPER FISH!', 'HUGE!', 'MASSIVE!'],
    color: '#ff9f43',
    glow: '#ea580c',
  },
  monster: {
    words: ['MONSTER!', 'LEGENDARY!', 'BEAST!'],
    color: '#ff6bcb',
    glow: '#c026d3',
  },
};

export const CATCH_WORDS = {
  common: ['CAUGHT!', 'NICE!'],
  nice: ['NICE CATCH!', 'GOOD ONE!'],
  big: ['BIG CATCH!', 'WHOPPER!'],
  super: ['SUPER CATCH!', 'INCREDIBLE!'],
  monster: ['LEGENDARY!', 'MONSTER CAUGHT!'],
};

export function biteCallout(tierKey) {
  const tier = BITE_TIERS[tierKey] || BITE_TIERS.common;
  const word = tier.words[Math.floor(Math.random() * tier.words.length)];
  return { word, color: tier.color, glow: tier.glow };
}

export function fightCallout(progress) {
  let pick = null;
  for (const step of FIGHT_WORDS) {
    if (progress >= step.at) pick = step;
  }
  if (!pick) return null;
  return pick.words[Math.floor(Math.random() * pick.words.length)];
}

export function catchCallout(tierKey) {
  const words = CATCH_WORDS[tierKey] || CATCH_WORDS.common;
  return words[Math.floor(Math.random() * words.length)];
}
