/**
 * Unfair / random losses — anti-automation, keeps EV near break-even.
 * Perfect play still loses sometimes; big wins stay rare (market + luck).
 */

/** Farm: sudden blight after a care action (player did everything right). */
export const FARM_BLIGHT_AFTER_CARE = 0.007;

/** Farm: sudden blight while crop looks healthy (checked every BLIGHT_TICK_MS). */
export const FARM_BLIGHT_TICK = 0.0025;
export const FARM_BLIGHT_TICK_MS = 14000;

/** Fishing: line snaps after a good reel. */
export const FISH_LINE_SNAP = 0.045;

/** Fishing: fish escapes at the last second (even on perfect). */
export const FISH_ESCAPE = 0.03;

/** Candy: monster rage — extra damage multiplier range. */
export const CANDY_RAGE_CHANCE = 0.04;
export const CANDY_RAGE_MULT = [1.6, 2.2];

/** Candy: instant frenzy loss (very rare). */
export const CANDY_FRENZY_CHANCE = 0.012;

export function rollFarmBlightAfterCare(blightMult = 1) {
  if (Math.random() >= FARM_BLIGHT_AFTER_CARE * blightMult) return null;
  return { type: 'blight', message: 'Sudden blight! The crop withered.' };
}

export function rollFarmBlightTick(plot, now = Date.now(), blightMult = 1) {
  if (!plot?.seed_id || plot.state === 'dead' || plot.state === 'ready' || plot.state === 'empty') {
    return null;
  }
  const last = plot.last_unfair_check
    ? new Date(plot.last_unfair_check).getTime()
    : new Date(plot.planted_at || now).getTime();
  if (now - last < FARM_BLIGHT_TICK_MS) return null;
  if (Math.random() >= FARM_BLIGHT_TICK * blightMult) return null;
  return { type: 'blight', message: 'A storm hit this plot.' };
}

export function rollFishingMisfortune(reelResult, misfortuneMult = 1) {
  if (reelResult?.grade === 'fail') return null;
  const mult = Math.max(0.2, misfortuneMult);
  if (Math.random() < FISH_LINE_SNAP * mult) {
    return { type: 'line_snap', message: 'Your line snapped!' };
  }
  if (Math.random() < FISH_ESCAPE * mult) {
    return { type: 'escape', message: 'The fish slipped away at the last second!' };
  }
  return null;
}

export function rollCandyMisfortune(misfortuneMult = 1) {
  const mult = Math.max(0.15, misfortuneMult);
  if (Math.random() < CANDY_FRENZY_CHANCE * mult) {
    return { type: 'frenzy', message: 'The monster flew into a frenzy!', instantLoss: true };
  }
  if (Math.random() < CANDY_RAGE_CHANCE * mult) {
    const [lo, hi] = CANDY_RAGE_MULT;
    const rageMult = lo + Math.random() * (hi - lo);
    return { type: 'rage', message: 'The monster got angry!', multiplier: rageMult };
  }
  return null;
}

/** Typical harvest size used for per-unit market pricing. */
export const AVG_CROP_YIELD = 5.5;

/** Break-even coin price per crop unit after seed + care (quota exhausted). */
export function cropFloorUnitPrice(seedPrice) {
  const care = cropFertilizeCost(seedPrice) + Math.round(cropHealCost(seedPrice) * 0.35);
  return Math.max(1, Math.round((seedPrice + care) / AVG_CROP_YIELD));
}

/** Opening-of-day price per crop unit — rewarding haul at low market volume. */
export function cropPremiumUnitPrice(seedPrice) {
  const floor = cropFloorUnitPrice(seedPrice);
  return Math.max(floor + 1, Math.round(floor * 1.45));
}

/** Shown in farm UI as expected sell price per crop unit. */
export function cropMarketBase(seedPrice) {
  return cropPremiumUnitPrice(seedPrice);
}

export function cropFertilizeCost(seedPrice) {
  return Math.max(15, Math.round(seedPrice * 0.07));
}

export function cropHealCost(seedPrice) {
  return Math.max(25, Math.round(seedPrice * 0.11));
}
