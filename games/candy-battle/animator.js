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

  /** Silver energy gathers at matched cells, then streaks rush to the monster. */
  async energyStrike(sourceCells, damage, monsterEl, big = false) {
    if (!this.fxLayer || !monsterEl || !sourceCells?.length) return;

    const toRect = monsterEl.getBoundingClientRect();
    const target = {
      x: toRect.left + toRect.width / 2,
      y: toRect.top + toRect.height / 2,
    };
    const sources = this._sampleCells(sourceCells, big ? 14 : 10);
    const points = sources.map(({ r, c }) => this.cellCenter(r, c));

    for (const pt of points) {
      this._spawnSilverGather(pt, big);
    }
    this.sounds?.play('match', { volume: big ? 0.35 : 0.25 });
    await sleep(big ? 110 : 85);

    this.sounds?.play('projectile', { volume: big ? 0.38 : 0.28 });
    const duration = big ? 240 : 190;
    await Promise.all(
      points.map((from, i) =>
        this._flySilverBeam(from, target, i * (big ? 22 : 16), duration, big)
      )
    );

    this._silverImpact(target.x, target.y, big);
    monsterEl.classList.add('monster-hit');
    setTimeout(() => monsterEl.classList.remove('monster-hit'), 420);
    this.sounds?.play('hit', { volume: 0.45 });
    if (window.ArcadeFX) {
      ArcadeFX.floatText(target.x, target.y - 24, `-${damage}`, '#e8f4ff');
    }
    await sleep(big ? 60 : 40);
  }

  _sampleCells(cells, max) {
    const seen = new Set();
    const unique = [];
    for (const { r, c } of cells) {
      const key = `${r},${c}`;
      if (seen.has(key)) continue;
      seen.add(key);
      unique.push({ r, c });
    }
    if (unique.length <= max) return unique;
    const out = [];
    for (let i = 0; i < max; i++) {
      out.push(unique[Math.floor((i * unique.length) / max)]);
    }
    return out;
  }

  _spawnSilverGather(pt, big) {
    const core = document.createElement('div');
    core.className = `silver-gather${big ? ' silver-gather-big' : ''}`;
    core.style.left = `${pt.x}px`;
    core.style.top = `${pt.y}px`;
    this.fxLayer.appendChild(core);
    setTimeout(() => core.remove(), 220);

    for (let i = 0; i < (big ? 4 : 2); i++) {
      const mote = document.createElement('div');
      mote.className = 'silver-mote';
      mote.style.left = `${pt.x + (Math.random() - 0.5) * 18}px`;
      mote.style.top = `${pt.y + (Math.random() - 0.5) * 18}px`;
      mote.style.setProperty('--lift', `${-8 - Math.random() * 14}px`);
      mote.style.animationDelay = `${i * 0.04}s`;
      this.fxLayer.appendChild(mote);
      setTimeout(() => mote.remove(), 320);
    }
  }

  _flySilverBeam(from, to, delayMs, durationMs, big) {
    return new Promise((resolve) => {
      setTimeout(() => {
        const wrap = document.createElement('div');
        wrap.className = `silver-beam${big ? ' silver-beam-big' : ''}`;
        const head = document.createElement('div');
        head.className = 'silver-beam-head';
        const tail = document.createElement('div');
        tail.className = 'silver-beam-tail';
        const glow = document.createElement('div');
        glow.className = 'silver-beam-glow';
        wrap.appendChild(glow);
        wrap.appendChild(tail);
        wrap.appendChild(head);
        this.fxLayer.appendChild(wrap);

        const angle = Math.atan2(to.y - from.y, to.x - from.x);
        const start = performance.now();
        let lastSpark = 0;

        const tick = (now) => {
          const t = Math.min(1, (now - start) / durationMs);
          const rush = t < 0.12 ? (t / 0.12) ** 2 * 0.06 : 0.06 + ((t - 0.12) / 0.88) ** 1.6 * 0.94;
          const x = from.x + (to.x - from.x) * rush;
          const y = from.y + (to.y - from.y) * rush;

          wrap.style.left = `${x}px`;
          wrap.style.top = `${y}px`;
          wrap.style.transform = `rotate(${angle}rad)`;

          if (now - lastSpark > 28) {
            lastSpark = now;
            this._spawnSilverSpark(x, y, big);
          }

          if (t < 1) requestAnimationFrame(tick);
          else {
            wrap.remove();
            resolve();
          }
        };
        requestAnimationFrame(tick);
      }, delayMs);
    });
  }

  _spawnSilverSpark(x, y, big) {
    const spark = document.createElement('div');
    spark.className = 'silver-spark';
    spark.style.left = `${x}px`;
    spark.style.top = `${y}px`;
    spark.style.width = spark.style.height = `${big ? 5 : 3}px`;
    this.fxLayer.appendChild(spark);
    setTimeout(() => spark.remove(), 180);
  }

  _silverImpact(x, y, big) {
    const burst = document.createElement('div');
    burst.className = `silver-impact${big ? ' silver-impact-big' : ''}`;
    burst.style.left = `${x}px`;
    burst.style.top = `${y}px`;
    this.fxLayer.appendChild(burst);

    const ring = document.createElement('div');
    ring.className = 'silver-impact-ring';
    ring.style.left = `${x}px`;
    ring.style.top = `${y}px`;
    this.fxLayer.appendChild(ring);

    const count = big ? 16 : 10;
    for (let i = 0; i < count; i++) {
      const shard = document.createElement('div');
      shard.className = 'silver-shard';
      shard.style.left = `${x}px`;
      shard.style.top = `${y}px`;
      const angle = (Math.PI * 2 * i) / count + Math.random() * 0.35;
      const dist = (big ? 52 : 36) + Math.random() * 20;
      shard.style.setProperty('--sx', `${Math.cos(angle) * dist}px`);
      shard.style.setProperty('--sy', `${Math.sin(angle) * dist}px`);
      this.fxLayer.appendChild(shard);
      setTimeout(() => shard.remove(), 450);
    }

    setTimeout(() => {
      burst.remove();
      ring.remove();
    }, 420);
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
