/** Procedural lightning & electric-field VFX (white/cyan arcs — not color washes). */

function dist(x1, y1, x2, y2) {
  return Math.hypot(x2 - x1, y2 - y1);
}

/** Midpoint-displacement jagged bolt. */
export function buildBoltPoints(x1, y1, x2, y2, displacement) {
  if (displacement < 2.5) return [{ x: x1, y: y1 }, { x: x2, y: y2 }];
  const mx = (x1 + x2) / 2 + (Math.random() - 0.5) * displacement;
  const my = (y1 + y2) / 2 + (Math.random() - 0.5) * displacement;
  return [
    ...buildBoltPoints(x1, y1, mx, my, displacement * 0.52),
    ...buildBoltPoints(mx, my, x2, y2, displacement * 0.52),
  ];
}

function branchBolt(points, atIndex, length) {
  if (atIndex <= 0 || atIndex >= points.length - 1) return null;
  const p = points[atIndex];
  const prev = points[atIndex - 1];
  const next = points[atIndex + 1];
  const forward = Math.atan2(next.y - prev.y, next.x - prev.x);
  const angle = forward + (Math.random() < 0.5 ? -1 : 1) * (0.7 + Math.random() * 0.5);
  return buildBoltPoints(
    p.x,
    p.y,
    p.x + Math.cos(angle) * length,
    p.y + Math.sin(angle) * length,
    length * 0.28,
  );
}

export class ElectricField {
  constructor(layer, focusPoint = null) {
    this.layer = layer;
    this.focusPoint = focusPoint;
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'electric-field-canvas';
    this.ctx = this.canvas.getContext('2d');
    this.layer.appendChild(this.canvas);
    this.bolts = [];
    this.arcs = [];
    this.links = [];
    this.running = false;
    this._jitterAt = 0;
    this._raf = null;
    this._resize();
    this._onResize = () => this._resize();
    window.addEventListener('resize', this._onResize);
  }

  _resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = window.innerWidth * dpr;
    this.canvas.height = window.innerHeight * dpr;
    this.canvas.style.width = `${window.innerWidth}px`;
    this.canvas.style.height = `${window.innerHeight}px`;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  destroy() {
    this.running = false;
    if (this._raf) cancelAnimationFrame(this._raf);
    window.removeEventListener('resize', this._onResize);
    this.canvas.remove();
  }

  /** Persistent arcs from the color ball to each same-color target only. */
  spawnTargetArcs(from, targetPoints) {
    this.links = targetPoints.map((to) => ({ from, to, kind: 'target' }));
    this._rebuildArcs();
  }

  /** Double color-ball: a few spokes inside the board, not a full-screen wash. */
  spawnFieldArcs(boardRect, count = 10) {
    const cx = boardRect.left + boardRect.width / 2;
    const cy = boardRect.top + boardRect.height / 2;
    const n = Math.min(count, 12);
    this.focusPoint = { x: cx, y: cy };
    this.links = [];
    for (let i = 0; i < n; i++) {
      const angle = (Math.PI * 2 * i) / n;
      const reach = 0.28 + (i % 3) * 0.12;
      this.links.push({
        from: { x: cx, y: cy },
        to: {
          x: cx + Math.cos(angle) * boardRect.width * reach,
          y: cy + Math.sin(angle) * boardRect.height * reach,
        },
        kind: 'field',
      });
    }
    this._rebuildArcs();
  }

  _rebuildArcs() {
    this.arcs = this.links.map((link) => {
      const d = dist(link.from.x, link.from.y, link.to.x, link.to.y);
      const jag = Math.min(18, d * 0.12);
      return {
        points: buildBoltPoints(link.from.x, link.from.y, link.to.x, link.to.y, jag),
        to: link.to,
        kind: link.kind,
      };
    });
  }

  fireBolt(from, to, life = 1) {
    const d = dist(from.x, from.y, to.x, to.y);
    const points = buildBoltPoints(from.x, from.y, to.x, to.y, Math.min(22, d * 0.16));
    const branches = [];
    if (d > 36 && points.length > 4) {
      const bi = Math.floor(points.length * (0.35 + Math.random() * 0.2));
      const br = branchBolt(points, bi, Math.min(22, d * 0.18));
      if (br) branches.push(br);
    }
    this.bolts.push({
      points,
      branches,
      to,
      life,
      maxLife: life,
    });
  }

