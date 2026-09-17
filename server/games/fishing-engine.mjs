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

export function skillFromTiming(accuracy) {
  const a = Math.max(0, Math.min(1, accuracy));
  return a;
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

export function createCastSession() {
  const targetCenter = 0.15 + Math.random() * 0.7;
  const targetWidth = 0.08 + Math.random() * 0.12;
  return {
    id: `cast_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    targetCenter,
    targetWidth,
    expiresAt: Date.now() + 15000,
  };
}

export function evaluateReel(session, pointer) {
  const half = session.targetWidth / 2;
  const dist = Math.abs(pointer - session.targetCenter);
  if (dist <= half * 0.4) return { grade: 'perfect', accuracy: 1 - dist / half };
  if (dist <= half) return { grade: 'good', accuracy: 1 - dist / (half * 1.5) };
  if (dist <= half * 2) return { grade: 'miss', accuracy: Math.max(0, 0.3 - dist) };
  return { grade: 'fail', accuracy: 0 };
}
