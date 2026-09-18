(function () {
  const params = new URLSearchParams(location.search);
  const platform = window.__ARCADE__ || {};
  const token = platform.token || params.get('token') || 'op_demo';
  const player = platform.player || params.get('player') || 'guest';

  if (params.get('host') === 'riko') {
    document.documentElement.dataset.arcadeEmbed = '1';
  }

  window.__arcadeAbortController = new AbortController();

  function paused() {
    return window.__arcadePaused || window.__arcadeShutdownDone;
  }

  function notifyWallet(type, detail) {
    if (paused()) return;
    if (typeof window.gmNotifyWallet === 'function') {
      window.gmNotifyWallet(type, detail);
    }
  }

  function maybeNotifyFromResponse(path, method, data) {
    if (paused()) return;
    if (typeof data?.balance !== 'number') return;
    if (method === 'GET' && /\/balance(\?|$)/.test(path)) return;
    const isCredit =
      path.includes('/market/sell') ||
      (data.total && data.total > 0 && path.includes('/market/'));
    const isDebit =
      path.includes('/buy-') ||
      path.includes('/buy_') ||
      path.includes('buy-bait') ||
      path.includes('buy-candies') ||
      path.includes('buy-seed') ||
      path.includes('fertilize') ||
      path.includes('/heal');
    const type = isCredit ? 'win' : isDebit ? 'bet' : 'balance';
    notifyWallet(type, { balance: data.balance, path, method });
  }

  async function api(path, opts = {}) {
    if (paused()) throw new Error('Arcade paused');
    const url = new URL(path, location.origin);
    url.searchParams.set('token', token);
    url.searchParams.set('player', player);
    const method = opts.method || 'GET';
    const res = await fetch(url, {
      ...opts,
      signal: window.__arcadeAbortController?.signal,
      headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    });
    if (paused()) throw new Error('Arcade paused');
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || res.statusText);
    maybeNotifyFromResponse(path, method, data);
    return data;
  }

  window.Arcade = {
    token,
    player,
    get: (p) => api(p),
    post: (p, body) => api(p, { method: 'POST', body }),
    toast(msg, type = '') {
      if (paused()) return;
      const el = document.createElement('div');
      el.className = `toast ${type}`;
      el.textContent = msg;
      document.body.appendChild(el);
      setTimeout(() => el.remove(), 2400);
    },
    formatCoins(n) {
      return Number(n).toLocaleString();
    },
    async refreshBalance(el) {
      if (!el || paused()) return;
      el.classList.add('pending');
      el.textContent = '…';
      try {
        const { balance } = await api('/api/v1/balance');
        if (paused()) return;
        el.classList.remove('pending');
        el.textContent = Arcade.formatCoins(balance);
        notifyWallet('balance', { balance });
      } catch {
        if (!paused()) el.textContent = '—';
      }
    },
  };
})();
