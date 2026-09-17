document.addEventListener('DOMContentLoaded', async () => {
  const balanceEl = document.getElementById('balance');
  const marketPreview = document.getElementById('market-preview');
  const lbEl = document.getElementById('leaderboard');
  let marketData = null;

  await Arcade.refreshBalance(balanceEl);

  function marketUrl() {
    const u = new URL('/play/market', location.origin);
    u.searchParams.set('token', Arcade.token);
    u.searchParams.set('player', Arcade.player);
    if (new URLSearchParams(location.search).get('host')) u.searchParams.set('host', 'riko');
    return u.pathname + u.search;
  }

  document.querySelectorAll('#market-card, #market-open').forEach((a) => {
    a.href = marketUrl();
  });

  async function loadMarketPreview() {
    try {
      marketData = await Arcade.get('/api/v1/market');
      const top = [...marketData.items]
        .sort((a, b) => {
          const boost = (i) => (i.volume24h < 10 ? 1 : 0) + (i.trend === 'up' ? 2 : 0);
          return boost(b) - boost(a) || b.price - a.price;
        })
        .slice(0, 4);

      const owned = Object.keys(marketData.inventory || {}).length;
      marketPreview.innerHTML =
        top
          .map((i) => {
            const arrow = i.trend === 'up' ? '▲' : i.trend === 'down' ? '▼' : '—';
            const cls = i.trend === 'up' ? 'up' : i.trend === 'down' ? 'down' : '';
            return `<div class="market-preview-row">
            <span>${i.icon} ${i.name}</span>
            <span><span class="trend ${cls}">${arrow}</span> <span class="price">🪙${Arcade.formatCoins(i.price)}</span></span>
          </div>`;
          })
          .join('') +
        (owned
          ? `<p class="market-preview-owned">You have loot to sell — open the exchange to cash in.</p>`
          : '');
    } catch {
      marketPreview.innerHTML = '<p class="market-preview-owned">Open the exchange for live prices.</p>';
    }
  }

  async function loadLb(game) {
    const { entries } = await Arcade.get(`/api/v1/leaderboard/${game}`);
    lbEl.innerHTML =
      entries.length === 0
        ? '<li style="opacity:0.5">No scores yet — be first!</li>'
        : entries
            .map(
              (e) => `<li>
          <span class="rank">${e.rank}</span>
          <span>${e.displayName}</span>
          <span class="score">${Arcade.formatCoins(e.score)}</span>
        </li>`
            )
            .join('');
  }

  document.querySelectorAll('.lb-tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.lb-tab').forEach((t) => t.classList.remove('active'));
      tab.classList.add('active');
      loadLb(tab.dataset.game);
    });
  });

  document.querySelectorAll('.game-card:not(.market)').forEach((a) => {
    const u = new URL(a.href);
    u.searchParams.set('token', Arcade.token);
    u.searchParams.set('player', Arcade.player);
    if (new URLSearchParams(location.search).get('host')) u.searchParams.set('host', 'riko');
    a.href = u.pathname + u.search;
  });

  document.getElementById('market-card').href = marketUrl();

  await loadMarketPreview();
  await loadLb('candy-battle');
  setInterval(loadMarketPreview, 30000);
});
