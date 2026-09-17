import { requireGameAccess } from '../auth/operator-auth.mjs';
import { buildContext, extractPlayerId } from '../auth/player-context.mjs';
import { createWalletForOperator } from '../wallet/wallet-adapter.mjs';
import {
  CANDY_TIERS,
  MONSTERS,
  monsterForLevel,
  damageFromMatch,
  rollMonsterAttack,
  rollBonusCandies,
  rollRewardQty,
} from '../games/candy-battle-engine.mjs';
import { getPlayerData, savePlayerData, addInventory, txId } from '../store/player-store.mjs';
import { addScore } from '../economy/leaderboard.mjs';

const SLUG = 'candy-battle';

export function handleGetCandyConfig(_req, res) {
  res.json({ tiers: CANDY_TIERS, monsters: MONSTERS });
}

export function handleGetCandyState(req, res) {
  const operator = requireGameAccess(req, res, SLUG);
  if (!operator) return;
  const ctx = buildContext(operator, extractPlayerId(req));
  const session = getPlayerData(ctx);
  res.json({
    fight: session.arcade.candyBattle,
    buyInCandies: session.arcade.candyBuyIn || { sugar: 0, crystal: 0, royal: 0 },
    inventory: session.arcade.inventory,
    stats: session.arcade.stats,
  });
}

export async function handleBuyCandies(req, res) {
  const operator = requireGameAccess(req, res, SLUG);
  if (!operator) return;
  const ctx = buildContext(operator, extractPlayerId(req));
  const { tierId, packs = 1 } = req.body || {};
  const tier = CANDY_TIERS[tierId];
  if (!tier || packs < 1 || packs > 20) {
    return res.status(400).json({ error: 'Invalid pack' });
  }
  const cost = tier.buyInCost * tier.packSize * packs;
  const wallet = createWalletForOperator(operator);
  try {
    const debit = await wallet.debit(ctx, {
      amount: cost,
      game: SLUG,
      roundId: 'buy_candies',
      transactionId: txId('candy_buy'),
      reason: `Buy ${packs}x ${tier.name} pack`,
    });
    const session = getPlayerData(ctx);
    session.arcade.candyBuyIn = session.arcade.candyBuyIn || { sugar: 0, crystal: 0, royal: 0 };
    session.arcade.candyBuyIn[tierId] += tier.packSize * packs;
    savePlayerData(ctx, session);
    res.json({
      ok: true,
      balance: debit.balance,
      buyInCandies: session.arcade.candyBuyIn,
      added: tier.packSize * packs,
    });
  } catch (err) {
    res.status(400).json({ error: err.message, code: err.code });
  }
}

export async function handleStartFight(req, res) {
  const operator = requireGameAccess(req, res, SLUG);
  if (!operator) return;
  const ctx = buildContext(operator, extractPlayerId(req));
  const { level = 1, tierId = 'sugar' } = req.body || {};
  const monster = monsterForLevel(level);
  const tier = CANDY_TIERS[tierId];
  if (!tier || monster.tier !== tierId && level > 2) {
    /* allow lower tier on early levels */
  }
  if (monster.tier !== tierId && level >= 3) {
    return res.status(400).json({ error: 'Tier too weak for this monster' });
  }
  const session = getPlayerData(ctx);
  const buyIn = session.arcade.candyBuyIn?.[tierId] || 0;
  if (buyIn < 3) {
    return res.status(400).json({ error: 'Need more buy-in candies', needTier: tierId });
  }
  session.arcade.candyBattle = {
    level,
    tierId,
    monsterHp: monster.hp,
    monsterMaxHp: monster.hp,
    playerHp: 100,
    playerMaxHp: 100,
    combo: 0,
    rounds: 0,
    monsterName: monster.name,
    active: true,
  };
  savePlayerData(ctx, session);
  res.json({ fight: session.arcade.candyBattle, monster });
}

