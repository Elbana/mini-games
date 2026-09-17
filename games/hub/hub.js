document.addEventListener('DOMContentLoaded', async () => {
  const balanceEl = document.getElementById('balance');
  const marketList = document.getElementById('market-list');
  const invSell = document.getElementById('inventory-sell');
  const lbEl = document.getElementById('leaderboard');
  let marketData = null;

  await Arcade.refreshBalance(balanceEl);

  async function loadMarket() {
    marketData = await Arcade.get('/api/v1/market');
    marketList.innerHTML = marketData.items
      .slice(0, 8)
      .map(
        (i) => `
      <div class="market-row">
        <span>${i.icon} ${i.name}</span>
        <span>
          <span class="trend ${i.trend}">${i.trend === 'up' ? '▲' : i.trend === 'down' ? '▼' : '—'}</span>
          <span class="price">${Arcade.formatCoins(i.price)}</span>
        </span>
      </div>`
      )
      .join('');
    renderInventory();
  }

  function renderInventory() {
    const inv = marketData?.inventory || {};
    const keys = Object.keys(inv);
    if (!keys.length) {
      invSell.innerHTML = '<h3>Your loot</h3><p style="opacity:0.6;font-size:0.8rem">Play games to collect items to sell.</p>';
      return;
    }
    invSell.innerHTML =
      '<h3>Sell your loot</h3>' +
      keys
        .map((id) => {
          const item = marketData.items.find((x) => x.id === id);
          const name = item?.name || id;
          const icon = item?.icon || '📦';
          return `<div class="inv-row">
          <span>${icon} ${name}</span>
          <span class="qty">×${inv[id]}</span>
          <button class="btn btn-gold btn-sm" data-sell="${id}">Sell 1</button>
          <button class="btn btn-primary btn-sm" data-sell-all="${id}">All</button>
        </div>`;
        })
        .join('');
    invSell.querySelectorAll('[data-sell]').forEach((btn) => {
      btn.addEventListener('click', () => sellItem(btn.dataset.sell, 1));
    });
    invSell.querySelectorAll('[data-sell-all]').forEach((btn) => {
      btn.addEventListener('click', () => sellItem(btn.dataset.sellAll, inv[btn.dataset.sellAll]));
    });
  }

  async function sellItem(itemId, qty) {
    try {
      const r = await Arcade.post('/api/v1/market/sell', { itemId, qty });
      Arcade.toast(`+${Arcade.formatCoins(r.total)} coins!`, 'win');
      balanceEl.textContent = Arcade.formatCoins(r.balance);
      marketData.inventory = r.inventory;
      marketData.items = r.market.items;
      loadMarket();
      ArcadeFX.burst(window.innerWidth / 2, window.innerHeight / 2, '🪙', 6);
    } catch (e) {
      Arcade.toast(e.message, 'lose');
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

  document.querySelectorAll('.game-card').forEach((a) => {
    const u = new URL(a.href);
    u.searchParams.set('token', Arcade.token);
    u.searchParams.set('player', Arcade.player);
    if (new URLSearchParams(location.search).get('host')) u.searchParams.set('host', 'riko');
    a.href = u.pathname + u.search;
  });

  await loadMarket();
  await loadLb('candy-battle');
  setInterval(loadMarket, 30000);
});
