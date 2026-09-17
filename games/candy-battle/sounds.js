/** Candy Battle audio — loads files when present, synthesizes otherwise. */
export class CandySounds {
  constructor(base = '/candy-battle/assets/sounds') {
    this.base = base;
    this.ctx = null;
    this.cache = new Map();
    this.muted = false;
    this._ready = this._init();
  }

  async _init() {
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    } catch {
      /* no audio */
    }
    const files = {
      swap: 'swap.ogg',
      match: 'match.ogg',
      cascade: 'cascade.ogg',
      projectile: 'click.ogg',
      hit: 'hit.ogg',
      win: 'win.ogg',
      invalid: 'click.ogg',
    };
    await Promise.all(
      Object.entries(files).map(async ([key, file]) => {
        try {
          const res = await fetch(`${this.base}/${file}`);
          if (!res.ok || res.headers.get('content-length') < 100) return;
          const buf = await this.ctx.decodeAudioData(await res.arrayBuffer());
          this.cache.set(key, buf);
        } catch {
          /* use synth */
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

  _synth(name, opts) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.connect(g).connect(this.ctx.destination);
    const v = opts.volume ?? 0.12;

    const presets = {
      swap: { f: 520, f2: 680, dur: 0.08, type: 'sine' },
      match: { f: 880, f2: 1320, dur: 0.12, type: 'triangle' },
      cascade: { f: 660, f2: 990, dur: 0.1, type: 'sine' },
      projectile: { f: 440, f2: 880, dur: 0.06, type: 'square' },
      hit: { f: 180, f2: 90, dur: 0.18, type: 'sawtooth' },
      win: { f: 523, f2: 784, dur: 0.35, type: 'triangle' },
      invalid: { f: 200, f2: 160, dur: 0.07, type: 'square' },
    };
    const p = presets[name] || presets.click;
    osc.type = p.type;
    osc.frequency.setValueAtTime(p.f, t);
    osc.frequency.exponentialRampToValueAtTime(p.f2, t + p.dur);
    g.gain.setValueAtTime(v, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + p.dur);
    osc.start(t);
    osc.stop(t + p.dur + 0.02);
  }
}
