import { comboWord } from './combo-words.js';

const COLOR_BEAM = ['#ff4d8d', '#4db8ff', '#ffd54d', '#5dffb0', '#b884ff', '#ff9f43'];

export class BoardAnimator {
  constructor(boardEl, manifest, sounds) {
    this.board = boardEl;
    this.manifest = manifest;
    this.sounds = sounds;
    this.fxLayer = document.getElementById('fx-layer');
    this.comboLayer = document.getElementById('combo-layer');
  }

  candySrc(piece) {
    if (piece === 10) return this.manifest.special?.energy || '/candy-battle/assets/special/energy.png';
    if (piece === 11) return this.manifest.special?.buyin || '/candy-battle/assets/special/buyin.png';
    const col = piece >= 100 ? piece % 100 : piece >= 200 ? piece % 200 : piece;
    const color = this.manifest.candies[col] || 'red';
    return this.manifest.candyPath.replace('{color}', color);
  }

  cellCenter(r, c) {
    const el = this.board.querySelector(`[data-r="${r}"][data-c="${c}"]`);
    if (!el) return { x: 0, y: 0 };
    const rect = el.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  }

  async swapAnimate(r0, c0, r1, c1) {
    const a = this.board.querySelector(`[data-r="${r0}"][data-c="${c0}"] .piece`);
    const b = this.board.querySelector(`[data-r="${r1}"][data-c="${c1}"] .piece`);
    if (!a || !b) return;
    const ar = a.getBoundingClientRect();
    const br = b.getBoundingClientRect();
    const dx = br.left - ar.left;
    const dy = br.top - ar.top;
    a.style.transition = b.style.transition = 'transform 0.26s cubic-bezier(0.34,1.56,0.64,1)';
    a.style.transform = `translate(${dx}px, ${dy}px)`;
    b.style.transform = `translate(${-dx}px, ${-dy}px)`;
    this.sounds?.play('swap');
    await sleep(270);
    a.style.transition = b.style.transition = '';
    a.style.transform = b.style.transform = '';
  }

  async invalidSwap(r0, c0, r1, c1) {
    await this.swapAnimate(r0, c0, r1, c1);
    await this.swapAnimate(r1, c1, r0, c0);
    this.sounds?.play('invalid');
  }

  async popCells(cells, comboIndex) {
    const frames = this.manifest.explosion;
    for (const { r, c } of cells) {
      const cell = this.board.querySelector(`[data-r="${r}"][data-c="${c}"]`);
      if (!cell) continue;
      const img = cell.querySelector('.piece');
      if (img) img.classList.add('piece-pop');
      this._explosionAt(cell, frames);
    }
    this.sounds?.play(comboIndex > 1 ? 'cascade' : 'match', { volume: 0.4 + comboIndex * 0.06 });
    await sleep(340);
  }

