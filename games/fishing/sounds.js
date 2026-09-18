const STORAGE_KEY = 'deep-cast-sound';
const REEL_FILE = 'reel-pro-winding.mp3';

/** Deep Cast audio — real samples when present, synthesizes otherwise. */
export class FishingSounds {
  constructor(manifest) {
    this.base = `${manifest?.baseUrl || '/fishing/assets'}/sounds`;
    this.ctx = null;
    this.cache = new Map();
    this.muted = localStorage.getItem(STORAGE_KEY) === 'off';
    this._ready = this._init();
    this._reelLoop = null;
    this._lureLoop = null;
    this._destroyed = false;
  }

  isMuted() {
    return this.muted;
  }

  setMuted(muted) {
    this.muted = muted;
    localStorage.setItem(STORAGE_KEY, muted ? 'off' : 'on');
    if (muted) {
      this.stopReel();
      this.stopLureIdle();
    }
  }

  toggleMuted() {
    this.setMuted(!this.muted);
    return this.muted;
  }

  async _loadBuffer(file) {
    const res = await fetch(`${this.base}/${file}`);
    if (!res.ok) throw new Error(`missing ${file}`);
    const data = await res.arrayBuffer();
    if (data.byteLength < 256) throw new Error(`empty ${file}`);
    return this.ctx.decodeAudioData(data.slice(0));
  }

  async _init() {
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    } catch {
      return;
    }

    let files = {};
    try {
      const idx = await fetch(`${this.base}/index.json`);
      if (!idx.ok) return;
      files = await idx.json();
    } catch {
      return;
    }

    try {
      const reelBuf = await this._loadBuffer(files.reel || REEL_FILE);
      this.cache.set('reel', reelBuf);
    } catch {
      /* synth fallback during fight */
    }

    await Promise.all(
      Object.entries(files).map(async ([key, file]) => {
        if (key === 'reel' || !file || typeof file !== 'string') return;
        try {
          const buf = await this._loadBuffer(file);
          this.cache.set(key, buf);
        } catch {
          /* synth fallback for this cue */
        }
      })
    );
  }

  async unlock() {
    await this._ready;
    if (this.ctx?.state === 'suspended') await this.ctx.resume();
  }

  destroy() {
    this._destroyed = true;
    this.stopReel();
    this.stopLureIdle();
    this.cache.clear();
    if (this.ctx) {
      this.ctx.close().catch(() => {});
      this.ctx = null;
    }
  }

  play(name, opts = {}) {
    if (this.muted || this._destroyed) return;
    this._ready.then(async () => {
      if (this._destroyed) return;
      await this.unlock();
      const buf = this.cache.get(name);
      if (buf && this.ctx) {
        this._playBuffer(buf, opts);
        return;
      }
      this._synth(name, opts);
    });
  }

  _playBuffer(buf, opts = {}) {
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    if (opts.rate) src.playbackRate.value = opts.rate;
    if (opts.loop) src.loop = true;

    const g = this.ctx.createGain();
    g.gain.value = opts.volume ?? 0.45;
    src.connect(g).connect(this.ctx.destination);

    const offset = Math.max(0, opts.offset || 0);
    const dur = opts.duration && opts.duration > 0 ? opts.duration : undefined;
    src.start(0, offset, dur);
    return { src, g };
  }

  /** Continuous pro reel — runs for the whole fight until catch or snap. */
  async startReel() {
    if (this.muted || this._reelLoop) return;
    await this._ready;
    await this.unlock();

    const buf = this.cache.get('reel');
    if (buf && this.ctx) {
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      src.playbackRate.value = 1.15;
      const g = this.ctx.createGain();
      g.gain.value = 2.6;
      src.connect(g).connect(this.ctx.destination);
      src.start(0);
      this._reelLoop = { src, g };
    }
  }

  stopReel() {
    if (!this._reelLoop || !this.ctx) {
      this._reelLoop = null;
      return;
    }

    const { src, g } = this._reelLoop;
    const t = this.ctx.currentTime;
    g.gain.cancelScheduledValues(t);
    g.gain.setValueAtTime(g.gain.value, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.07);
    setTimeout(() => {
      try {
        src.stop();
      } catch {
        /* already stopped */
      }
      this._reelLoop = null;
    }, 80);
  }

  /** Gentle lure-in-water ambience while waiting for a bite. */
  startLureIdle() {
    if (this.muted || this._lureLoop) return;
    this._ready.then(async () => {
      await this.unlock();
      const buf = this.cache.get('lure') || this.cache.get('splash');
      if (!buf || !this.ctx) return;
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      src.playbackRate.value = 0.72;
      const g = this.ctx.createGain();
      g.gain.value = 0.08;
      src.connect(g).connect(this.ctx.destination);
      src.start(0, 0.15);
      this._lureLoop = { src, g };
    });
  }

  stopLureIdle() {
    if (!this._lureLoop || !this.ctx) return;
    const { src, g } = this._lureLoop;
    const t = this.ctx.currentTime;
    g.gain.cancelScheduledValues(t);
    g.gain.setValueAtTime(g.gain.value, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
    setTimeout(() => {
      try {
        src.stop();
      } catch {
        /* already stopped */
      }
      this._lureLoop = null;
    }, 130);
  }

  _synth(name, opts) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.connect(g).connect(this.ctx.destination);
    const v = opts.volume ?? 0.14;

    const presets = {
      cast: { f: 420, f2: 260, dur: 0.14, type: 'triangle' },
      lure: { f: 180, f2: 90, dur: 0.25, type: 'sine' },
      splash: { f: 180, f2: 90, dur: 0.2, type: 'sine' },
      bite: { f: 520, f2: 880, dur: 0.16, type: 'square' },
      catch: { f: 523, f2: 784, dur: 0.32, type: 'triangle' },
      catchRare: { f: 440, f2: 988, dur: 0.45, type: 'triangle' },
      escape: { f: 280, f2: 180, dur: 0.24, type: 'sine' },
      snap: { f: 120, f2: 60, dur: 0.28, type: 'sawtooth' },
      buy: { f: 660, f2: 880, dur: 0.12, type: 'sine' },
      select: { f: 740, f2: 920, dur: 0.07, type: 'sine' },
      click: { f: 600, f2: 720, dur: 0.05, type: 'sine' },
    };
    const p = presets[name] || presets.click;
    osc.type = p.type;
    osc.frequency.setValueAtTime(p.f, t);
    osc.frequency.exponentialRampToValueAtTime(Math.max(40, p.f2), t + p.dur);
    g.gain.setValueAtTime(v, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + p.dur);
    osc.start(t);
    osc.stop(t + p.dur + 0.02);
  }
}
