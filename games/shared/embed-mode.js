/**
 * Riko WebView embed — layout sync + unified game shutdown for memory cleanup.
 */
(function initArcadeEmbedMode() {
  let lastHeight = 0;
  let syncTimer = null;
  const gameShutdowns = [];
  let onResize = null;
  let onOrient = null;
  let onViewportResize = null;
  let booted = false;

  function inEmbed() {
    return (
      document.documentElement.dataset.arcadeEmbed === '1' ||
      new URLSearchParams(location.search).get('host') === 'riko'
    );
  }

  function readHeight() {
    return Math.round(
      window.visualViewport?.height ||
        window.innerHeight ||
        document.documentElement.clientHeight ||
        0
    );
  }

  function syncNow() {
    if (!inEmbed() || window.__arcadePaused) return;
    const h = readHeight();
    if (h <= 0 || h === lastHeight) return;

    lastHeight = h;
    document.documentElement.dataset.arcadeEmbed = '1';
    document.documentElement.style.setProperty('--arcade-vh', `${h}px`);
  }

  function scheduleSync() {
    if (syncTimer || window.__arcadePaused) return;
    syncTimer = window.setTimeout(() => {
      syncTimer = null;
      syncNow();
    }, 250);
  }

  /** Let solid UI paint first — avoids Chromium first_image_paint metric spam. */
  function revealDeferredMedia() {
    if (window.__arcadePaused) return;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (!window.__arcadePaused) {
          document.documentElement.classList.add('arcade-painted');
        }
      });
    });
  }

  window.registerArcadeGameShutdown = function registerArcadeGameShutdown(fn) {
    if (typeof fn !== 'function') return;
    gameShutdowns.push(fn);
  };

  window.isArcadePaused = function isArcadePaused() {
    return !!window.__arcadePaused;
  };

  window.arcadeEmbedShutdown = function arcadeEmbedShutdown() {
    if (window.__arcadeShutdownDone) return;
    window.__arcadeShutdownDone = true;
    window.__arcadePaused = true;

    if (syncTimer) {
      clearTimeout(syncTimer);
      syncTimer = null;
    }

    if (window.__arcadeAbortController) {
      try {
        window.__arcadeAbortController.abort();
      } catch {
        /* ignore */
      }
    }

    while (gameShutdowns.length) {
      const fn = gameShutdowns.pop();
      try {
        fn();
      } catch {
        /* ignore */
      }
    }

    if (booted) {
      if (onResize) window.removeEventListener('resize', onResize);
      if (onOrient) window.removeEventListener('orientationchange', onOrient);
      if (onViewportResize) window.visualViewport?.removeEventListener('resize', onViewportResize);
      booted = false;
    }

    lastHeight = 0;
    document.dispatchEvent(new Event('visibilitychange'));
    document.dispatchEvent(new Event('pagehide'));
    window.dispatchEvent(new Event('arcade-shutdown'));
  };

  function boot() {
    if (booted) return;
    booted = true;
    window.__arcadePaused = false;
    window.__arcadeShutdownDone = false;

    if (!inEmbed()) {
      document.documentElement.classList.add('arcade-painted');
      return;
    }

    onResize = scheduleSync;
    onOrient = scheduleSync;
    onViewportResize = scheduleSync;
    syncNow();
    revealDeferredMedia();
    window.addEventListener('resize', onResize, { passive: true });
    window.addEventListener('orientationchange', onOrient, { passive: true });
    window.visualViewport?.addEventListener('resize', onViewportResize, { passive: true });
  }

  if (document.body) {
    boot();
  } else {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  }
})();
