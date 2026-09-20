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
  const angle = Math.random() * Math.PI * 2;
  return buildBoltPoints(
    p.x,
    p.y,
    p.x + Math.cos(angle) * length,
    p.y + Math.sin(angle) * length,
    length * 0.35,
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
    this.running = false;
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
    this.arcs = targetPoints.map((to) => {
      const d = dist(from.x, from.y, to.x, to.y);
      return buildBoltPoints(from.x, from.y, to.x, to.y, Math.min(48, d * 0.2));
    });
  }

  fireBolt(from, to, life = 1) {
    const d = dist(from.x, from.y, to.x, to.y);
    const points = buildBoltPoints(from.x, from.y, to.x, to.y, Math.min(72, d * 0.28));
    const branches = [];
    if (Math.random() < 0.65 && points.length > 4) {
      const bi = Math.floor(points.length * (0.25 + Math.random() * 0.35));
      const br = branchBolt(points, bi, d * (0.12 + Math.random() * 0.12));
      if (br) branches.push(br);
    }
    this.bolts.push({
      points,
      branches,
      life,
      maxLife: life,
      flicker: Math.random() * Math.PI * 2,
    });
  }

  _drawBolt(ctx, points, alpha) {
    if (points.length < 2) return;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    ctx.shadowBlur = 28;
    ctx.shadowColor = 'rgba(140, 230, 255, 0.98)';
    ctx.strokeStyle = 'rgba(200, 245, 255, 0.65)';
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);
    ctx.stroke();

    ctx.shadowBlur = 14;
    ctx.shadowColor = '#ffffff';
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.98)';
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);
    ctx.stroke();

    ctx.shadowBlur = 0;
    ctx.strokeStyle = 'rgba(220, 245, 255, 1)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);
    ctx.stroke();
    ctx.restore();
  }

  _drawFrame(t) {
    const ctx = this.ctx;
    const w = window.innerWidth;
    const h = window.innerHeight;
    ctx.clearRect(0, 0, w, h);

    const pulse = 0.5 + Math.sin(t * 0.055) * 0.22;
    if (this.focusPoint) {
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      const fx = this.focusPoint.x;
      const fy = this.focusPoint.y;
      const grad = ctx.createRadialGradient(fx, fy, 0, fx, fy, 72);
      grad.addColorStop(0, `rgba(255, 255, 255, ${0.2 * pulse})`);
      grad.addColorStop(0.35, `rgba(160, 230, 255, ${0.08 * pulse})`);
      grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);
      ctx.restore();
    }

    this.arcs.forEach((arc, i) => {
      const flick = 0.28 + Math.abs(Math.sin(t * 0.06 + i * 2.1)) * 0.52;
      if (Math.random() < 0.88) this._drawBolt(ctx, arc, flick);
    });

    this.bolts = this.bolts.filter((b) => b.life > 0);
    for (const bolt of this.bolts) {
      bolt.life -= 0.04;
      bolt.flicker += 0.6;
      const a = Math.min(1, bolt.life / bolt.maxLife) * (0.65 + Math.abs(Math.sin(bolt.flicker)) * 0.35);
      this._drawBolt(ctx, bolt.points, a);
      for (const br of bolt.branches) this._drawBolt(ctx, br, a * 0.7);
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
