(function () {
  const params = new URLSearchParams(location.search);
  const platform = window.__ARCADE__ || {};
  const token = platform.token || params.get('token') || 'op_demo';
  const player = platform.player || params.get('player') || 'guest';

  if (params.get('host') === 'riko') {
    document.documentElement.dataset.arcadeEmbed = '1';
  }

  async function api(path, opts = {}) {
    const url = new URL(path, location.origin);
    url.searchParams.set('token', token);
    url.searchParams.set('player', player);
    const res = await fetch(url, {
      ...opts,
      headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || res.statusText);
    return data;
  }

  window.Arcade = {
    token,
    player,
    get: (p) => api(p),
    post: (p, body) => api(p, { method: 'POST', body }),
    toast(msg, type = '') {
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
      if (!el) return;
      el.classList.add('pending');
      el.textContent = '…';
      try {
        const { balance } = await api('/api/v1/balance');
        el.classList.remove('pending');
        el.textContent = Arcade.formatCoins(balance);
      } catch {
        el.textContent = '—';
      }
    },
  };
})();
