const STORAGE_KEY = 'deep-cast-sound';

/** Deep Cast audio — loads OGG files when present, synthesizes otherwise. */
export class FishingSounds {
  constructor(manifest) {
    this.base = `${manifest?.baseUrl || '/fishing/assets'}/sounds`;
    this.ctx = null;
    this.cache = new Map();
    this.muted = localStorage.getItem(STORAGE_KEY) === 'off';
    this._ready = this._init();
    this._reelTimer = null;
  }

  isMuted() {
    return this.muted;
  }

  setMuted(muted) {
    this.muted = muted;
    localStorage.setItem(STORAGE_KEY, muted ? 'off' : 'on');
    if (muted) this.stopReel();
  }

  toggleMuted() {
    this.setMuted(!this.muted);
    return this.muted;
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

    await Promise.all(
      Object.entries(files).map(async ([key, file]) => {
        if (!file || typeof file !== 'string') return;
        try {
          const res = await fetch(`${this.base}/${file}`);
          if (!res.ok) return;
          const buf = await this.ctx.decodeAudioData(await res.arrayBuffer());
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

  play(name, opts = {}) {
    if (this.muted) return;
    this._ready.then(() => {
      const buf = this.cache.get(name);
      if (buf && this.ctx) {
        const src = this.ctx.createBufferSource();
        src.buffer = buf;
        const g = this.ctx.createGain();
        g.gain.value = opts.volume ?? 0.45;
        src.connect(g).connect(this.ctx.destination);
        src.start(0);
        return;
      }
      this._synth(name, opts);
    });
  }

  startReel() {
    if (this.muted) return;
    this.stopReel();
    this.play('reel', { volume: 0.22 });
    this._reelTimer = setInterval(() => this.play('reel', { volume: 0.18 }), 280);
  }

  stopReel() {
    if (this._reelTimer) {
      clearInterval(this._reelTimer);
      this._reelTimer = null;
    }
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
      splash: { f: 180, f2: 90, dur: 0.2, type: 'sine' },
      bite: { f: 520, f2: 880, dur: 0.16, type: 'square' },
      fight: { f: 220, f2: 330, dur: 0.22, type: 'sawtooth' },
      reel: { f: 140, f2: 165, dur: 0.08, type: 'triangle' },
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
