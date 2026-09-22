import { comboWord } from './combo-words.js';
import { ElectricField, spawnChargeBurst, electrifyCell, sleep as fxSleep } from './electric-fx.js';

export class BoardAnimator {
  constructor(boardEl, manifest, sounds) {
    this.board = boardEl;
    this.manifest = manifest;
    this.sounds = sounds;
    this.fxLayer = document.getElementById('fx-layer');
    this.comboLayer = document.getElementById('combo-layer');
    this._destroyed = false;
    this._pendingTimers = new Set();
  }

  destroy() {
    this._destroyed = true;
    if (this._drag) {
      this._dropLifted([this._drag, this._drag.neighbor]);
      this._drag = null;
    }
    this.releaseSwapHold();
    this._electricField?.destroy();
    this._electricField = null;
    for (const id of this._pendingTimers) clearTimeout(id);
    this._pendingTimers.clear();
    this.fxLayer?.replaceChildren();
    this.comboLayer?.replaceChildren();
  }

  _later(fn, ms) {
    if (this._destroyed) return null;
    const id = setTimeout(() => {
      this._pendingTimers.delete(id);
      if (!this._destroyed) fn();
    }, ms);
    this._pendingTimers.add(id);
    return id;
  }

  cellCenter(r, c) {
    const el = this.board.querySelector(`[data-r="${r}"][data-c="${c}"]`);
    if (!el) return { x: 0, y: 0 };
    const rect = el.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  }

  _cellSize() {
    const cell = this.board.querySelector('.cell');
    if (!cell) return { w: 48, h: 48, size: 48, gap: 3 };
    const rect = cell.getBoundingClientRect();
    const boardStyle = getComputedStyle(this.board);
    const gap = parseFloat(boardStyle.gap) || 3;
    return { w: rect.width, h: rect.height, size: Math.max(rect.width, rect.height), gap };
  }

  _cellLocal(r, c, boardRect) {
    const pt = this.cellCenter(r, c);
    return { x: pt.x - boardRect.left, y: pt.y - boardRect.top };
  }

  /** One fixed overlay per FX wave — matches electric field coordinate space. */
  _beginBoardFxWave() {
    if (!this.fxLayer) return null;
    const boardRect = this.board.getBoundingClientRect();
    const cell = this._cellSize();
    const anchor = document.createElement('div');
    anchor.className = 'board-fx-anchor';
    anchor.style.left = `${boardRect.left}px`;
    anchor.style.top = `${boardRect.top}px`;
    anchor.style.width = `${boardRect.width}px`;
    anchor.style.height = `${boardRect.height}px`;
    anchor.style.setProperty('--cell-size', `${cell.size}px`);
    anchor.style.setProperty('--ring-scale', `${(cell.size * 3.2) / 24}`);
    this.fxLayer.appendChild(anchor);
    return { anchor, boardRect, cell };
  }

  _pulseCells(cells, className, ms = 480) {
    const els = cells
      .map(({ r, c }) => this.board.querySelector(`[data-r="${r}"][data-c="${c}"]`))
      .filter(Boolean);
    els.forEach((el) => el.classList.add(className));
    this._later(() => els.forEach((el) => el.classList.remove(className)), ms);
    return els;
  }

  _cellsInRow(row) {
    return [...this.board.querySelectorAll(`[data-r="${row}"]`)].map((el) => ({
      r: Number(el.dataset.r),
      c: Number(el.dataset.c),
    }));
  }

  _cellsInCol(col) {
    return [...this.board.querySelectorAll(`[data-c="${col}"]`)].map((el) => ({
      r: Number(el.dataset.r),
      c: Number(el.dataset.c),
    }));
  }

  _cellsInArea(row, col, radius = 1) {
    const out = [];
    for (let r = row - radius; r <= row + radius; r++) {
      for (let c = col - radius; c <= col + radius; c++) {
        if (this.board.querySelector(`[data-r="${r}"][data-c="${c}"]`)) out.push({ r, c });
      }
    }
    return out;
  }