  _explosionAt(cell, frames) {
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
        setTimeout(tick, 40);
      } else boom.remove();
    };
    setTimeout(tick, 40);
  }

  async colorFieldWipe(color) {
    const overlay = document.createElement('div');
    overlay.className = 'color-field-wipe';
    overlay.style.setProperty('--wipe-color', COLOR_BEAM[color] || '#fff');
    this.fxLayer?.appendChild(overlay);
    this.sounds?.play('cascade', { volume: 0.55 });
    await sleep(520);
    overlay.remove();
  }

  async rowColBlast(row, col, isRow, color) {
    const boardRect = this.board.getBoundingClientRect();
    const beam = document.createElement('div');
    beam.className = isRow ? 'blast-row' : 'blast-col';
    beam.style.background = `linear-gradient(90deg, transparent, ${COLOR_BEAM[color]}aa, transparent)`;
    if (isRow) {
      const y = this.cellCenter(row, 0).y;
      beam.style.top = `${y - boardRect.top}px`;
    } else {
      const x = this.cellCenter(0, col).x;
      beam.style.left = `${x - boardRect.left}px`;
    }
    this.board.appendChild(beam);
    await sleep(380);
    beam.remove();
  }

  showComboWord(combo, matchSize) {
    if (!this.comboLayer) return;
    const word = comboWord(combo, matchSize);
    const el = document.createElement('div');
    el.className = 'combo-word';
    el.textContent = word;
    this.comboLayer.appendChild(el);
    setTimeout(() => el.remove(), 900);
  }

  async energyStrike(fromR, fromC, color, damage, monsterEl, big = false) {
    if (!this.fxLayer || !monsterEl) return;
    const from = this.cellCenter(fromR, fromC);
    const toRect = monsterEl.getBoundingClientRect();
    const toX = toRect.left + toRect.width / 2;
    const toY = toRect.top + toRect.height / 2;
    const orbColor = COLOR_BEAM[color] ?? '#ff6bcb';
    const duration = big ? 260 : 175;
    const arc = big ? 90 : 55;

    const orb = document.createElement('div');
    orb.className = `magic-orb${big ? ' magic-orb-big' : ''}`;
    orb.style.setProperty('--orb-color', orbColor);
    orb.style.left = `${from.x}px`;
    orb.style.top = `${from.y}px`;
    this.fxLayer.appendChild(orb);

    this.sounds?.play('projectile', { volume: big ? 0.42 : 0.3 });

    await new Promise((resolve) => {
      const start = performance.now();
      let lastTrail = 0;

      const tick = (now) => {
        const t = Math.min(1, (now - start) / duration);
        const eased = 1 - (1 - t) ** 3;
        const x = from.x + (toX - from.x) * eased;
        const y = from.y + (toY - from.y) * eased - Math.sin(t * Math.PI) * arc;
        orb.style.left = `${x}px`;
        orb.style.top = `${y}px`;

        if (now - lastTrail > 22) {
          lastTrail = now;
          this._spawnTrail(x, y, orbColor, big);
        }

        if (t < 1) requestAnimationFrame(tick);
        else {
          orb.remove();
          this._impactBurst(toX, toY, orbColor, big);
          monsterEl.classList.add('monster-hit');
          setTimeout(() => monsterEl.classList.remove('monster-hit'), 420);
          this.sounds?.play('hit', { volume: 0.45 });
          if (window.ArcadeFX) {
            ArcadeFX.floatText(toX, toY - 24, `-${damage}`, orbColor);
          }
          resolve();
        }
      };
      requestAnimationFrame(tick);
    });
  }

  _spawnTrail(x, y, color, big) {
    const p = document.createElement('div');
    p.className = 'magic-trail';
    p.style.setProperty('--trail-color', color);
    p.style.left = `${x}px`;
    p.style.top = `${y}px`;
    p.style.width = p.style.height = `${big ? 10 : 7}px`;
    this.fxLayer.appendChild(p);
    setTimeout(() => p.remove(), 280);
  }

  _impactBurst(x, y, color, big) {
    const burst = document.createElement('div');
    burst.className = `magic-impact${big ? ' magic-impact-big' : ''}`;
    burst.style.setProperty('--orb-color', color);
    burst.style.left = `${x}px`;
    burst.style.top = `${y}px`;
    this.fxLayer.appendChild(burst);
    const count = big ? 14 : 8;
    for (let i = 0; i < count; i++) {
      const spark = document.createElement('div');
      spark.className = 'magic-spark';
      spark.style.setProperty('--orb-color', color);
      spark.style.left = `${x}px`;
      spark.style.top = `${y}px`;
      const angle = (Math.PI * 2 * i) / count + Math.random() * 0.4;
      const dist = (big ? 48 : 32) + Math.random() * 24;
      spark.style.setProperty('--sx', `${Math.cos(angle) * dist}px`);
      spark.style.setProperty('--sy', `${Math.sin(angle) * dist}px`);
      this.fxLayer.appendChild(spark);
      setTimeout(() => spark.remove(), 420);
    }
    setTimeout(() => burst.remove(), 380);
  }

  showBuyinBonus(x, y, amount) {
    const el = document.createElement('div');
    el.className = 'buyin-bonus';
    el.textContent = `+${amount} FREE!`;
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    this.fxLayer?.appendChild(el);
    this.sounds?.play('win', { volume: 0.35 });
    setTimeout(() => el.remove(), 1100);
  }

  async fallMoves(moves) {
    if (!moves.length) return;
    const maxDelay = moves.reduce((m, mv) => Math.max(m, mv.toR), 0);
    for (const mv of moves) {
      const cell = this.board.querySelector(`[data-r="${mv.toR}"][data-c="${mv.toC}"]`);
      const img = cell?.querySelector('.piece');
      if (!img) continue;
      const dist = mv.spawn ? (mv.toR + 1) * 100 : (mv.fromR - mv.toR) * 100;
      img.style.transition = 'none';
      img.style.transform = `translateY(${mv.spawn ? -dist : dist}%)`;
      void img.offsetWidth;
      const dur = 0.22 + (mv.spawn ? mv.toR * 0.03 : (mv.fromR - mv.toR) * 0.04);
      img.style.transition = `transform ${dur}s cubic-bezier(0.34,1.45,0.64,1)`;
      img.style.transform = 'translateY(0)';
    }
    await sleep(260 + maxDelay * 25);
    this.board.querySelectorAll('.piece').forEach((img) => {
      img.style.transition = '';
      img.style.transform = '';
    });
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
