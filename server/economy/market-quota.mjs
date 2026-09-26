import { dayKey } from './daily-variance.mjs';
import { cropFloorUnitPrice } from './unfair-loss.mjs';
import { SEEDS } from '../games/fast-farm-engine.mjs';

/** Premium-priced units per player per UTC day, then floor (break-even) pricing. */
export const DAILY_PREMIUM_LIMITS = {
  crop: 50,
  fish: 20,
  candy: 30,
};

export function seedPriceForCropItem(itemId) {
  const seedId = itemId.replace(/^crop_/, '');
  return SEEDS[seedId]?.price ?? 0;
}

export function ensureMarketDaily(session) {
  const key = dayKey();
  if (!session.arcade.marketDaily || session.arcade.marketDaily.dayKey !== key) {
    session.arcade.marketDaily = {
      dayKey: key,
      premiumUnits: { crop: 0, fish: 0, candy: 0 },
    };
  }
  return session.arcade.marketDaily;
}

export function getPremiumRemaining(session, category) {
  const daily = ensureMarketDaily(session);
  const limit = DAILY_PREMIUM_LIMITS[category] || 0;
  const used = daily.premiumUnits[category] || 0;
  return Math.max(0, limit - used);
}

export function getPremiumQuotaSummary(session) {
  ensureMarketDaily(session);
  const daily = session.arcade.marketDaily;
  return {
    crop: {
      used: daily.premiumUnits.crop || 0,
      limit: DAILY_PREMIUM_LIMITS.crop,
      remaining: getPremiumRemaining(session, 'crop'),
    },
    fish: {
      used: daily.premiumUnits.fish || 0,
      limit: DAILY_PREMIUM_LIMITS.fish,
      remaining: getPremiumRemaining(session, 'fish'),
    },
    candy: {
      used: daily.premiumUnits.candy || 0,
      limit: DAILY_PREMIUM_LIMITS.candy,
      remaining: getPremiumRemaining(session, 'candy'),
    },
  };
}

/**
 * Split a sale into premium (good price) and floor (break-even) units.
 * @param {number} premiumUnit live premium price per unit
 * @param {number} floorUnit break-even price per unit
 */
export function splitPremiumSale(session, category, qty, premiumUnit, floorUnit) {
  ensureMarketDaily(session);
  const remaining = getPremiumRemaining(session, category);
  const premiumQty = Math.min(qty, remaining);
  const floorQty = qty - premiumQty;
  session.arcade.marketDaily.premiumUnits[category] =
    (session.arcade.marketDaily.premiumUnits[category] || 0) + premiumQty;
  const total = premiumQty * premiumUnit + floorQty * floorUnit;
  const unitPrice = qty > 0 ? Math.round(total / qty) : premiumUnit;
  return { total, unitPrice, premiumQty, floorQty, premiumUnit, floorUnit };
}

/** Quote a sell using live premium price and per-player daily quota. */
export function quoteSell(session, item, qty, livePremiumPrice) {
  const category = item.category;
  let floor = livePremiumPrice;
  if (category === 'crop') {
    floor = item.floorPrice ?? cropFloorUnitPrice(seedPriceForCropItem(item.id));
  } else {
    floor = Math.max(1, Math.round(item.basePrice * 0.72));
  }
  const premium = Math.max(floor, livePremiumPrice);
  return splitPremiumSale(session, category, qty, premium, floor);
}