  _slotRect(r, c) {
    const cell = this.board.querySelector(`[data-r="${r}"][data-c="${c}"]`);
    if (!cell) return null;
    const cellRect = cell.getBoundingClientRect();
    const width = cellRect.width * 0.92;
    const height = cellRect.height * 0.92;
    return {
      left: cellRect.left + (cellRect.width - width) / 2,
      top: cellRect.top + (cellRect.height - height) / 2,
      width,
      height,
    };
  }

  _liftPiece(r, c, z) {
    const piece = this.board.querySelector(`[data-r="${r}"][data-c="${c}"] .piece`);
    const rect = this._slotRect(r, c);
    if (!piece || !rect || !this.fxLayer) return null;
    const ghost = piece.cloneNode(true);
    ghost.classList.add('piece-swap-ghost');
    ghost.style.animation = 'none';
    ghost.style.position = 'fixed';
    ghost.style.left = `${rect.left}px`;
    ghost.style.top = `${rect.top}px`;
    ghost.style.width = `${rect.width}px`;
    ghost.style.height = `${rect.height}px`;
    ghost.style.margin = '0';
    ghost.style.zIndex = String(z);
    ghost.style.pointerEvents = 'none';
    ghost.style.transform = 'scale(1)';
    ghost.style.transition = 'none';
    this.fxLayer.appendChild(ghost);
    piece.style.visibility = 'hidden';
    return { piece, ghost, rect };
  }

  _place(ghost, left, top, scale) {
    ghost.getAnimations().forEach((anim) => anim.cancel());
    ghost.style.transition = 'none';
    ghost.style.left = `${left}px`;
    ghost.style.top = `${top}px`;
    ghost.style.transform = `scale(${scale})`;
  }

