const CATEGORY_LABELS = { candy: 'Candy', crop: 'Crop', fish: 'Fish' };

document.addEventListener('DOMContentLoaded', init);

async function init() {
  setupHubLink();
  setupToasts();

  const balanceEl = document.getElementById('balance');
  const searchInput = document.getElementById('search-input');
  const sortSelect = document.getElementById('sort-select');
  const priceBody = document.getElementById('price-body');
  const emptyState = document.getElementById('empty-state');
  const resultCount = document.getElementById('result-count');
  const portfolioList = document.getElementById('portfolio-list');
  const lastUpdated = document.getElementById('last-updated');

  let marketData = null;
  let searchQuery = '';
  let category = 'all';
  let sortBy = 'name';
  let searchTimer = null;
  let marketPollTimer = null;

  registerArcadeGameShutdown(() => {
    if (marketPollTimer) clearInterval(marketPollTimer);
    if (searchTimer) clearTimeout(searchTimer);
    marketPollTimer = null;
    searchTimer = null;
  });

  await Arcade.refreshBalance(balanceEl);

  document.getElementById('btn-refresh').addEventListener('click', () => loadMarket(true));

  document.querySelectorAll('.mk-cat').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.mk-cat').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      category = btn.dataset.cat;
      render();
    });
  });

  searchInput.addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      searchQuery = searchInput.value.trim().toLowerCase();
      render();
    }, 150);
  });

  sortSelect.addEventListener('change', () => {
    sortBy = sortSelect.value;
    render();
  });

  async function loadMarket(manual = false) {
    try {
      marketData = await Arcade.get('/api/v1/market');
      updateStats();
      render();
      if (manual) Arcade.toast('Prices refreshed', 'win');
    } catch (e) {
      Arcade.toast(e.message, 'lose');
    }
  }

  function ownedQty(itemId) {
    return marketData?.inventory?.[itemId] || 0;
  }

  function priceChange(item) {
    const delta = item.price - item.basePrice;
    const pct = item.basePrice ? ((item.price / item.basePrice - 1) * 100) : 0;
    return { delta, pct };
  }

  function portfolioValue() {
    if (!marketData) return 0;
    return Object.entries(marketData.inventory || {}).reduce((sum, [id, qty]) => {
      const item = marketData.items.find((i) => i.id === id);
      return sum + (item ? item.price * qty : 0);
    }, 0);
  }

  function totalOwned() {
    return Object.values(marketData?.inventory || {}).reduce((s, q) => s + q, 0);
  }

  function bestTip() {
    if (!marketData?.items?.length) return 'Check back soon for live prices.';
    const owned = marketData.inventory || {};
    const held = marketData.items.filter((i) => (owned[i.id] || 0) > 0);
    if (held.length) {
      const best = [...held].sort((a, b) => priceChange(b).pct - priceChange(a).pct)[0];
      const { pct } = priceChange(best);
      if (pct > 0) return `${best.icon} ${best.name} is +${pct.toFixed(0)}% — good time to sell`;
      const quiet = [...held].sort((a, b) => a.volume24h - b.volume24h)[0];
      if (quiet.volume24h < 10) return `Hold ${quiet.icon} ${quiet.name} — market is quiet (+${((1.12 - 1) * 100).toFixed(0)}% boost possible)`;
      return `Hold ${best.icon} ${best.name} — price still below peak`;
    }
    const opportunity = [...marketData.items]
      .filter((i) => i.volume24h < 8 && i.trend === 'up')
      .sort((a, b) => priceChange(b).pct - priceChange(a).pct)[0];
    if (opportunity) {
      return `${opportunity.icon} ${opportunity.name} trending up — farm it before the crowd`;
    }
    return 'Low volume = higher prices. Patience pays.';
  }

  function updateStats() {
    document.getElementById('stat-portfolio').textContent = `🪙 ${Arcade.formatCoins(portfolioValue())}`;
    document.getElementById('stat-owned').textContent = String(totalOwned());
    const daily = marketData?.dailyBrief?.headline;
    document.getElementById('stat-tip').textContent = daily || bestTip();
    const ts = marketData?.updatedAt ? new Date(marketData.updatedAt) : new Date();
    lastUpdated.textContent = `Last updated ${ts.toLocaleTimeString()} · auto-refresh every 30s`;
  }

  function filterItems() {
    return (marketData?.items || []).filter((item) => {
      if (category !== 'all' && item.category !== category) return false;
      if (!searchQuery) return true;
      const hay = `${item.name} ${item.id} ${item.category}`.toLowerCase();
      return hay.includes(searchQuery);
    });
  }

  function sortItems(items) {
    const list = [...items];
    const cmp = {
      name: (a, b) => a.name.localeCompare(b.name),
      'price-desc': (a, b) => b.price - a.price,
      'price-asc': (a, b) => a.price - b.price,
      'change-desc': (a, b) => priceChange(b).pct - priceChange(a).pct,
      'change-asc': (a, b) => priceChange(a).pct - priceChange(b).pct,
      'volume-asc': (a, b) => a.volume24h - b.volume24h,
      'volume-desc': (a, b) => b.volume24h - a.volume24h,
      owned: (a, b) => ownedQty(b.id) - ownedQty(a.id) || a.name.localeCompare(b.name),
    };
    list.sort(cmp[sortBy] || cmp.name);
    return list;
  }

  function renderPriceTable(items) {
    if (!items.length) {
      priceBody.innerHTML = '';
      emptyState.classList.remove('hidden');
      resultCount.textContent = '0 items';
      return;
    }
    emptyState.classList.add('hidden');
    resultCount.textContent = `${items.length} item${items.length === 1 ? '' : 's'}`;

    priceBody.innerHTML = items
      .map((item) => {
        const { delta, pct } = priceChange(item);
        const owned = ownedQty(item.id);
        const trendClass = item.trend === 'up' ? 'up' : item.trend === 'down' ? 'down' : 'flat';
        const changeLabel =
          item.trend === 'flat'
            ? '—'
            : `${delta >= 0 ? '+' : ''}${Arcade.formatCoins(delta)} (${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%)`;
        const volClass = item.volume24h < 10 ? 'quiet' : '';
        return `<tr class="${owned > 0 ? 'owned-row' : ''}">
          <td>
            <div class="mk-item-cell">
              <span class="mk-item-icon">${item.icon}</span>
              <span class="mk-item-name">${item.name}</span>
            </div>
          </td>
          <td><span class="mk-cat-badge ${item.category}">${CATEGORY_LABELS[item.category] || item.category}</span></td>
          <td class="num mk-price-base">🪙${Arcade.formatCoins(item.basePrice)}</td>
          <td class="num mk-price-live">🪙${Arcade.formatCoins(item.price)}</td>
          <td class="num mk-change ${trendClass}">${changeLabel}</td>
          <td class="num mk-vol ${volClass}" title="24h / today">${item.volume24h} / ${item.volumeToday ?? 0}</td>
          <td class="num mk-owned ${owned ? '' : 'zero'}">${owned || '—'}</td>
        </tr>`;
      })
      .join('');
  }

  function renderPortfolio() {
    const inv = marketData?.inventory || {};
    const keys = Object.keys(inv).filter((id) => inv[id] > 0);

    if (!keys.length) {
      portfolioList.innerHTML =
        '<p class="mk-empty-portfolio">Play Candy Battle, Fast Farm, or Deep Cast to collect loot — then sell here when prices look good.</p>';
      return;
    }

    const rows = keys
      .map((id) => {
        const item = marketData.items.find((x) => x.id === id);
        const qty = inv[id];
        const unit = item?.price || 0;
        const total = unit * qty;
        const name = item?.name || id;
        const icon = item?.icon || '📦';
        const { pct } = item ? priceChange(item) : { pct: 0 };
        const volToday = item?.volumeToday ?? 0;
        const nearFloor = item?.floorPrice && unit <= item.floorPrice + 1;
        const trendHint = nearFloor
          ? 'break-even price — wait for tomorrow'
          : volToday > 40
            ? 'heavy selling today — price falling'
            : pct > 0 ? `+${pct.toFixed(0)}% vs opening` : pct < 0 ? `${pct.toFixed(0)}% vs opening` : 'opening price';
        return `<div class="mk-inv-card">
          <span class="mk-inv-icon">${icon}</span>
          <div class="mk-inv-info">
            <div class="mk-inv-name">${name}</div>
            <div class="mk-inv-meta">×${qty} · <span class="live">🪙${Arcade.formatCoins(unit)}</span> each · ${trendHint}</div>
            <div class="mk-inv-meta">Total <span class="live">🪙${Arcade.formatCoins(total)}</span></div>
          </div>
          <div class="mk-inv-actions">
            <button type="button" class="btn btn-gold btn-sm" data-sell="${id}">Sell 1</button>
            <button type="button" class="btn btn-primary btn-sm" data-sell-all="${id}">All</button>
          </div>
        </div>`;
      })
      .join('');

    portfolioList.innerHTML =
      rows +
      `<div class="mk-portfolio-total">
        <span>Bag value</span>
        <span>🪙 ${Arcade.formatCoins(portfolioValue())}</span>
      </div>`;

    portfolioList.querySelectorAll('[data-sell]').forEach((btn) => {
      btn.addEventListener('click', () => sellItem(btn.dataset.sell, 1));
    });
    portfolioList.querySelectorAll('[data-sell-all]').forEach((btn) => {
      btn.addEventListener('click', () => sellItem(btn.dataset.sellAll, inv[btn.dataset.sellAll]));
    });
  }

  function render() {
    if (!marketData) return;
    const items = sortItems(filterItems());
    renderPriceTable(items);
    renderPortfolio();
  }

  async function sellItem(itemId, qty) {
    if (!qty || qty < 1) return;
    try {
      const r = await Arcade.post('/api/v1/market/sell', { itemId, qty });
      window.gmNotifyWallet?.('win', {
        balance: r.balance,
        amount: r.total,
        path: '/api/v1/market/sell',
      });
      Arcade.toast(`+🪙 ${Arcade.formatCoins(r.total)}`, 'win');
      balanceEl.textContent = Arcade.formatCoins(r.balance);
      marketData.inventory = r.inventory;
      marketData.items = r.market.items;
      marketData.updatedAt = r.market.updatedAt;
      updateStats();
      render();
      ArcadeFX.burst(window.innerWidth / 2, window.innerHeight / 2, '🪙', 8);
    } catch (e) {
      Arcade.toast(e.message, 'lose');
    }
  }

  await loadMarket();
  marketPollTimer = setInterval(() => {
    if (window.__arcadePaused) return;
    loadMarket();
  }, 30000);
}

function setupHubLink() {
  const link = document.getElementById('hub-link');
  const u = new URL('/', location.origin);
  u.searchParams.set('token', Arcade.token);
  u.searchParams.set('player', Arcade.player);
  if (new URLSearchParams(location.search).get('host')) u.searchParams.set('host', 'riko');
  link.href = u.pathname + u.search;
}

function setupToasts() {
  const zone = document.getElementById('toast-zone');
  if (!zone) return;
  Arcade.toast = (msg, type = '') => {
    const el = document.createElement('div');
    el.className = `fish-toast ${type}`.trim();
    el.textContent = msg;
    zone.insertBefore(el, zone.firstChild);
    requestAnimationFrame(() => el.classList.add('show'));
    setTimeout(() => {
      el.classList.remove('show');
      setTimeout(() => el.remove(), 400);
    }, 2800);
  };
}
