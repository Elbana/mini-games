window.ArcadeFX = {
  burst(x, y, emoji = '✨', count = 8) {
    for (let i = 0; i < count; i++) {
      const p = document.createElement('span');
      p.textContent = emoji;
      p.className = 'fx-particle';
      const tx = (Math.random() - 0.5) * 100;
      const ty = -40 - Math.random() * 80;
      p.style.cssText = `left:${x}px;top:${y}px;--tx:${tx}px;--ty:${ty}px;`;
      document.body.appendChild(p);
      setTimeout(() => p.remove(), 700);
    }
  },

  matchBurst(cellEl, type = 0) {
    if (!cellEl) return;
    const rect = cellEl.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const colors = ['#ff6bcb', '#6ecbff', '#ffd56e', '#5dffb0', '#b84dff', '#ff5a7a'];
    for (let i = 0; i < 10; i++) {
      const p = document.createElement('span');
      p.className = 'fx-spark';
      p.style.background = colors[type] || '#fff';
      const angle = (Math.PI * 2 * i) / 10;
      const dist = 30 + Math.random() * 40;
      p.style.left = `${cx}px`;
      p.style.top = `${cy}px`;
      p.style.setProperty('--dx', `${Math.cos(angle) * dist}px`);
      p.style.setProperty('--dy', `${Math.sin(angle) * dist}px`);
      document.body.appendChild(p);
      setTimeout(() => p.remove(), 500);
    }
  },

  floatText(x, y, text, color = '#ffd56e') {
    const el = document.createElement('div');
    el.className = 'fx-damage';
    el.textContent = text;
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    el.style.color = color;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 900);
  },

  confetti(count = 24) {
    const colors = ['#ff6bcb', '#ffd56e', '#6ecbff', '#5dffb0', '#b84dff'];
    for (let i = 0; i < count; i++) {
      const p = document.createElement('span');
      p.className = 'fx-confetti';
      p.style.background = colors[i % colors.length];
      p.style.left = `${Math.random() * 100}vw`;
      p.style.animationDelay = `${Math.random() * 0.4}s`;
      p.style.setProperty('--rot', `${Math.random() * 720}deg`);
      document.body.appendChild(p);
      setTimeout(() => p.remove(), 2000);
    }
  },

  shake(el) {
    if (!el) return;
    el.classList.remove('fx-shake');
    void el.offsetWidth;
    el.classList.add('fx-shake');
    setTimeout(() => el.classList.remove('fx-shake'), 450);
  },

  flash(el, color = 'rgba(255,213,110,0.45)') {
    if (!el) return;
    el.style.setProperty('--flash-color', color);
    el.classList.add('fx-flash');
    setTimeout(() => el.classList.remove('fx-flash'), 350);
  },
};