/** One swap turn — consumes 1 buy-in candy, applies all cascade waves, monster counter-attacks once. */
export async function handleCandyTurn(req, res) {
  const operator = requireGameAccess(req, res, SLUG);
  if (!operator) return;
  const ctx = buildContext(operator, extractPlayerId(req));
  const { waves = [] } = req.body || {};
  if (!Array.isArray(waves) || waves.length < 1 || waves.length > 40) {
    return res.status(400).json({ error: 'Invalid turn' });
  }
  const session = getPlayerData(ctx);
  const fight = session.arcade.candyBattle;
  if (!fight?.active) {
    return res.status(400).json({ error: 'No active fight' });
  }
  const tierId = fight.tierId;
  const buyIn = session.arcade.candyBuyIn?.[tierId] || 0;
  if (buyIn < 1) {
    fight.active = false;
    savePlayerData(ctx, session);
    return res.json({ fight, ended: true, reason: 'out_of_candies', won: false });
  }
  session.arcade.candyBuyIn[tierId] -= 1;

  const monster = monsterForLevel(fight.level);
  let totalDamage = 0;
  const waveDamage = [];
  let combo = 0;

  let buyinGained = 0;

  for (const w of waves) {
    const size = Math.min(36, Math.max(3, Number(w.size) || 3));
    combo = Math.min(20, Math.max(combo + 1, Number(w.combo) || 1));
    let dmg = damageFromMatch(size >= 5 ? 5 : size >= 4 ? 4 : 3, combo);
    if (w.effect === 'colorWipe') dmg += Math.min(80, Number(w.bonusDmg) || 0);
    if (w.effect === 'buyin') {
      buyinGained += 2 + Math.min(3, size - 3);
    }
    waveDamage.push(dmg);
    totalDamage += dmg;
  }

  if (buyinGained > 0) {
    session.arcade.candyBuyIn[tierId] = (session.arcade.candyBuyIn[tierId] || 0) + buyinGained;
  }

  fight.monsterHp = Math.max(0, fight.monsterHp - totalDamage);
  fight.rounds += 1;
  fight.combo = combo;

  let won = false;
  let lost = false;
  let bonusCandies = 0;
  let monsterAttack = 0;
  let rewards = [];

  if (fight.monsterHp <= 0) {
    won = true;
    fight.active = false;
    const tier = CANDY_TIERS[tierId];
    const qty = rollRewardQty(tier);
    addInventory(session, tier.rewardItem, qty);
    rewards.push({ itemId: tier.rewardItem, qty });
    session.arcade.stats.candyWins += 1;
    addScore(SLUG, ctx.playerId, ctx.playerId, qty * 20, { win: true });
  } else {
    monsterAttack = rollMonsterAttack(monster);
    fight.playerHp = Math.max(0, fight.playerHp - monsterAttack);
    bonusCandies = rollBonusCandies(monster);
    if (bonusCandies > 0) session.arcade.candyBuyIn[tierId] += bonusCandies;
    if (fight.playerHp <= 0) {
      lost = true;
      fight.active = false;
    }
  }

  savePlayerData(ctx, session);
  res.json({
    fight,
    totalDamage,
    waveDamage,
    waveCount: waves.length,
    monsterAttack,
    bonusCandies,
    rewards,
    won,
    lost,
    buyInCandies: session.arcade.candyBuyIn,
    buyinGained,
  });
}

export async function handleCandyMatch(req, res) {
  const operator = requireGameAccess(req, res, SLUG);
  if (!operator) return;
  const ctx = buildContext(operator, extractPlayerId(req));
  const { matchSize = 3, combo = 1 } = req.body || {};
  if (matchSize < 3 || matchSize > 6) {
    return res.status(400).json({ error: 'Invalid match' });
  }
  const session = getPlayerData(ctx);
  const fight = session.arcade.candyBattle;
  if (!fight?.active) {
    return res.status(400).json({ error: 'No active fight' });
  }
  const tierId = fight.tierId;
  const buyIn = session.arcade.candyBuyIn?.[tierId] || 0;
  if (buyIn < 1) {
    fight.active = false;
    savePlayerData(ctx, session);
    return res.json({ fight, ended: true, reason: 'out_of_candies', won: false });
  }
  session.arcade.candyBuyIn[tierId] -= 1;
  const monster = monsterForLevel(fight.level);
  const dmg = damageFromMatch(matchSize, combo);
  fight.monsterHp = Math.max(0, fight.monsterHp - dmg);
  fight.rounds += 1;
  fight.combo = combo;

  let won = false;
  let lost = false;
  let bonusCandies = 0;
  let monsterAttack = 0;
  let rewards = [];

  if (fight.monsterHp <= 0) {
    won = true;
    fight.active = false;
    const tier = CANDY_TIERS[tierId];
    const qty = rollRewardQty(tier);
    addInventory(session, tier.rewardItem, qty);
    rewards.push({ itemId: tier.rewardItem, qty });
    session.arcade.stats.candyWins += 1;
    addScore(SLUG, ctx.playerId, ctx.playerId, qty * 20, { win: true });
  } else {
    monsterAttack = rollMonsterAttack(monster);
    fight.playerHp = Math.max(0, fight.playerHp - monsterAttack);
    bonusCandies = rollBonusCandies(monster);
    if (bonusCandies > 0) {
      session.arcade.candyBuyIn[tierId] += bonusCandies;
    }
    if (fight.playerHp <= 0) {
      lost = true;
      fight.active = false;
    }
  }

  savePlayerData(ctx, session);
  res.json({
    fight,
    damage: dmg,
    monsterAttack,
    bonusCandies,
    rewards,
    won,
    lost,
    buyInCandies: session.arcade.candyBuyIn,
  });
}

export function handleAbandonFight(req, res) {
  const operator = requireGameAccess(req, res, SLUG);
  if (!operator) return;
  const ctx = buildContext(operator, extractPlayerId(req));
  const session = getPlayerData(ctx);
  session.arcade.candyBattle = null;
  savePlayerData(ctx, session);
  res.json({ ok: true });
}
