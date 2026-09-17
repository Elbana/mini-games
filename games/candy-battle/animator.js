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
    const beamColor = COLOR_BEAM[color] ?? '#ff6bcb';

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.classList.add('energy-beam');
    svg.setAttribute('viewBox', `0 0 ${window.innerWidth} ${window.innerHeight}`);
    svg.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:210;';

    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    const mx = (from.x + toX) / 2;
    const my = Math.min(from.y, toY) - (big ? 120 : 70);
    path.setAttribute(
      'd',
      `M ${from.x} ${from.y} Q ${mx} ${my} ${toX} ${toY}`
    );
    path.setAttribute('stroke', beamColor);
    path.setAttribute('stroke-width', big ? '8' : '5');
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke-linecap', 'round');
    path.classList.add('energy-path');
    svg.appendChild(path);

    for (let i = 0; i < (big ? 12 : 6); i++) {
      const p = document.createElement('div');
      p.className = 'energy-spark';
      p.style.background = beamColor;
      p.style.left = `${from.x}px`;
      p.style.top = `${from.y}px`;
      p.style.setProperty('--tx', `${toX - from.x + (Math.random() - 0.5) * 30}px`);
      p.style.setProperty('--ty', `${toY - from.y}px`);
      p.style.animationDelay = `${i * 0.04}s`;
      this.fxLayer.appendChild(p);
      setTimeout(() => p.remove(), 500);
    }

    this.fxLayer.appendChild(svg);
    this.sounds?.play('projectile', { volume: big ? 0.45 : 0.3 });

    await sleep(big ? 420 : 320);

    svg.remove();
    monsterEl.classList.add('monster-hit');
    setTimeout(() => monsterEl.classList.remove('monster-hit'), 400);
    this.sounds?.play('hit', { volume: 0.45 });

    if (window.ArcadeFX) {
      ArcadeFX.floatText(toX, toY - 24, `-${damage}`, beamColor);
    }
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
