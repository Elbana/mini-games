window.ArcadeFX = {
  burst(x, y, emoji = '✨', count = 8) {
    for (let i = 0; i < count; i++) {
      const p = document.createElement('span');
      p.textContent = emoji;
      p.style.cssText = `
        position:fixed;left:${x}px;top:${y}px;font-size:20px;pointer-events:none;z-index:200;
        animation: coin-burst 0.6s ease forwards;
        --tx:${(Math.random() - 0.5) * 80}px; --ty:${-30 - Math.random() * 60}px;
      `;
      p.style.transform = `translate(var(--tx), var(--ty))`;
      document.body.appendChild(p);
      setTimeout(() => p.remove(), 650);
    }
  },
  shake(el) {
    if (!el) return;
    el.style.animation = 'shake 0.35s ease';
    setTimeout(() => { el.style.animation = ''; }, 400);
  },
  flash(el, color = 'rgba(255,213,110,0.4)') {
    if (!el) return;
    const o = el.style.boxShadow;
    el.style.boxShadow = `inset 0 0 40px ${color}`;
    setTimeout(() => { el.style.boxShadow = o; }, 300);
  },
};
