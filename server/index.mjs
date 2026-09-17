import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { PORT, GAMES_ROOT, ASSETS_ROOT, CORS_ORIGINS, IS_PRODUCTION } from './config.mjs';
import { handleGetBalance } from './routes/wallet-api.mjs';
import { handleGetMarket, handleSell as handleMarketSell } from './routes/market.mjs';
import {
  handleGetCandyConfig,
  handleGetCandyState,
  handleBuyCandies,
  handleStartFight,
  handleCandyTurn,
  handleCandyMatch,
  handleAbandonFight,
} from './routes/candy-battle.mjs';
import {
  handleGetFarmConfig,
  handleGetFarmState,
  handleBuySeed,
  handleWater,
  handleFertilize,
  handleHeal,
  handleClearPlot,
  handleHarvest,
  handleSell as handleFarmSell,
  handleUnlockPlot,
} from './routes/fast-farm.mjs';
import {
  handleGetFishingConfig,
  handleGetFishingState,
  handleBuyBait,
  handleCast,
  handleReel,
} from './routes/fishing.mjs';
import { handleGetLeaderboard } from './routes/leaderboard.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

const app = express();
app.use(express.json());

if (CORS_ORIGINS.length) {
  app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (origin && CORS_ORIGINS.includes(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Operator-Token, X-Player-Id');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    }
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
  });
}

app.get('/health', (_req, res) => {
  res.json({
    ok: true,
    env: IS_PRODUCTION ? 'production' : 'development',
    games: ['candy-battle', 'fast-farm', 'fishing'],
    features: ['black-market', 'leaderboards'],
  });
});

app.get('/api/v1/balance', handleGetBalance);
app.get('/api/v1/market', handleGetMarket);
app.post('/api/v1/market/sell', handleMarketSell);
app.get('/api/v1/leaderboard/:game', handleGetLeaderboard);

app.get('/api/candy-battle/config', handleGetCandyConfig);
app.get('/api/candy-battle/state', handleGetCandyState);
app.post('/api/candy-battle/buy-candies', handleBuyCandies);
app.post('/api/candy-battle/start-fight', handleStartFight);
app.post('/api/candy-battle/turn', handleCandyTurn);
app.post('/api/candy-battle/match', handleCandyMatch);
app.post('/api/candy-battle/abandon', handleAbandonFight);

app.get('/api/fast-farm/config', handleGetFarmConfig);
app.get('/api/fast-farm/state', handleGetFarmState);
app.post('/api/fast-farm/buy-seed', handleBuySeed);
app.post('/api/fast-farm/water', handleWater);
app.post('/api/fast-farm/fertilize', handleFertilize);
app.post('/api/fast-farm/heal', handleHeal);
app.post('/api/fast-farm/clear', handleClearPlot);
app.post('/api/fast-farm/harvest', handleHarvest);
app.post('/api/fast-farm/sell', handleFarmSell);
app.post('/api/fast-farm/unlock-plot', handleUnlockPlot);

app.get('/api/fishing/config', handleGetFishingConfig);
app.get('/api/fishing/state', handleGetFishingState);
app.post('/api/fishing/buy-bait', handleBuyBait);
app.post('/api/fishing/cast', handleCast);
app.post('/api/fishing/reel', handleReel);

app.use('/shared', express.static(path.join(GAMES_ROOT, 'shared')));
app.use('/assets', express.static(ASSETS_ROOT));
app.use('/hub', express.static(path.join(GAMES_ROOT, 'hub')));
app.use('/candy-battle', express.static(path.join(GAMES_ROOT, 'candy-battle'), { maxAge: IS_PRODUCTION ? '1d' : 0 }));
app.use('/fast-farm', express.static(path.join(GAMES_ROOT, 'fast-farm')));
app.use('/fishing', express.static(path.join(GAMES_ROOT, 'fishing')));

function injectPlatform(html, req) {
  const qs = new URLSearchParams();
  if (req.query.token) qs.set('token', req.query.token);
  if (req.query.player) qs.set('player', req.query.player);
  if (req.query.host) qs.set('host', req.query.host);
  const inject = qs.size
    ? `<script>window.__ARCADE__=${JSON.stringify(Object.fromEntries(qs))};</script>`
    : '';
  const headInject = `<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover,maximum-scale=1,user-scalable=no"><link rel="stylesheet" href="/shared/arcade-shell.css">${inject}`;
  return html.replace('</head>', `${headInject}</head>`);
}

function sendPage(res, htmlPath, req) {
  if (!fs.existsSync(htmlPath)) return res.status(404).send('Not found');
  let html = fs.readFileSync(htmlPath, 'utf8');
  html = injectPlatform(html, req);
  res.type('html').send(html);
}

app.get('/', (req, res) => sendPage(res, path.join(GAMES_ROOT, 'hub', 'index.html'), req));
app.get('/play/candy-battle', (req, res) => sendPage(res, path.join(GAMES_ROOT, 'candy-battle', 'play.html'), req));
app.get('/play/fast-farm', (req, res) => sendPage(res, path.join(GAMES_ROOT, 'fast-farm', 'play.html'), req));
app.get('/play/fishing', (req, res) => sendPage(res, path.join(GAMES_ROOT, 'fishing', 'play.html'), req));

app.listen(PORT, '0.0.0.0', () => {
  console.log(`arcade-games — http://0.0.0.0:${PORT}/`);
  console.log('Games: candy-battle, fast-farm, fishing + black market');
});