  _stroke(ctx, points) {
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);
    ctx.stroke();
  }

  _drawBolt(ctx, points, alpha, end) {
    if (points.length < 2 || alpha <= 0.02) return;
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.globalAlpha = alpha * 0.55;
    ctx.strokeStyle = '#7ee7ff';
    ctx.lineWidth = 3.2;
    this._stroke(ctx, points);

    ctx.globalAlpha = alpha;
    ctx.strokeStyle = '#f4fbff';
    ctx.lineWidth = 1.35;
    this._stroke(ctx, points);

    if (end) {
      ctx.globalAlpha = alpha;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(end.x, end.y, 3.2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  _drawFrame(t) {
    const ctx = this.ctx;
    const w = window.innerWidth;
    const h = window.innerHeight;
    ctx.clearRect(0, 0, w, h);

    if (t - this._jitterAt > 70) {
      this._jitterAt = t;
      this._rebuildArcs();
    }

    if (this.focusPoint) {
      const fx = this.focusPoint.x;
      const fy = this.focusPoint.y;
      const grad = ctx.createRadialGradient(fx, fy, 0, fx, fy, 28);
      grad.addColorStop(0, 'rgba(255, 255, 255, 0.85)');
      grad.addColorStop(0.45, 'rgba(140, 220, 255, 0.35)');
      grad.addColorStop(1, 'rgba(140, 220, 255, 0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(fx, fy, 28, 0, Math.PI * 2);
      ctx.fill();
    }

    for (const arc of this.arcs) {
      const flick = arc.kind === 'field' ? 0.4 : 0.34;
      this._drawBolt(ctx, arc.points, flick, arc.to);
    }

    this.bolts = this.bolts.filter((b) => b.life > 0);
    for (const bolt of this.bolts) {
      bolt.life -= 0.045;
      const a = Math.max(0, bolt.life / bolt.maxLife);
      this._drawBolt(ctx, bolt.points, 0.45 + a * 0.55, bolt.to);
      for (const br of bolt.branches) this._drawBolt(ctx, br, a * 0.45);
    }
  }

  startLoop() {
    if (this.running) return;
    this.running = true;
    const tick = (now) => {
      if (!this.running) return;
      this._drawFrame(now);
      this._raf = requestAnimationFrame(tick);
    };
    this._raf = requestAnimationFrame(tick);
  }

  stopLoop() {
    this.running = false;
    if (this._raf) cancelAnimationFrame(this._raf);
    this._raf = null;
  }
}

/** Electric crackle wrapper on a board cell. */
export function electrifyCell(cell) {
  if (!cell || cell.querySelector('.cell-electric')) return;
  const wrap = document.createElement('div');
  wrap.className = 'cell-electric';
  for (let i = 0; i < 4; i++) {
    const arc = document.createElement('div');
    arc.className = 'cell-electric-arc';
    arc.style.setProperty('--rot', `${i * 90 + Math.random() * 30}deg`);
    arc.style.animationDelay = `${i * 0.04}s`;
    wrap.appendChild(arc);
  }
  cell.appendChild(wrap);
  setTimeout(() => wrap.remove(), 380);
}

/** Origin charge burst before bolts fire. */
export function spawnChargeBurst(layer, x, y) {
  const core = document.createElement('div');
  core.className = 'electric-charge-core';
  core.style.left = `${x}px`;
  core.style.top = `${y}px`;
  layer.appendChild(core);

  for (let i = 0; i < 8; i++) {
    const spark = document.createElement('div');
    spark.className = 'electric-charge-spark';
    spark.style.left = `${x}px`;
    spark.style.top = `${y}px`;
    const angle = (Math.PI * 2 * i) / 8;
    spark.style.setProperty('--ex', `${Math.cos(angle) * 28}px`);
    spark.style.setProperty('--ey', `${Math.sin(angle) * 28}px`);
    layer.appendChild(spark);
    setTimeout(() => spark.remove(), 320);
  }

  setTimeout(() => core.remove(), 400);
  return core;
}

export function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
