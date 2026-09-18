document.addEventListener('DOMContentLoaded', async () => {
  const balanceEl = document.getElementById('balance');
  const lbEl = document.getElementById('leaderboard');

  await Arcade.refreshBalance(balanceEl);

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

  await loadLb('candy-battle');
});