  async _glide(ghost, left, top, scale, ms) {
    if (!ghost?.isConnected) return;
    const fromLeft = ghost.style.left || '0px';
    const fromTop = ghost.style.top || '0px';
    const fromScale = /scale\(([^)]+)\)/.exec(ghost.style.transform)?.[1] || '1';
    ghost.style.transition = 'none';
    ghost.getAnimations().forEach((anim) => anim.cancel());
    const anim = ghost.animate(
      [
        { left: fromLeft, top: fromTop, transform: `scale(${fromScale})` },
        { left: `${left}px`, top: `${top}px`, transform: `scale(${scale})` },
      ],
      { duration: ms, easing: 'cubic-bezier(0.33, 0, 0.2, 1)', fill: 'forwards' },
    );
    try {
      await anim.finished;
    } catch (_) {
      return;
    }
    if (!ghost.isConnected) return;
    ghost.style.left = `${left}px`;
    ghost.style.top = `${top}px`;
    ghost.style.transform = `scale(${scale})`;
    anim.cancel();
  }

  grabPiece(r, c) {
    if (this._drag || this._motionLock) return false;
    const lifted = this._liftPiece(r, c, 8);
    if (!lifted) return false;
    this._drag = { ...lifted, r, c, neighbor: null };
    return true;
  }

  dragPiece(dx, dy) {
    const d = this._drag;
    if (!d) return;
    const stride = this._stride();
    const horizontal = Math.abs(dx) >= Math.abs(dy);
    const ox = horizontal ? clamp(dx, -stride.x, stride.x) : 0;
    const oy = horizontal ? 0 : clamp(dy, -stride.y, stride.y);
    this._place(d.ghost, d.rect.left + ox, d.rect.top + oy, 1.05);
    const stepC = !horizontal ? 0 : ox > 8 ? 1 : ox < -8 ? -1 : 0;
    const stepR = horizontal ? 0 : oy > 8 ? 1 : oy < -8 ? -1 : 0;
    this._setDragNeighbor(d, d.r + stepR, d.c + stepC, -ox, -oy);
  }

  _stride() {
    const a = this.board.querySelector('[data-r="0"][data-c="0"]')?.getBoundingClientRect();
    const b = this.board.querySelector('[data-r="0"][data-c="1"]')?.getBoundingClientRect();
    const c = this.board.querySelector('[data-r="1"][data-c="0"]')?.getBoundingClientRect();
    return {
      x: a && b ? b.left - a.left : 52,
      y: a && c ? c.top - a.top : 52,
    };
  }

  inputLocked() {
    return !!(this._motionLock || this._drag);
  }

  _setDragNeighbor(d, r, c, ox, oy) {
    if (r === d.r && c === d.c) {
      if (d.neighbor) {
        const old = d.neighbor;
        d.neighbor = null;
        this._glide(old.ghost, old.rect.left, old.rect.top, 1, 140).then(() => {
          if (this._drag?.neighbor !== old) this._dropLifted([old]);
        });
      }
      return;
    }
    const same = d.neighbor && d.neighbor.r === r && d.neighbor.c === c;
    if (!same && d.neighbor) {
      const old = d.neighbor;
      d.neighbor = null;
      this._glide(old.ghost, old.rect.left, old.rect.top, 1, 140).then(() => {
        if (this._drag?.neighbor !== old) this._dropLifted([old]);
      });
    }
    const slot = this._slotRect(r, c);
    const hasPiece = this.board.querySelector(`[data-r="${r}"][data-c="${c}"] .piece`);
    if (!slot || !hasPiece) return;
    if (!d.neighbor) {
      const lifted = this._liftPiece(r, c, 7);
      if (!lifted) return;
      d.neighbor = { ...lifted, r, c };
    }
    this._place(d.neighbor.ghost, d.neighbor.rect.left + ox, d.neighbor.rect.top + oy, 1);
  }

  async cancelDrag(playInvalid = false) {
    const d = this._drag;
    if (!d) return;
    this._drag = null;
    this._motionLock = true;
    try {
      const moved = Math.hypot(
        (parseFloat(d.ghost.style.left) || d.rect.left) - d.rect.left,
        (parseFloat(d.ghost.style.top) || d.rect.top) - d.rect.top,
      );
      if (moved < 3 && !d.neighbor) {
        this._dropLifted([d]);
        return;
      }
      if (playInvalid) this.sounds?.play('invalid');
      await Promise.all([
        this._glide(d.ghost, d.rect.left, d.rect.top, 1, 230),
        d.neighbor ? this._glide(d.neighbor.ghost, d.neighbor.rect.left, d.neighbor.rect.top, 1, 230) : null,
      ].filter(Boolean));
      this._dropLifted([d, d.neighbor]);
    } finally {
      this._motionLock = false;
    }
  }

  /** Finish a finger swipe into the neighbor cell. Ghosts stay until releaseSwapHold. */
  async finishDrag(r1, c1) {
    const d = this._drag;
    if (!d) return false;
    this._drag = null;
    this._motionLock = true;
    try {
      const target = this._slotRect(r1, c1);
      if (!target) {
        await this._glide(d.ghost, d.rect.left, d.rect.top, 1, 180);
        this._dropLifted([d, d.neighbor]);
        return false;
      }
      if (!d.neighbor || d.neighbor.r !== r1 || d.neighbor.c !== c1) {
        if (d.neighbor) {
          const old = d.neighbor;
          d.neighbor = null;
          await this._glide(old.ghost, old.rect.left, old.rect.top, 1, 100);
          this._dropLifted([old]);
        }
        const lifted = this._liftPiece(r1, c1, 7);
        if (lifted) d.neighbor = { ...lifted, r: r1, c: c1 };
      }
      this.sounds?.play('swap');
      await Promise.all([
        this._glide(d.ghost, target.left, target.top, 1.04, 150),
        d.neighbor ? this._glide(d.neighbor.ghost, d.rect.left, d.rect.top, 1, 150) : null,
      ].filter(Boolean));
      this._swapHold = [d, d.neighbor].filter(Boolean);
      return true;
    } finally {
      this._motionLock = false;
    }
  }

  _dropLifted(items) {
    for (const item of items) {
      if (!item) continue;
      item.ghost.remove();
      if (item.piece.isConnected) item.piece.style.visibility = '';
    }
  }

  /** Slide both candies into each other's cells and hold them there until releaseSwapHold. */
  async swapAnimate(r0, c0, r1, c1) {
    if (this._destroyed) return;
    this.releaseSwapHold();
    const a = this._liftPiece(r0, c0, 8);
    const b = this._liftPiece(r1, c1, 7);
    if (!a || !b) {
      this._dropLifted([a, b]);
      return;
    }
    this.sounds?.play('swap');
    await Promise.all([
      this._glide(a.ghost, b.rect.left, b.rect.top, 1.04, 230),
      this._glide(b.ghost, a.rect.left, a.rect.top, 1, 230),
    ]);
    this._swapHold = [a, b];
  }

  releaseSwapHold() {
    if (!this._swapHold) return;
    this._dropLifted(this._swapHold);
    this._swapHold = null;
  }

  async invalidSwap(r0, c0, r1, c1) {
    if (this._destroyed) return;
    this.releaseSwapHold();
    const a = this._liftPiece(r0, c0, 8);
    const b = this._liftPiece(r1, c1, 7);
    if (!a || !b) {
      this._dropLifted([a, b]);
      return;
    }
    this.sounds?.play('swap');
    await Promise.all([
      this._glide(a.ghost, b.rect.left, b.rect.top, 1.03, 170),
      this._glide(b.ghost, a.rect.left, a.rect.top, 1, 170),
    ]);
    this.sounds?.play('invalid');
    await sleep(70);
    await Promise.all([
      this._glide(a.ghost, a.rect.left, a.rect.top, 1, 240),
      this._glide(b.ghost, b.rect.left, b.rect.top, 1, 240),
    ]);
    this._dropLifted([a, b]);
  }

  async popCells(cells, comboIndex) {
    const frames = this.manifest.explosion;
    let popped = 0;
    for (const { r, c } of cells) {
      if (this._popCell(r, c, frames, 'any')) popped++;
    }
    if (!popped) return;
    this.sounds?.play(comboIndex > 1 ? 'cascade' : 'match', { volume: 0.4 + comboIndex * 0.06 });
    await sleep(280);
  }

  _popCell(r, c, frames, which = 'any') {
    const cell = this.board.querySelector(`[data-r="${r}"][data-c="${c}"]`);
    const img = cell?.querySelector('.piece');
    if (!cell || !img || img.classList.contains('piece-pop')) return false;
    const special = img.classList.contains('piece-dynamite')
      || img.classList.contains('piece-rocket')
      || img.classList.contains('piece-color-bomb');
    if (which === 'special' && !special) return false;
    if (which === 'normal' && special) return false;
    img.classList.add('piece-pop');
    this._explosionAt(cell, frames);
    return true;
  }

  _pieceAt(r, c) {
    return this.board.querySelector(`[data-r="${r}"][data-c="${c}"]`)?.querySelector('.piece');
  }

  /** Pop candies this blast actually finishes. Leave specials that still have their own step. */
  _popBlastedCells(fx, frames) {
    for (const cell of this._cellsForEffect(fx)) {
      const img = this._pieceAt(cell.r, cell.c);
      if (!img || img.classList.contains('piece-pop')) continue;
      const dynamite = img.classList.contains('piece-dynamite');
      const rocketH = img.classList.contains('rocket-h');
      const rocketV = img.classList.contains('rocket-v');
      const isOrigin = fx.kind === 'dynamite' && cell.r === fx.row && cell.c === fx.col;
      let keep = false;
      if (fx.kind === 'rowBlast') keep = dynamite || rocketV;
      else if (fx.kind === 'colBlast') keep = dynamite || rocketH;
      else if (fx.kind === 'dynamite') keep = !isOrigin && (dynamite || rocketH || rocketV);
      if (keep) continue;
      this._popCell(cell.r, cell.c, frames, 'any');
    }
  }

  _cellsForEffect(fx) {
    if (fx.kind === 'rowBlast') return this._cellsInRow(fx.row);
    if (fx.kind === 'colBlast') return this._cellsInCol(fx.col);
    if (fx.kind === 'dynamite') return this._cellsInArea(fx.row, fx.col, fx.big ? 2 : 1);
    if (fx.kind === 'colorWipe') return fx.wiped || [];
    return [];
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
        this._later(tick, 40);
      } else boom.remove();
    };
    this._later(tick, 40);
  }

  /** Color ball — lightning connects ONLY to same-color targets from fx.wiped. */
  async colorBombLightning(wipedCells, _color, origin) {
    if (!this.fxLayer || !wipedCells?.length) return;

    const from = origin
      ? this.cellCenter(origin.r, origin.c)
      : this.cellCenter(wipedCells[0].r, wipedCells[0].c);

    const originKey = origin ? `${origin.r},${origin.c}` : null;
    const targets = wipedCells.filter(({ r, c }) => {
      if (originKey && `${r},${c}` === originKey) return false;
      return this.board.querySelector(`[data-r="${r}"][data-c="${c}"]`);
    });

    if (!targets.length) return;

    const targetPoints = targets.map(({ r, c }) => ({
      r,
      c,
      ...this.cellCenter(r, c),
    }));
    targetPoints.sort(
      (a, b) =>
        Math.hypot(a.x - from.x, a.y - from.y) - Math.hypot(b.x - from.x, b.y - from.y),
    );

    this._electricField?.destroy();
    const field = new ElectricField(this.fxLayer, from);
    this._electricField = field;
    field.spawnTargetArcs(
      from,
      targetPoints.map((p) => ({ x: p.x, y: p.y })),
    );
    field.startLoop();

    const flash = document.createElement('div');
    flash.className = 'electric-screen-flash';
    flash.style.setProperty('--flash-x', `${(from.x / window.innerWidth) * 100}%`);
    flash.style.setProperty('--flash-y', `${(from.y / window.innerHeight) * 100}%`);
    this.fxLayer.appendChild(flash);

    spawnChargeBurst(this.fxLayer, from.x, from.y);
    const bombEl = origin
      ? this.board
          .querySelector(`[data-r="${origin.r}"][data-c="${origin.c}"]`)
          ?.querySelector('.piece-color-bomb')
      : null;
    bombEl?.classList.add('color-bomb-charging');

    this.sounds?.play('cascade', { volume: 0.5 });
    await fxSleep(180);

    const batchSize = targetPoints.length > 14 ? 2 : 1;
    for (let i = 0; i < targetPoints.length; i += batchSize) {
      const batch = targetPoints.slice(i, i + batchSize);
      for (const { r, c, x, y } of batch) {
        field.fireBolt(from, { x, y }, 0.95);
        electrifyCell(this.board.querySelector(`[data-r="${r}"][data-c="${c}"]`));
      }
      await fxSleep(targetPoints.length > 10 ? 42 : 56);
    }

    await fxSleep(220);
    field.stopLoop();
    field.destroy();
    if (this._electricField === field) this._electricField = null;
    flash.remove();
    bombEl?.classList.remove('color-bomb-charging');
  }

  async colorBombMega(cells, origin) {
    if (!this.fxLayer) return;
    const boardRect = this.board.getBoundingClientRect();
    const cx = boardRect.left + boardRect.width / 2;
    const cy = boardRect.top + boardRect.height / 2;

    this._electricField?.destroy();
    const field = new ElectricField(this.fxLayer);
    this._electricField = field;
    field.spawnFieldArcs(boardRect, 48);
    field.startLoop();

    const flash = document.createElement('div');
    flash.className = 'electric-screen-flash mega';
    this.fxLayer.appendChild(flash);

    spawnChargeBurst(this.fxLayer, cx, cy);
    this.sounds?.play('cascade', { volume: 0.65 });

    for (let wave = 0; wave < 4; wave++) {
      for (let i = 0; i < 12; i++) {
        const tx = boardRect.left + Math.random() * boardRect.width;
        const ty = boardRect.top + Math.random() * boardRect.height;
        field.fireBolt({ x: cx, y: cy }, { x: tx, y: ty }, 1);
      }
      await fxSleep(90);
    }

    for (const { r, c } of cells) {
      electrifyCell(this.board.querySelector(`[data-r="${r}"][data-c="${c}"]`));
    }

    await fxSleep(550);
    field.stopLoop();
    field.destroy();
    if (this._electricField === field) this._electricField = null;
    flash.remove();
  }

  /** Rocket — laser sweep locked to the exact board row/column. */
  _spawnRowColBlast(row, col, isRow, ctx) {
    const { anchor, boardRect, cell } = ctx;
    const cs = cell.size;
    const hitCells = isRow ? this._cellsInRow(row) : this._cellsInCol(col);
    this._pulseCells(hitCells, isRow ? 'cell-row-blast' : 'cell-col-blast');

    const track = document.createElement('div');
    track.className = isRow ? 'rocket-track-h' : 'rocket-track-v';
    if (isRow) {
      const mid = this._cellLocal(row, Math.floor(hitCells.length / 2), boardRect);
      track.style.top = `${mid.y - cs * 0.45}px`;
      track.style.height = `${cs * 0.9}px`;
    } else {
      const mid = this._cellLocal(Math.floor(hitCells.length / 2), col, boardRect);
      track.style.left = `${mid.x - cs * 0.45}px`;
      track.style.width = `${cs * 0.9}px`;
    }
    anchor.appendChild(track);

    const rocket = document.createElement('img');
    rocket.className = 'rocket-sweep';
    rocket.style.width = rocket.style.height = `${cs * 1.15}px`;
    rocket.src = isRow ? this.manifest.special?.rocketH : this.manifest.special?.rocketV;
    rocket.alt = '';
    track.appendChild(rocket);

    const beam = document.createElement('div');
    beam.className = isRow ? 'laser-row' : 'laser-col';
    const trail = document.createElement('div');
    trail.className = isRow ? 'laser-trail-h' : 'laser-trail-v';

    if (isRow) {
      const y = this._cellLocal(row, 0, boardRect).y;
      beam.style.top = `${y - 3}px`;
      beam.style.height = `${Math.max(4, cs * 0.12)}px`;
      trail.style.top = `${y - cs * 0.22}px`;
      trail.style.height = `${cs * 0.45}px`;
    } else {
      const x = this._cellLocal(0, col, boardRect).x;
      beam.style.left = `${x - 3}px`;
      beam.style.width = `${Math.max(4, cs * 0.12)}px`;
      trail.style.left = `${x - cs * 0.22}px`;
      trail.style.width = `${cs * 0.45}px`;
    }

    anchor.appendChild(trail);
    anchor.appendChild(beam);
  }

  /** Dynamite — flash + shockwave sized to the 3×3 blast area. */
  _spawnDynamiteBlast(row, col, big, ctx) {
    const { anchor, boardRect, cell } = ctx;
    const cs = cell.size;
    const radius = big ? 2 : 1;
    const { x, y } = this._cellLocal(row, col, boardRect);
    const hitCells = this._cellsInArea(row, col, radius);
    this._pulseCells(hitCells, 'cell-area-blast', big ? 620 : 500);

    anchor.style.setProperty('--ring-scale', `${(cs * (radius * 2 + 1.1)) / 24}`);

    const flash = document.createElement('div');
    flash.className = `dynamite-flash${big ? ' big' : ''}`;
    flash.style.left = `${x}px`;
    flash.style.top = `${y}px`;
    anchor.appendChild(flash);

    const ring = document.createElement('div');
    ring.className = `dynamite-shockwave${big ? ' big' : ''}`;
    ring.style.left = `${x}px`;
    ring.style.top = `${y}px`;
    anchor.appendChild(ring);

    const smoke = document.createElement('div');
    smoke.className = 'dynamite-smoke';
    smoke.style.left = `${x}px`;
    smoke.style.top = `${y}px`;
    anchor.appendChild(smoke);

    const count = big ? 22 : 14;
    const distBase = cs * (big ? 1.35 : 0.95);
    for (let i = 0; i < count; i++) {
      const debris = document.createElement('div');
      debris.className = 'dynamite-debris';
      debris.style.left = `${x}px`;
      debris.style.top = `${y}px`;
      const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.4;
      const dist = distBase + Math.random() * cs * 0.55;
      debris.style.setProperty('--dx', `${Math.cos(angle) * dist}px`);
      debris.style.setProperty('--dy', `${Math.sin(angle) * dist}px`);
      debris.style.setProperty('--rot', `${Math.random() * 720 - 360}deg`);
      anchor.appendChild(debris);
    }
  }

  async playEffects(effects, cells) {
    const ordered = [...effects].sort(
      (a, b) => (a.step ?? 0) - (b.step ?? 0) || (a.row ?? a.origin?.r ?? 0) - (b.row ?? b.origin?.r ?? 0) || (a.col ?? a.origin?.c ?? 0) - (b.col ?? b.origin?.c ?? 0),
    );
    for (const fx of ordered) {
      await this._playOneEffect(fx, cells);
    }
  }

  /** Finish one blast completely before the next special it hit begins. */
  async _playOneEffect(fx, cells) {
    const frames = this.manifest.explosion;
    if (fx.kind === 'colorWipe' && fx.wiped?.length) {
      await this.colorBombLightning(fx.wiped, fx.color, fx.origin);
      for (const cell of fx.wiped) this._popCell(cell.r, cell.c, frames, 'normal');
      this._popCell(fx.origin?.r, fx.origin?.c, frames, 'special');
      return;
    }
    if (fx.kind === 'colorBombDouble') {
      await this.colorBombMega(cells, fx.origin);
      return;
    }

    const ctx = this._beginBoardFxWave();
    if (!ctx) return;
    if (fx.kind === 'dynamite') {
      this._spawnDynamiteBlast(fx.row, fx.col, fx.big, ctx);
      this.sounds?.play('match', { volume: fx.big ? 0.5 : 0.42 });
    } else if (fx.kind === 'rowBlast') {
      this._spawnRowColBlast(fx.row, 0, true, ctx);
      this.sounds?.play('projectile', { volume: 0.42 });
    } else if (fx.kind === 'colBlast') {
      this._spawnRowColBlast(0, fx.col, false, ctx);
      this.sounds?.play('projectile', { volume: 0.42 });
    } else {
      ctx.anchor.remove();
      return;
    }
    this._popBlastedCells(fx, frames);
    await fxSleep(fx.kind === 'dynamite' ? 480 : 420);
    ctx.anchor.remove();
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

  async fallMoves(moves) {
    if (!moves.length) return;
    const top = this.board.querySelector('[data-r="0"][data-c="0"]');
    const below = this.board.querySelector('[data-r="1"][data-c="0"]');
    const stride = top && below
      ? below.getBoundingClientRect().top - top.getBoundingClientRect().top
      : 48;
    let maxDur = 0;
    const falling = [];
    for (const mv of moves) {
      const cell = this.board.querySelector(`[data-r="${mv.toR}"][data-c="${mv.toC}"]`);
      const img = cell?.querySelector('.piece');
      if (!img || !cell) continue;
      const cells = Math.max(1, mv.spawn ? mv.toR + 1 : mv.toR - mv.fromR);
      const dur = 0.2 + cells * 0.04;
      maxDur = Math.max(maxDur, dur);
      cell.style.overflow = 'visible';
      cell.style.zIndex = '4';
      img.style.animation = 'none';
      img.style.transition = 'none';
      img.style.transform = `translateY(${-cells * stride}px)`;
      falling.push({ cell, img, dur });
    }
    void this.board.offsetWidth;
    for (const item of falling) {
      item.img.style.transition = `transform ${item.dur}s cubic-bezier(0.2, 0.75, 0.2, 1)`;
      item.img.style.transform = 'translateY(0px)';
    }
    await sleep(maxDur * 1000 + 40);
    for (const item of falling) {
      item.cell.style.overflow = '';
      item.cell.style.zIndex = '';
      item.img.style.transition = '';
      item.img.style.transform = '';
      item.img.style.animation = '';
      item.img.classList.add('piece-land');
    }
    await sleep(180);
    this.board.querySelectorAll('.piece-land').forEach((img) => img.classList.remove('piece-land'));
  }
}

function sleep(ms) {
  return fxSleep(ms);
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}
