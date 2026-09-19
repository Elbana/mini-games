(function () {
  const STORAGE_KEY = 'fast-farm-sound';

  const HARVEST_PRESET = {
    randomSlice: true,
    sliceMin: 0.3,
    sliceMax: 0.48,
    sliceHop: 0.03,
    sliceRelativePeak: 0.18,
    volume: 0.82,
    rate: 1,
  };

  /** Cozy game samples + synth feed/blight/error. WebView-safe syntax. */
  class FarmSounds {
    constructor(manifest) {
      const baseUrl = manifest && manifest.baseUrl ? manifest.baseUrl : '/fast-farm/assets';
      this.base = baseUrl + '/sounds';
      this.ctx = null;
      this.cache = new Map();
      this.muted = localStorage.getItem(STORAGE_KEY) === 'off';
      this._destroyed = false;
      this._harvestSliceStarts = null;
      this._ready = this._init();
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

    _loadBuffer(file) {
      const self = this;
      return fetch(self.base + '/' + file)
        .then(function (res) {
          if (!res.ok) throw new Error('missing ' + file);
          return res.arrayBuffer();
        })
        .then(function (data) {
          if (data.byteLength < 256) throw new Error('empty ' + file);
          const copy = data.slice(0);
          return new Promise(function (resolve, reject) {
            self.ctx.decodeAudioData(copy, resolve, reject);
          });
        });
    }

    _init() {
      const self = this;
      try {
        self.ctx = new (window.AudioContext || window.webkitAudioContext)();
      } catch (err) {
        return Promise.resolve();
      }

      return fetch(self.base + '/index.json')
        .then(function (idx) {
          if (!idx.ok) return null;
          return idx.json();
        })
        .then(function (files) {
          if (!files) return;
          const jobs = Object.keys(files).map(function (key) {
            const file = files[key];
            if (!file || typeof file !== 'string') return Promise.resolve();
            return self._loadBuffer(file)
              .then(function (buf) {
                self.cache.set(key, buf);
              })
              .catch(function () {});
          });
          return Promise.all(jobs).then(function () {
            if (self.cache.has('harvest') && HARVEST_PRESET.randomSlice) {
              self._harvestSliceStarts = self._buildHarvestSliceStarts(
                self.cache.get('harvest'),
                HARVEST_PRESET
              );
            }
          });
        })
        .catch(function () {});
    }

    unlock() {
      const self = this;
      return self._ready.then(function () {
        if (self.ctx && self.ctx.state === 'suspended') return self.ctx.resume();
      });
    }

    destroy() {
      this._destroyed = true;
      this.cache.clear();
      if (this.ctx) {
        this.ctx.close().catch(function () {});
        this.ctx = null;
      }
    }

    _sampleDefaults(name) {
      const presets = {
        water: { volume: 0.42, rate: 1 },
        plant: { volume: 0.1, rate: 1.08 },
        harvest: { offset: 0, volume: 0.78, rate: 1 },
        heal: { volume: 0.12, rate: 1 },
        clear: { offset: 0, duration: 1.4, volume: 0.44, rate: 1 },
        click: { volume: 0.28, rate: 1 },
        toolSelect: { volume: 0.3, rate: 1 },
        harvestTick: { volume: 0.18, rate: 1.1 },
      };
      if (name === 'harvest') {
        presets.harvest = {
          offset: 0,
          volume: HARVEST_PRESET.volume != null ? HARVEST_PRESET.volume : 0.78,
          rate: HARVEST_PRESET.rate != null ? HARVEST_PRESET.rate : 1,
        };
      }
      return presets[name] || { volume: 0.4, rate: 1 };
    }

    _buildHarvestSliceStarts(buf, preset) {
      const hopSec = preset.sliceHop != null ? preset.sliceHop : 0.03;
      const minPeak = preset.sliceMinPeak != null ? preset.sliceMinPeak : 0.02;
      const relative = preset.sliceRelativePeak != null ? preset.sliceRelativePeak : 0.18;
      const data = buf.getChannelData(0);
      const sr = buf.sampleRate;
      const hop = Math.max(1, Math.floor(sr * hopSec));
      let globalPeak = 0;
      let i;
      for (i = 0; i < data.length; i += hop) {
        let peak = 0;
        const end = Math.min(i + hop, data.length);
        for (let j = i; j < end; j++) {
          const a = Math.abs(data[j]);
          if (a > peak) peak = a;
        }
        if (peak > globalPeak) globalPeak = peak;
      }
      const threshold = Math.max(minPeak, globalPeak * relative);
      const starts = [];
      for (i = 0; i < data.length; i += hop) {
        let peak = 0;
        const end = Math.min(i + hop, data.length);
        for (let j = i; j < end; j++) {
          const a = Math.abs(data[j]);
          if (a > peak) peak = a;
        }
        if (peak >= threshold) {
          starts.push({ offset: i / sr, peak: peak });
        }
      }
      return starts.length ? starts : [{ offset: 0, peak: 1 }];
    }

    _randomHarvestSlice(base) {
      const buf = this.cache.get('harvest');
      const h = HARVEST_PRESET;
      const sliceMin = h.sliceMin != null ? h.sliceMin : 0.3;
      const sliceMax = h.sliceMax != null ? h.sliceMax : 0.48;
      const dur = sliceMin + Math.random() * Math.max(0.05, sliceMax - sliceMin);
      let offset = 0;
      const starts = this._harvestSliceStarts;
      if (starts && starts.length) {
        const pick = starts[Math.floor(Math.random() * starts.length)];
        offset = Math.max(0, pick.offset - 0.015);
        if (buf && offset + dur > buf.duration - 0.02) {
          offset = Math.max(0, buf.duration - dur - 0.02);
        }
      } else if (buf && buf.duration > dur + 0.08) {
        offset = Math.random() * (buf.duration - dur - 0.05);
      }
      const rateBase = base.rate != null ? base.rate : (h.rate != null ? h.rate : 1);
      return {
        offset: offset,
        duration: dur,
        volume: base.volume,
        rate: rateBase * (0.95 + Math.random() * 0.12),
      };
    }

    _playHarvestSample(opts) {
      const base = this._mergeOpts(this._sampleDefaults('harvest'), opts || {});
      if (HARVEST_PRESET.randomSlice) {
        return this._playSample('harvest', this._randomHarvestSlice(base));
      }
      return this._playSample('harvest', base);
    }

    _mergeOpts(defaults, opts) {
      const o = opts || {};
      const out = {
        volume: o.volume != null ? o.volume : defaults.volume,
        rate: o.rate != null ? o.rate : defaults.rate,
        offset: o.offset != null ? o.offset : defaults.offset,
        duration: o.duration != null ? o.duration : defaults.duration,
      };
      return out;
    }

    _playSample(name, opts) {
      const buf = this.cache.get(name);
      if (!buf || !this.ctx) return false;
      const o = opts || {};
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      src.playbackRate.value = o.rate != null ? o.rate : 1;
      const g = this.ctx.createGain();
      g.gain.value = o.volume != null ? o.volume : 0.45;
      src.connect(g).connect(this.ctx.destination);
      const offset = Math.max(0, Math.min(o.offset || 0, Math.max(0, buf.duration - 0.05)));
      let dur;
      if (o.duration && o.duration > 0) {
        dur = Math.min(o.duration, Math.max(0.05, buf.duration - offset));
      }
      src.start(0, offset, dur);
      return true;
    }

    _playSampleBurst(sampleName, opts, count, gapMs) {
      const self = this;
      const base = self._mergeOpts(self._sampleDefaults(sampleName), opts);
      const useRandom = sampleName === 'harvest' && HARVEST_PRESET.randomSlice;
      const snipDur = base.duration && base.duration > 0 ? base.duration : 0.45;
      const snipOffsets = [base.offset || 0, 1.0, 2.0, 0.5, 1.5];
      for (let i = 0; i < count; i++) {
        (function (idx) {
          setTimeout(function () {
            if (self._destroyed || self.muted) return;
            if (useRandom) {
              const slice = self._randomHarvestSlice({
                volume: base.volume * (1 - idx * 0.05),
                rate: base.rate,
              });
              self._playSample(sampleName, slice);
              return;
            }
            self._playSample(sampleName, {
              volume: base.volume * (1 - idx * 0.05),
              rate: base.rate,
              offset: snipOffsets[idx % snipOffsets.length],
              duration: snipDur,
            });
          }, idx * gapMs);
        })(i);
      }
    }

    play(name, opts) {
      if (this.muted || this._destroyed || !this.ctx) return;
      const self = this;
      const o = opts || {};

      self._ready.then(function () {
        if (self._destroyed) return;
        return self.unlock();
      }).then(function () {
        if (self._destroyed) return;

        if (name === 'fertilize' || name === 'blight' || name === 'error') {
          self._playSynth(name, o);
          return;
        }

        if (name === 'harvest') {
          if (self.cache.has('harvest')) {
            self._playHarvestSample(o);
          } else {
            self._playSynth('harvest', o);
          }
          return;
        }

        if (name === 'harvestGreat') {
          if (self.cache.has('harvest')) {
            self._playSampleBurst('harvest', o, 3, 110);
          } else {
            self._playSynth('harvestGreat', o);
          }
          return;
        }

        if (name === 'harvestMega') {
          if (self.cache.has('harvest')) {
            self._playSampleBurst('harvest', o, 5, 95);
          } else {
            self._playSynth('harvestMega', o);
          }
          return;
        }

        if (name === 'water' && self.cache.has('water')) {
          const w = self._mergeOpts(self._sampleDefaults('water'), o);
          self._playSample('water', w);
          setTimeout(function () {
            if (self._destroyed || self.muted) return;
            self._playSample('water', { volume: w.volume * 0.85, rate: w.rate * 0.98 });
          }, 85);
          setTimeout(function () {
            if (self._destroyed || self.muted) return;
            self._playSample('water', { volume: w.volume * 0.7, rate: w.rate * 0.96 });
          }, 170);
          return;
        }

        const sampleName = name;
        if (self.cache.has(sampleName)) {
          self._playSample(sampleName, self._mergeOpts(self._sampleDefaults(sampleName), o));
          return;
        }

        self._playSynth(name, o);
      });
    }

    _out(t, volume, dur) {
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(Math.max(0.001, volume), t);
      g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      g.connect(this.ctx.destination);
      return g;
    }

    _tone(t, cfg) {
      const start = t + (cfg.delay || 0);
      const osc = this.ctx.createOscillator();
      const g = this._out(start, cfg.volume, cfg.dur);
      osc.type = cfg.type;
      osc.frequency.setValueAtTime(cfg.f, start);
      if (cfg.f2 !== cfg.f) osc.frequency.exponentialRampToValueAtTime(Math.max(30, cfg.f2), start + cfg.dur);
      osc.connect(g);
      osc.start(start);
      osc.stop(start + cfg.dur + 0.03);
    }

    _noise(t, cfg) {
      const start = t + (cfg.delay || 0);
      const sampleRate = this.ctx.sampleRate;
      const len = Math.max(1, Math.floor(sampleRate * cfg.dur));
      const buf = this.ctx.createBuffer(1, len, sampleRate);
      const data = buf.getChannelData(0);
      const falloff = cfg.falloff !== false;
      for (let i = 0; i < len; i++) {
        const env = falloff ? 1 - i / len : 1;
        data[i] = (Math.random() * 2 - 1) * env;
      }
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      const filter = this.ctx.createBiquadFilter();
      filter.type = cfg.type || 'bandpass';
      filter.frequency.setValueAtTime(cfg.freq, start);
      if (cfg.freqEnd) filter.frequency.linearRampToValueAtTime(cfg.freqEnd, start + cfg.dur);
      filter.Q.value = cfg.q != null ? cfg.q : 0.8;
      const g = this._out(start, cfg.volume, cfg.dur);
      src.connect(filter).connect(g);
      src.start(start);
      src.stop(start + cfg.dur + 0.03);
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

    _sfxHarvestPop(t, v, delay, volScale) {
      const scale = volScale != null ? volScale : 1;
      const d = delay || 0;
      this._noise(t, { dur: 0.06, volume: v * 0.55 * scale, freq: 680, freqEnd: 320, type: 'bandpass', delay: d });
      this._noise(t, { dur: 0.04, volume: v * 0.35 * scale, freq: 1800, q: 1.5, delay: d + 0.02, falloff: true });
      this._tone(t, { f: 420, f2: 180, dur: 0.08, type: 'triangle', volume: v * 0.45 * scale, delay: d + 0.03 });
    }

    _sfxBlight(t, v) {
      this._noise(t, { dur: 0.35, volume: v * 0.4, freq: 280, type: 'bandpass' });
      this._tone(t, { f: 220, f2: 55, dur: 0.55, type: 'sawtooth', volume: v * 0.45 });
    }

    _sfxError(t, v) {
      this._tone(t, { f: 200, f2: 160, dur: 0.08, type: 'square', volume: v * 0.35 });
      this._tone(t, { f: 160, f2: 130, dur: 0.1, type: 'square', volume: v * 0.3, delay: 0.09 });
    }

    _playSynth(name, opts) {
      const t = this.ctx.currentTime;
      const v = opts && opts.volume != null ? opts.volume : 0.24;

      switch (name) {
        case 'fertilize':
          this._sfxFertilize(t, v);
          break;
        case 'harvest':
          this._sfxHarvestPop(t, v * 1.4, 0, 1);
          break;
        case 'harvestGreat':
          this._sfxHarvestPop(t, v, 0, 0.9);
          this._sfxHarvestPop(t, v * 0.75, 0.13, 0.7);
          this._sfxHarvestPop(t, v * 0.75, 0.22, 0.7);
          break;
        case 'harvestMega':
          this._sfxHarvestPop(t, v, 0, 0.85);
          [0.12, 0.2, 0.28, 0.36].forEach(function (d) {
            this._sfxHarvestPop(t, v * 0.7, d, 0.6);
          }, this);
          break;
        case 'blight':
          this._sfxBlight(t, v);
          break;
        case 'error':
          this._sfxError(t, v);
          break;
        default:
          this._tone(t, { f: 720, f2: 680, dur: 0.035, type: 'sine', volume: v * 0.35 });
      }
    }
  }

  window.FarmSounds = FarmSounds;
})();
