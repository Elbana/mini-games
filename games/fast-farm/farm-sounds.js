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

    _gainAt(t, volume, dur) {
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(volume, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      g.connect(this.ctx.destination);
      return g;
    }

    _tone(t, { f, f2, dur, type, volume }) {
      const osc = this.ctx.createOscillator();
      const g = this._gainAt(t, volume, dur);
      osc.type = type;
      osc.frequency.setValueAtTime(f, t);
      osc.frequency.exponentialRampToValueAtTime(Math.max(40, f2), t + dur);
      osc.connect(g);
      osc.start(t);
      osc.stop(t + dur + 0.02);
    }

    _noise(t, { dur, volume, freq }) {
      const sampleRate = this.ctx.sampleRate;
      const len = Math.floor(sampleRate * dur);
      const buf = this.ctx.createBuffer(1, len, sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) {
        data[i] = (Math.random() * 2 - 1) * (1 - i / len);
      }
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = freq;
      filter.Q.value = 0.7;
      const g = this._gainAt(t, volume, dur);
      src.connect(filter).connect(g);
      src.start(t);
      src.stop(t + dur + 0.02);
    }

    _chime(t, notes, volume) {
      notes.forEach((freq, i) => {
        this._tone(t + i * 0.07, {
          f: freq,
          f2: freq * 1.02,
          dur: 0.12,
          type: 'triangle',
          volume: volume * (1 - i * 0.08),
        });
      });
    }

    _play(name, opts) {
      const t = this.ctx.currentTime;
      const v = opts.volume ?? 0.22;

      switch (name) {
        case 'toolSelect':
          this._tone(t, { f: 520, f2: 680, dur: 0.07, type: 'sine', volume: v * 0.7 });
          break;
        case 'click':
          this._tone(t, { f: 640, f2: 720, dur: 0.05, type: 'sine', volume: v * 0.55 });
          break;
        case 'plant':
          this._tone(t, { f: 180, f2: 320, dur: 0.1, type: 'triangle', volume: v * 0.85 });
          this._noise(t, { dur: 0.08, volume: v * 0.35, freq: 420 });
          break;
        case 'water':
          this._noise(t, { dur: 0.28, volume: v * 0.9, freq: 760 });
          this._noise(t + 0.06, { dur: 0.22, volume: v * 0.55, freq: 520 });
          break;
        case 'fertilize':
          this._noise(t, { dur: 0.14, volume: v * 0.45, freq: 280 });
          this._tone(t, { f: 240, f2: 360, dur: 0.12, type: 'triangle', volume: v * 0.5 });
          break;
        case 'heal':
          this._chime(t, [523, 659, 784], v * 0.55);
          break;
        case 'clear':
          this._noise(t, { dur: 0.16, volume: v * 0.5, freq: 340 });
          this._tone(t, { f: 220, f2: 140, dur: 0.14, type: 'sawtooth', volume: v * 0.35 });
          break;
        case 'harvest':
          this._chime(t, [392, 523, 659], v * 0.65);
          break;
        case 'harvestGreat':
          this._chime(t, [440, 554, 659, 880], v * 0.75);
          break;
        case 'harvestJackpot':
          this._chime(t, [523, 659, 784, 988, 1175], v * 0.85);
          break;
        case 'harvestTick':
          this._tone(t, { f: 880, f2: 920, dur: 0.04, type: 'sine', volume: (opts.volume ?? 0.08) });
          break;
        case 'blight':
          this._tone(t, { f: 180, f2: 70, dur: 0.45, type: 'sawtooth', volume: v * 0.7 });
          break;
        case 'error':
          this._tone(t, { f: 220, f2: 160, dur: 0.12, type: 'square', volume: v * 0.45 });
          break;
        default:
          this._tone(t, { f: 600, f2: 720, dur: 0.05, type: 'sine', volume: v * 0.5 });
      }
    }
  }

  window.FarmSounds = FarmSounds;
})();
