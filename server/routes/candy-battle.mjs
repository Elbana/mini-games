import { requireGameAccess } from '../auth/operator-auth.mjs';
import { buildContext, extractPlayerId } from '../auth/player-context.mjs';
import { createWalletForOperator } from '../wallet/wallet-adapter.mjs';
import {
  CANDY_TIERS,
  MONSTERS,
  TOOLS,
  SEASON_LENGTH,
  monsterForLevel,
  toolById,
  toolPrice,
  buildFight,
  applyTool,
  damageFromMatch,
  rollMonsterAttack,
  softenHit,
} from '../games/candy-battle-engine.mjs';
import { getPlayerData, savePlayerData, addInventory, txId } from '../store/player-store.mjs';
import { addScore } from '../economy/leaderboard.mjs';
import { rollCandyMisfortune } from '../economy/unfair-loss.mjs';
import { getDailyCandyMood, rollCandyRewardQty } from '../economy/daily-variance.mjs';

const SLUG = 'candy-battle';

export function handleGetCandyConfig(_req, res) {
  res.json({
    tiers: CANDY_TIERS,
    levels: MONSTERS.map((m) => ({
      level: m.level,
      name: m.name,
      tier: m.tier,
      candyName: CANDY_TIERS[m.tier].name,
      tools: TOOLS.map((t) => ({
        id: t.id,
        name: t.name,
        icon: t.icon,
        packSize: t.packSize,
        price: toolPrice(t, m.level),
      })),
    })),
    tools: TOOLS,
    seasonLength: SEASON_LENGTH,
    monsters: MONSTERS,
    dailyMood: getDailyCandyMood(),
  });
}

