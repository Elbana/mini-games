/** In Riko WebView — keep navigation in the same view (no target=_blank). */
(function initArcadeEmbedNav() {
  function inEmbed() {
    return (
      document.documentElement.dataset.arcadeEmbed === '1' ||
      new URLSearchParams(location.search).get('host') === 'riko'
    );
  }

  document.addEventListener(
    'click',
    (e) => {
      if (!inEmbed()) return;
      const a = e.target.closest('a[href]');
      if (!a || a.href.startsWith('javascript:')) return;
      if (a.target === '_blank') {
        e.preventDefault();
        location.href = a.href;
      }
    },
    true
  );
})();
