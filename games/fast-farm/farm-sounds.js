(function () {
  const STORAGE_KEY = 'fast-farm-sound';

  class FarmSounds {
    constructor() {
      this.ctx = null;
      this.muted = localStorage.getItem(STORAGE_KEY) === 'off';
      this._destroyed = false;
      try {
        this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      } catch {
        this.ctx = null;
      }
    }

    isMuted() {
      return this.muted;
    }

    async unlock() {
      if (this.ctx?.state === 'suspended') await this.ctx.resume();
    }

    destroy() {
      this._destroyed = true;
      if (this.ctx) {
        this.ctx.close().catch(() => {});
        this.ctx = null;
      }
    }

    play(name, opts = {}) {
      if (this.muted || this._destroyed || !this.ctx) return;
      this.unlock().then(() => {
        if (this._destroyed) return;
        this._play(name, opts);
      });
    }

    _out(t, volume, dur) {
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(Math.max(0.001, volume), t);
      g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      g.connect(this.ctx.destination);
      return g;
    }

    _tone(t, { f, f2, dur, type, volume, delay = 0 }) {
      const start = t + delay;
      const osc = this.ctx.createOscillator();
      const g = this._out(start, volume, dur);
      osc.type = type;
      osc.frequency.setValueAtTime(f, start);
      if (f2 !== f) osc.frequency.exponentialRampToValueAtTime(Math.max(30, f2), start + dur);
      osc.connect(g);
      osc.start(start);
      osc.stop(start + dur + 0.03);
    }

    _noise(t, { dur, volume, freq, q = 0.8, type = 'bandpass', delay = 0, falloff = true }) {
      const start = t + delay;
      const sampleRate = this.ctx.sampleRate;
      const len = Math.max(1, Math.floor(sampleRate * dur));
      const buf = this.ctx.createBuffer(1, len, sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) {
        const env = falloff ? 1 - i / len : 1;
        data[i] = (Math.random() * 2 - 1) * env;
      }
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      const filter = this.ctx.createBiquadFilter();
      filter.type = type;
      filter.frequency.value = freq;
      filter.Q.value = q;
      const g = this._out(start, volume, dur);
      src.connect(filter).connect(g);
      src.start(start);
      src.stop(start + dur + 0.03);
    }

    _sfxToolSelect(t, v) {
      this._tone(t, { f: 320, f2: 260, dur: 0.05, type: 'triangle', volume: v * 0.5 });
      this._tone(t, { f: 920, f2: 880, dur: 0.04, type: 'sine', volume: v * 0.22, delay: 0.015 });
    }

    _sfxClick(t, v) {
      this._tone(t, { f: 720, f2: 680, dur: 0.035, type: 'sine', volume: v * 0.35 });
    }

    _sfxPlant(t, v) {
      this._tone(t, { f: 520, f2: 280, dur: 0.06, type: 'sine', volume: v * 0.35, delay: 0 });
      this._noise(t, { dur: 0.07, volume: v * 0.55, freq: 380, type: 'lowpass', delay: 0.04 });
      this._tone(t, { f: 140, f2: 90, dur: 0.12, type: 'triangle', volume: v * 0.7, delay: 0.05 });
    }

    _sfxWater(t, v) {
      for (let i = 0; i < 5; i++) {
        this._noise(t, {
          dur: 0.09,
          volume: v * (0.42 - i * 0.04),
          freq: 900 - i * 60,
          delay: i * 0.055,
        });
      }
      [0.12, 0.2, 0.28, 0.36].forEach((d, i) => {
        this._noise(t, { dur: 0.05, volume: v * 0.28, freq: 1400, q: 1.2, delay: d });
        this._tone(t, { f: 680 - i * 40, f2: 420, dur: 0.04, type: 'sine', volume: v * 0.12, delay: d + 0.01 });
      });
    }

    _sfxFertilize(t, v) {
      for (let i = 0; i < 8; i++) {
        this._noise(t, {
          dur: 0.025,
          volume: v * 0.38,
          freq: 2200 + (i % 3) * 300,
          q: 2,
          delay: 0.04 + i * 0.028,
          falloff: true,
        });
        this._tone(t, {
          f: 180 + (i % 4) * 20,
          f2: 120,
          dur: 0.02,
          type: 'triangle',
          volume: v * 0.15,
          delay: 0.04 + i * 0.028,
        });
      }
      this._noise(t, { dur: 0.1, volume: v * 0.2, freq: 450, type: 'lowpass', delay: 0.02 });
    }

    _sfxHeal(t, v) {
      this._noise(t, { dur: 0.14, volume: v * 0.35, freq: 3200, type: 'highpass', q: 0.5 });
      this._noise(t, { dur: 0.1, volume: v * 0.22, freq: 2800, type: 'highpass', delay: 0.08 });
      [640, 720, 880].forEach((f, i) => {
        this._tone(t, { f, f2: f * 1.01, dur: 0.08, type: 'sine', volume: v * 0.2, delay: 0.16 + i * 0.06 });
      });
    }

    _sfxClear(t, v) {
      this._noise(t, { dur: 0.22, volume: v * 0.45, freq: 520, type: 'bandpass', delay: 0 });
      this._noise(t, { dur: 0.18, volume: v * 0.35, freq: 380, type: 'bandpass', delay: 0.1 });
      this._tone(t, { f: 200, f2: 110, dur: 0.2, type: 'sawtooth', volume: v * 0.18, delay: 0.04 });
    }

    _sfxHarvest(t, v) {
      this._noise(t, { dur: 0.04, volume: v * 0.35, freq: 1800, q: 1.5 });
      this._tone(t, { f: 420, f2: 260, dur: 0.07, type: 'triangle', volume: v * 0.45, delay: 0.03 });
      this._noise(t, { dur: 0.08, volume: v * 0.3, freq: 600, type: 'lowpass', delay: 0.06 });
      this._tone(t, { f: 180, f2: 120, dur: 0.1, type: 'sine', volume: v * 0.35, delay: 0.08 });
    }

    _sfxHarvestGreat(t, v) {
      this._sfxHarvest(t, v * 0.85);
      [0.14, 0.22, 0.3].forEach((d) => {
        this._tone(t, { f: 360, f2: 220, dur: 0.06, type: 'triangle', volume: v * 0.3, delay: d });
        this._noise(t, { dur: 0.06, volume: v * 0.22, freq: 700, type: 'lowpass', delay: d + 0.02 });
      });
    }

    _sfxHarvestJackpot(t, v) {
      this._sfxHarvestGreat(t, v * 0.9);
      [523, 659, 784, 988].forEach((f, i) => {
        this._tone(t, { f, f2: f * 1.02, dur: 0.14, type: 'triangle', volume: v * 0.28, delay: 0.35 + i * 0.08 });
      });
    }

    _sfxHarvestTick(t, v) {
      this._tone(t, { f: 260, f2: 180, dur: 0.035, type: 'sine', volume: v });
      this._noise(t, { dur: 0.025, volume: v * 0.6, freq: 900, delay: 0.005 });
    }

    _sfxBlight(t, v) {
      this._noise(t, { dur: 0.35, volume: v * 0.4, freq: 280, type: 'bandpass' });
      this._tone(t, { f: 220, f2: 55, dur: 0.55, type: 'sawtooth', volume: v * 0.45 });
      this._tone(t, { f: 160, f2: 80, dur: 0.4, type: 'square', volume: v * 0.15, delay: 0.08 });
    }

    _sfxError(t, v) {
      this._tone(t, { f: 200, f2: 160, dur: 0.08, type: 'square', volume: v * 0.35 });
      this._tone(t, { f: 160, f2: 130, dur: 0.1, type: 'square', volume: v * 0.3, delay: 0.09 });
    }

    _play(name, opts) {
      const t = this.ctx.currentTime;
      const v = opts.volume ?? 0.24;

      switch (name) {
        case 'toolSelect':
          this._sfxToolSelect(t, v);
          break;
        case 'click':
          this._sfxClick(t, v);
          break;
        case 'plant':
          this._sfxPlant(t, v);
          break;
        case 'water':
          this._sfxWater(t, v);
          break;
        case 'fertilize':
          this._sfxFertilize(t, v);
          break;
        case 'heal':
          this._sfxHeal(t, v);
          break;
        case 'clear':
          this._sfxClear(t, v);
          break;
        case 'harvest':
          this._sfxHarvest(t, v);
          break;
        case 'harvestGreat':
          this._sfxHarvestGreat(t, v);
          break;
        case 'harvestJackpot':
          this._sfxHarvestJackpot(t, v);
          break;
        case 'harvestTick':
          this._sfxHarvestTick(t, opts.volume ?? 0.1);
          break;
        case 'blight':
          this._sfxBlight(t, v);
          break;
        case 'error':
          this._sfxError(t, v);
          break;
        default:
          this._sfxClick(t, v);
      }
    }
  }

  window.FarmSounds = FarmSounds;
})();
