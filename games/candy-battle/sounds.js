const STORAGE_KEY = 'candy-battle-sound';

/** Soft, action-specific Candy Battle effects. Procedural so each action has its own voice. */
export class CandySounds {
  constructor() {
    this.ctx = null;
    this.bus = null;
    this.muted = localStorage.getItem(STORAGE_KEY) === 'off';
    this._noiseBuf = null;
    this._ready = this._init();
    this._destroyed = false;
  }

  isMuted() {
    return this.muted;
  }

  setMuted(muted) {
    this.muted = muted;
    localStorage.setItem(STORAGE_KEY, muted ? 'off' : 'on');
  }

  toggleMuted() {
    this.setMuted(!this.muted);
    return this.muted;
  }

  async _init() {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const bus = ctx.createGain();
      bus.gain.value = 0.85;
      bus.connect(ctx.destination);
      this.ctx = ctx;
      this.bus = bus;
    } catch {
      /* no audio */
    }
  }

  async unlock() {
    await this._ready;
    if (this.ctx?.state === 'suspended') await this.ctx.resume();
  }

  destroy() {
    this._destroyed = true;
    if (this.ctx) {
      this.ctx.close().catch(() => {});
      this.ctx = null;
      this.bus = null;
    }
  }

  play(name, opts = {}) {
    if (this.muted || this._destroyed) return;
    this._ready.then(() => {
      if (this._destroyed || this.muted || !this.ctx) return;
      if (this.ctx.state === 'suspended') this.ctx.resume();
      const m = (opts.volume ?? 0.45) / 0.45;
      const voices = {
        swap: () => {
          this._tone(360, 610, 0.1, 0.055 * m, 0);
          this._tone(520, 840, 0.09, 0.04 * m, 0.045);
        },
        invalid: () => {
          this._tone(390, 230, 0.16, 0.05 * m, 0, 'triangle');
          this._noise(0.07, 0.025 * m, 0, { type: 'lowpass', freq: 380 });
        },
        match: () => {
          this._noise(0.05, 0.06 * m, 0, { type: 'highpass', freq: 1500 });
          this._tone(780, 1240, 0.1, 0.065 * m, 0.008, 'triangle');
        },
        cascade: () => {
          const lift = 1 + Math.min(4, Math.max(0, (opts.combo || 2) - 1)) * 0.1;
          this._noise(0.045, 0.05 * m, 0, { type: 'highpass', freq: 1800 });
          this._tone(860 * lift, 1480 * lift, 0.11, 0.06 * m, 0, 'triangle');
        },
        dynamite: () => {
          const big = !!opts.big;
          const dur = big ? 0.55 : 0.42;
          this._noise(0.07, 0.22 * m, 0, { type: 'highpass', freq: 700, snap: true });
          this._noise(dur, (big ? 0.26 : 0.2) * m, 0, {
            type: 'lowpass',
            freq: big ? 240 : 180,
            freqTo: 50,
            snap: true,
          });
          this._tone(big ? 78 : 96, 34, dur, (big ? 0.24 : 0.18) * m, 0, 'sine', 0.001);
          this._noise(0.12, 0.08 * m, 0.06, { type: 'bandpass', freq: 900, freqTo: 280, q: 0.6, snap: true });
        },
        rocket: () => {
          this._noise(0.04, 0.1 * m, 0, { type: 'highpass', freq: 1400, snap: true });
          this._noise(0.42, 0.16 * m, 0.02, { type: 'bandpass', freq: 160, freqTo: 1600, q: 0.9, snap: true });
          this._noise(0.4, 0.1 * m, 0.03, { type: 'lowpass', freq: 260, freqTo: 80, snap: true });
          this._tone(120, 78, 0.4, 0.05 * m, 0.02, 'sawtooth', 0.04);
        },
        lightning: () => {
          const loud = opts.mega ? m * 1.2 : m;
          [0, 0.14, 0.24, 0.32, 0.38].forEach((delay) => {
            this._tone(330, 460, 0.07, 0.055 * loud, delay, 'sine', 0.004);
          });
          this._tone(523, 880, 0.22, 0.07 * loud, 0.44, 'triangle', 0.008);
        },
        gather: () => {
          this._tone(940, 1280, 0.09, 0.035 * m, 0);
          this._tone(1400, 1720, 0.08, 0.025 * m, 0.02, 'triangle');
        },
        beam: () => {
          this._noise(0.12, 0.03 * m, 0, { type: 'bandpass', freq: 880, freqTo: 1680, q: 1.8 });
        },
        hit: () => {
          this._tone(155, 68, 0.15, 0.09 * m, 0);
          this._noise(0.08, 0.04 * m, 0, { type: 'lowpass', freq: 640, freqTo: 180 });
        },
        hurt: () => {
          this._tone(250, 110, 0.18, 0.06 * m, 0, 'triangle');
          this._noise(0.06, 0.03 * m, 0, { type: 'bandpass', freq: 480, q: 0.8 });
        },
        win: () => {
          [523, 659, 784, 1047].forEach((freq, i) => {
            this._tone(freq, freq * 1.01, 0.2, 0.045 * m, i * 0.09, 'triangle');
          });
        },
        ui: () => {
          this._tone(720, 960, 0.05, 0.035 * m, 0);
        },
      };
      (voices[name] || voices.match)();
    });
  }


  _out() {
    return this.bus || this.ctx.destination;
  }

  _tone(freq, freqTo, dur, peak, delay = 0, type = 'sine', attack = null) {
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    const t = this.ctx.currentTime + delay;
    const atk = attack == null ? Math.min(0.018, dur * 0.3) : attack;
    const level = Math.max(0.0002, peak);
    osc.type = type;
    osc.frequency.setValueAtTime(Math.max(30, freq), t);
    osc.frequency.exponentialRampToValueAtTime(Math.max(30, freqTo), t + dur);
    if (atk <= 0.002) gain.gain.setValueAtTime(level, t);
    else {
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(level, t + atk);
    }
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(gain).connect(this._out());
    osc.start(t);
    osc.stop(t + dur + 0.03);
  }

  _noise(dur, peak, delay = 0, { type = 'lowpass', freq = 1200, freqTo = null, q = 0.7, snap = false } = {}) {
    const src = this.ctx.createBufferSource();
    src.buffer = this._noiseBuffer();
    const filter = this.ctx.createBiquadFilter();
    filter.type = type;
    filter.Q.value = q;
    const t = this.ctx.currentTime + delay;
    const level = Math.max(0.0002, peak);
    filter.frequency.setValueAtTime(Math.max(40, freq), t);
    if (freqTo) filter.frequency.exponentialRampToValueAtTime(Math.max(40, freqTo), t + dur);
    const gain = this.ctx.createGain();
    if (snap) gain.gain.setValueAtTime(level, t);
    else {
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(level, t + 0.008);
    }
    gain.gain.exponentialRampToValueAtTime(0.0001, t + Math.max(0.02, dur));
    src.connect(filter).connect(gain).connect(this._out());
    src.start(t);
    src.stop(t + dur + 0.02);
  }

  _noiseBuffer() {
    if (this._noiseBuf) return this._noiseBuf;
    const length = this.ctx.sampleRate;
    const buffer = this.ctx.createBuffer(1, length, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
    this._noiseBuf = buffer;
    return buffer;
  }
}