export function handleGetCandyState(req, res) {
  const operator = requireGameAccess(req, res, SLUG);
  if (!operator) return;
  const ctx = buildContext(operator, extractPlayerId(req));
  const session = getPlayerData(ctx);
  res.json({
    fight: session.arcade.candyBattle,
    tools: ensureToolStock(session),
    season: ensureSeason(session),
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
  const level = levelFromBody(req.body);
  const session = getPlayerData(ctx);
  if (session.arcade.candyBattle?.active) {
    return res.status(400).json({ error: 'Fight already running' });
  }
  session.arcade.candyBattle = buildFight(level);
  const season = ensureSeason(session);
  season.level = level;
  savePlayerData(ctx, session);
  res.json({
    fight: session.arcade.candyBattle,
    monster: monsterForLevel(level),
    season,
    tools: ensureToolStock(session),
  });
}

export async function handleBuyTool(req, res) {
  const operator = requireGameAccess(req, res, SLUG);
  if (!operator) return;
  const ctx = buildContext(operator, extractPlayerId(req));
  const tool = toolById(req.body?.toolId);
  const level = levelFromBody(req.body);
  if (!tool) return res.status(400).json({ error: 'Unknown tool' });
  const price = toolPrice(tool, level);
  const session = getPlayerData(ctx);
  const wallet = createWalletForOperator(operator);
  try {
    const debit = await wallet.debit(ctx, {
      amount: price,
      game: SLUG,
      roundId: `candy_tool_${tool.id}`,
      transactionId: txId('candy_tool'),
      reason: `${tool.name} pack`,
    });
    session.balance = debit.balance;
    const stock = ensureToolStock(session);
    stock[tool.id] += tool.packSize;
    savePlayerData(ctx, session);
    res.json({ ok: true, tools: stock, balance: debit.balance, price, added: tool.packSize });
  } catch (err) {
    const needsCoins = err.code === 'INSUFFICIENT_BALANCE';
    res.status(400).json({
      error: needsCoins ? `Need ${price} coins for ${tool.name}` : err.message,
      code: err.code,
    });
  }
}

export async function handleUseTool(req, res) {
  const operator = requireGameAccess(req, res, SLUG);
  if (!operator) return;
  const ctx = buildContext(operator, extractPlayerId(req));
  const tool = toolById(req.body?.toolId);
  if (!tool) return res.status(400).json({ error: 'Unknown tool' });
  const session = getPlayerData(ctx);
  const fight = session.arcade.candyBattle;
  if (!fight?.active) return res.status(400).json({ error: 'No active fight' });
  const preview = applyTool({ ...fight }, tool.id);
  if (preview.error) return res.status(400).json({ error: preview.error });
  const price = toolPrice(tool, fight.level);
  const wallet = createWalletForOperator(operator);
  let debit;
  try {
    debit = await wallet.debit(ctx, {
      amount: price,
      game: SLUG,
      roundId: `candy_tool_${tool.id}`,
      transactionId: txId('candy_tool'),
      reason: tool.name,
    });
  } catch (err) {
    const needsCoins = err.code === 'INSUFFICIENT_BALANCE';
    return res.status(400).json({
      error: needsCoins ? `Need ${price} coins` : err.message,
      code: err.code,
    });
  }
  const used = applyTool(fight, tool.id);
  session.balance = debit.balance;
  savePlayerData(ctx, session);
  res.json({ fight, used, price, balance: debit.balance });
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
  const monster = monsterForLevel(fight.level);
  let totalDamage = 0;
  const waveDamage = [];
  let combo = 0;

  for (const w of waves) {
    const size = Math.min(36, Math.max(3, Number(w.size) || 3));
    combo = Math.min(20, Math.max(combo + 1, Number(w.combo) || 1));
    let dmg = damageFromMatch(size >= 5 ? 5 : size >= 4 ? 4 : 3, combo);
    if (w.effect === 'colorWipe') dmg += Math.min(22, Number(w.bonusDmg) || 0);
    waveDamage.push(dmg);
    totalDamage += dmg;
  }

  if (fight.charge) {
    totalDamage = Math.round(totalDamage * 1.65);
    fight.charge = false;
  }

  fight.monsterHp = Math.max(0, fight.monsterHp - totalDamage);
  fight.rounds += 1;
  fight.combo = combo;

  const candyMood = getDailyCandyMood();

  if (fight.monsterHp <= 0) {
    const loot = grantRoundLoot(session, ctx, fight, candyMood);
    const settled = noteFightEnd(session, true, loot);
    savePlayerData(ctx, session);
    return res.json({
      fight,
      totalDamage,
      waveDamage,
      waveCount: waves.length,
      monsterAttack: 0,
      loot,
      season: settled.season,
      checkpoint: settled.checkpoint,
      won: true,
      lost: false,
      misfortune: null,
    });
  }

  const misfortune = rollCandyMisfortune(candyMood.misfortuneMult);
  let monsterAttack = 0;
  let shieldSoak = 0;
  if (misfortune?.instantLoss) {
    fight.playerHp = 0;
  } else {
    monsterAttack = Math.round(rollMonsterAttack(monster) * (fight.attackScale || 1));
    if (misfortune?.multiplier) monsterAttack = Math.round(monsterAttack * misfortune.multiplier);
    const softened = softenHit(fight, monsterAttack);
    monsterAttack = softened.attack;
    shieldSoak = softened.soaked;
    fight.playerHp = Math.max(0, fight.playerHp - monsterAttack);
  }
  const lost = fight.playerHp <= 0;
  let settled = null;
  if (lost) settled = noteFightEnd(session, false, null);
  savePlayerData(ctx, session);
  return res.json({
    fight,
    totalDamage,
    waveDamage,
    waveCount: waves.length,
    monsterAttack,
    shieldSoak,
    season: settled?.season || ensureSeason(session),
    checkpoint: settled?.checkpoint || null,
    won: false,
    lost,
    misfortune,
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
  const monster = monsterForLevel(fight.level);
  let dmg = damageFromMatch(matchSize, combo);
  if (fight.charge) {
    dmg = Math.round(dmg * 1.65);
    fight.charge = false;
  }
  fight.monsterHp = Math.max(0, fight.monsterHp - dmg);
  fight.rounds += 1;
  fight.combo = combo;
  const candyMood = getDailyCandyMood();

  if (fight.monsterHp <= 0) {
    const loot = grantRoundLoot(session, ctx, fight, candyMood);
    const settled = noteFightEnd(session, true, loot);
    savePlayerData(ctx, session);
    return res.json({
      fight,
      damage: dmg,
      monsterAttack: 0,
      loot,
      season: settled.season,
      checkpoint: settled.checkpoint,
      won: true,
      lost: false,
    });
  }

  let monsterAttack = Math.round(rollMonsterAttack(monster) * (fight.attackScale || 1));
  const softened = softenHit(fight, monsterAttack);
  monsterAttack = softened.attack;
  const shieldSoak = softened.soaked;
  fight.playerHp = Math.max(0, fight.playerHp - monsterAttack);
  const lost = fight.playerHp <= 0;
  const settled = lost ? noteFightEnd(session, false, null) : null;
  savePlayerData(ctx, session);
  res.json({
    fight,
    damage: dmg,
    monsterAttack,
    shieldSoak,
    season: settled?.season || ensureSeason(session),
    checkpoint: settled?.checkpoint || null,
    won: false,
    lost,
  });
}

function grantRoundLoot(session, ctx, fight, mood) {
  const monster = monsterForLevel(fight.level);
  const tier = CANDY_TIERS[monster.tier] || CANDY_TIERS.sugar;
  const extra = fight.level % 2 === 0 ? 1 : 0;
  const qty = rollCandyRewardQty(tier, mood) + extra;
  addInventory(session, tier.rewardItem, qty);
  session.arcade.stats.candyWins += 1;
  addScore(SLUG, ctx.playerId, ctx.playerId, qty * 20, { win: true });
  return { itemId: tier.rewardItem, name: tier.name, qty };
}

function levelFromBody(body) {
  const n = Number(body?.level);
  if (n >= 1 && n <= 6) return Math.round(n);
  if (body?.difficulty === 'sticky') return 3;
  if (body?.difficulty === 'legend') return 6;
  return 1;
}

function ensureToolStock(session) {
  session.arcade.candyTools = session.arcade.candyTools || { bandage: 0, shield: 0, charge: 0 };
  return session.arcade.candyTools;
}

function ensureSeason(session) {
  if (!session.arcade.candySeason) {
    session.arcade.candySeason = {
      number: 1,
      level: 1,
      fights: 0,
      wins: 0,
      losses: 0,
      haul: {},
      stretchFights: 0,
      stretchWins: 0,
      stretchLosses: 0,
      stretchHaul: {},
    };
  }
  return session.arcade.candySeason;
}

function noteFightEnd(session, won, loot) {
  const season = ensureSeason(session);
  const fight = session.arcade.candyBattle;
  if (fight) fight.active = false;
  season.fights += 1;
  season.stretchFights += 1;
  if (won) {
    season.wins += 1;
    season.stretchWins += 1;
    if (loot) {
      season.haul[loot.itemId] = (season.haul[loot.itemId] || 0) + loot.qty;
      season.stretchHaul[loot.itemId] = (season.stretchHaul[loot.itemId] || 0) + loot.qty;
    }
  } else {
    season.losses += 1;
    season.stretchLosses += 1;
  }
  let checkpoint = null;
  if (season.stretchFights >= SEASON_LENGTH) {
    checkpoint = {
      number: season.number,
      wins: season.stretchWins,
      losses: season.stretchLosses,
      haul: { ...season.stretchHaul },
    };
    season.number += 1;
    season.stretchFights = 0;
    season.stretchWins = 0;
    season.stretchLosses = 0;
    season.stretchHaul = {};
  }
  return { season, checkpoint };
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
