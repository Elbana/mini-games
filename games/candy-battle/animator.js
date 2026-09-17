/** Visual layer — swaps, pops, explosions, candy projectiles. */

export class BoardAnimator {
  constructor(boardEl, manifest, sounds) {
    this.board = boardEl;
    this.manifest = manifest;
    this.sounds = sounds;
    this.cellPx = 0;
    this.projectileLayer = document.getElementById('projectile-layer');
  }

  candySrc(type) {
    const color = this.manifest.candies[type];
    return this.manifest.candyPath.replace('{color}', color);
  }

  measure() {
    const cell = this.board.querySelector('.cell');
    if (cell) this.cellPx = cell.getBoundingClientRect().width;
  }

  cellCenter(r, c) {
    const el = this.board.querySelector(`[data-r="${r}"][data-c="${c}"]`);
    if (!el) return { x: 0, y: 0 };
    const rect = el.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  }

  async swapAnimate(r0, c0, r1, c1) {
    const a = this.board.querySelector(`[data-r="${r0}"][data-c="${c0}"] .candy-img`);
    const b = this.board.querySelector(`[data-r="${r1}"][data-c="${c1}"] .candy-img`);
    if (!a || !b) return;
    const ar = a.getBoundingClientRect();
    const br = b.getBoundingClientRect();
    const dx = br.left - ar.left;
    const dy = br.top - ar.top;
    a.style.transition = b.style.transition = 'transform 0.22s cubic-bezier(0.34,1.4,0.64,1)';
    a.style.transform = `translate(${dx}px, ${dy}px)`;
    b.style.transform = `translate(${-dx}px, ${-dy}px)`;
    this.sounds?.play('swap');
    await sleep(230);
    a.style.transition = b.style.transition = '';
    a.style.transform = b.style.transform = '';
  }

  async invalidSwap(r0, c0, r1, c1) {
    await this.swapAnimate(r0, c0, r1, c1);
    await this.swapAnimate(r1, c1, r0, c0);
    this.sounds?.play('invalid');
  }

  async popCluster(cluster, comboIndex) {
    const frames = this.manifest.explosion;
    for (const { r, c, type } of cluster) {
      const cell = this.board.querySelector(`[data-r="${r}"][data-c="${c}"]`);
      if (!cell) continue;
      const img = cell.querySelector('.candy-img');
      if (img) {
        img.classList.add('candy-pop');
        this._explosionAt(cell, frames, type);
      }
    }
    this.sounds?.play(comboIndex > 1 ? 'cascade' : 'match', { volume: 0.35 + comboIndex * 0.05 });
    await sleep(320);
  }

  _explosionAt(cell, frames, type) {
    const boom = document.createElement('div');
    boom.className = 'explosion-fx';
    const img = document.createElement('img');
    img.src = frames[0];
    boom.appendChild(img);
    cell.appendChild(boom);
    let i = 0;
    const tick = () => {
      i++;
      if (i < frames.length) {
        img.src = frames[i];
        setTimeout(tick, 45);
      } else {
        boom.remove();
      }
    };
    setTimeout(tick, 45);
  }

  async fallMoves(moves) {
    if (!moves.length) return;
    for (const m of moves) {
      const cell = this.board.querySelector(`[data-r="${m.toR}"][data-c="${m.toC}"]`);
      const img = cell?.querySelector('.candy-img');
      if (!img) continue;
      if (m.spawn) {
        img.style.transform = `translateY(-${(m.toR + 1) * 100}%)`;
        img.style.transition = 'none';
        void img.offsetWidth;
        img.style.transition = `transform ${0.2 + m.toR * 0.02}s cubic-bezier(0.34,1.25,0.64,1)`;
        img.style.transform = 'translateY(0)';
      } else {
        const dist = (m.fromR - m.toR) * 100;
        img.style.transform = `translateY(${dist}%)`;
        img.style.transition = 'none';
        void img.offsetWidth;
        img.style.transition = `transform ${0.18 + (m.fromR - m.toR) * 0.025}s cubic-bezier(0.34,1.25,0.64,1)`;
        img.style.transform = 'translateY(0)';
      }
    }
    await sleep(280);
    this.board.querySelectorAll('.candy-img').forEach((img) => {
      img.style.transition = '';
      img.style.transform = '';
    });
  }

  async launchProjectile(fromR, fromC, type, damage, monsterEl) {
    if (!this.projectileLayer || !monsterEl) return;
    const from = this.cellCenter(fromR, fromC);
    const toRect = monsterEl.getBoundingClientRect();
    const toX = toRect.left + toRect.width / 2;
    const toY = toRect.top + toRect.height / 2;

    const proj = document.createElement('img');
    proj.className = 'candy-projectile';
    proj.src = this.candySrc(type);
    proj.style.left = `${from.x}px`;
    proj.style.top = `${from.y}px`;
    this.projectileLayer.appendChild(proj);
    this.sounds?.play('projectile', { volume: 0.25 });

    await new Promise((resolve) => {
      const duration = 380;
      const start = performance.now();
      const cpX = (from.x + toX) / 2;
      const cpY = Math.min(from.y, toY) - 80;

      function frame(now) {
        const t = Math.min(1, (now - start) / duration);
        const u = 1 - t;
        const x = u * u * from.x + 2 * u * t * cpX + t * t * toX;
        const y = u * u * from.y + 2 * u * t * cpY + t * t * toY;
        const scale = 1 + Math.sin(t * Math.PI) * 0.35;
        proj.style.transform = `translate(-50%,-50%) scale(${scale}) rotate(${t * 360}deg)`;
        proj.style.left = `${x}px`;
        proj.style.top = `${y}px`;
        if (t < 1) requestAnimationFrame(frame);
        else resolve();
      }
      requestAnimationFrame(frame);
    });

    proj.remove();
    monsterEl.classList.add('monster-hit');
    setTimeout(() => monsterEl.classList.remove('monster-hit'), 350);
    this.sounds?.play('hit', { volume: 0.4 });

    if (window.ArcadeFX) {
      ArcadeFX.floatText(toX, toY - 20, `-${damage}`, '#ff6bcb');
    }
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
