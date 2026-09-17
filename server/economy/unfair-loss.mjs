/**
 * Unfair / random losses — anti-automation, keeps EV near break-even.
 * Perfect play still loses sometimes; big wins stay rare (market + luck).
 */

/** Farm: sudden blight after a care action (player did everything right). */
export const FARM_BLIGHT_AFTER_CARE = 0.022;

/** Farm: sudden blight while crop looks healthy (checked every BLIGHT_TICK_MS). */
export const FARM_BLIGHT_TICK = 0.009;
export const FARM_BLIGHT_TICK_MS = 9000;

/** Fishing: line snaps after a good reel. */
export const FISH_LINE_SNAP = 0.06;

/** Fishing: fish escapes at the last second (even on perfect). */
export const FISH_ESCAPE = 0.04;

/** Candy: monster rage — extra damage multiplier range. */
export const CANDY_RAGE_CHANCE = 0.05;
export const CANDY_RAGE_MULT = [1.8, 2.6];

/** Candy: instant frenzy loss (very rare). */
export const CANDY_FRENZY_CHANCE = 0.018;

export function rollFarmBlightAfterCare() {
  if (Math.random() >= FARM_BLIGHT_AFTER_CARE) return null;
  return { type: 'blight', message: 'Sudden blight! The crop withered for no reason.' };
}

export function rollFarmBlightTick(plot, now = Date.now()) {
  if (!plot?.seed_id || plot.state === 'dead' || plot.state === 'ready' || plot.state === 'empty') {
    return null;
  }
  const last = plot.last_unfair_check
    ? new Date(plot.last_unfair_check).getTime()
    : new Date(plot.planted_at || now).getTime();
  if (now - last < FARM_BLIGHT_TICK_MS) return null;
  if (Math.random() >= FARM_BLIGHT_TICK) return null;
  return { type: 'blight', message: 'A storm hit this plot — nothing you could do.' };
}

export function rollFishingMisfortune(reelResult) {
  if (reelResult?.grade === 'fail') return null;
  if (Math.random() < FISH_LINE_SNAP) {
    return { type: 'line_snap', message: 'Your line snapped!' };
  }
  if (Math.random() < FISH_ESCAPE) {
    return { type: 'escape', message: 'The fish slipped away at the last second!' };
  }
  return null;
}

export function rollCandyMisfortune() {
  if (Math.random() < CANDY_FRENZY_CHANCE) {
    return { type: 'frenzy', message: 'The monster flew into a frenzy!', instantLoss: true };
  }
  if (Math.random() < CANDY_RAGE_CHANCE) {
    const [lo, hi] = CANDY_RAGE_MULT;
    const mult = lo + Math.random() * (hi - lo);
    return { type: 'rage', message: 'The monster got angry!', multiplier: mult };
  }
  return null;
}

/** Market sell target ≈ seed + care + small margin (losses eat the margin). */
export function cropMarketBase(seedPrice) {
  return Math.round(seedPrice * 1.52);
}

export function cropFertilizeCost(seedPrice) {
  return Math.max(15, Math.round(seedPrice * 0.07));
}

export function cropHealCost(seedPrice) {
  return Math.max(25, Math.round(seedPrice * 0.11));
}
