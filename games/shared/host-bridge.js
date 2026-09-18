/**
 * Notify native host app (Riko Flutter WebView) about wallet events.
 * Channel name: GMHost (same as games-mobile).
 */
(function initArcadeHostBridge() {
  function notifyHost(event) {
    if (window.__arcadePaused) return;

    const payload = JSON.stringify({
      source: 'arcade-games',
      ts: Date.now(),
      ...event,
    });

    try {
      const host = window.GMHost;
      if (host && typeof host.postMessage === 'function') {
        host.postMessage(payload);
        return;
      }
    } catch {
      /* WebView channel may be torn down — ignore */
    }

    try {
      if (window.flutter_inappwebview?.callHandler) {
        window.flutter_inappwebview.callHandler('GMHost', payload);
        return;
      }
    } catch {
      /* ignore */
    }

    try {
      window.parent?.postMessage(payload, '*');
    } catch {
      /* ignore */
    }
  }

  window.arcadeNotifyHost = notifyHost;
  window.gmNotifyWallet = function gmNotifyWallet(type, detail) {
    notifyHost({ type, ...detail });
  };
})();
