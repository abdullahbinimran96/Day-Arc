// Web Audio Synthesis & Audio Player Engine
// Generates ambient sounds & plays user audio (Single play only, NO looping)

class SoundEngine {
  constructor() {
    this.ctx = null;
    this.currentPlayingNode = null;
    this.currentPlayingId = null;
    this.onProgressCallback = null;
    this.onEndCallback = null;
    this.progressInterval = null;
    this.autoStopTimeout = null;
    this.audioElement = null;
  }

  getAudioContext() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AudioCtx();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
    return this.ctx;
  }

  stopCurrent() {
    if (this.progressInterval) {
      clearInterval(this.progressInterval);
      this.progressInterval = null;
    }

    if (this.autoStopTimeout) {
      clearTimeout(this.autoStopTimeout);
      this.autoStopTimeout = null;
    }

    if (this.audioElement) {
      this.audioElement.pause();
      this.audioElement.currentTime = 0;
      this.audioElement.src = '';
      this.audioElement = null;
    }

    if (this.currentPlayingNode) {
      try {
        if (typeof this.currentPlayingNode.stop === 'function') {
          this.currentPlayingNode.stop();
        }
        if (typeof this.currentPlayingNode.disconnect === 'function') {
          this.currentPlayingNode.disconnect();
        }
      } catch (e) {}
      this.currentPlayingNode = null;
    }

    const prevId = this.currentPlayingId;
    this.currentPlayingId = null;

    if (this.onEndCallback) {
      this.onEndCallback(prevId);
    }
  }

  play(sound, onProgress, onEnd) {
    this.stopCurrent();
    if (!sound || !sound.id || sound.id === 'none') {
      return;
    }

    this.onProgressCallback = onProgress;
    this.onEndCallback = onEnd;
    this.currentPlayingId = sound.id;

    if (sound.audio_data && (sound.audio_data.startsWith('data:audio') || sound.audio_data.startsWith('http') || sound.audio_data.startsWith('blob:'))) {
      // Play custom/bundled audio file (Strictly ONCE, loop = false)
      this.audioElement = new Audio(sound.audio_data);
      this.audioElement.loop = false;
      this.audioElement.play().catch(err => console.warn('Audio playback error:', err));

      this.progressInterval = setInterval(() => {
        if (this.audioElement && this.onProgressCallback) {
          const pct = (this.audioElement.currentTime / (this.audioElement.duration || 1)) * 100;
          this.onProgressCallback(pct, this.audioElement.currentTime);
        }
      }, 100);

      this.audioElement.onended = () => {
        this.stopCurrent();
      };
      return;
    }

    // Built-in Synthesized Sounds (Plays ONCE and stops)
    const ctx = this.getAudioContext();

    if (sound.id.includes('rain')) {
      this.playRainSound(ctx, 30); // 30s single play
    } else if (sound.id.includes('binaural')) {
      this.playBinauralBeat(ctx, 30); // 30s single play
    } else if (sound.id.includes('bell') || sound.id.includes('chime')) {
      this.playChime(ctx);
    } else if (sound.id.includes('azaan')) {
      this.playAzaanTones(ctx);
    } else {
      this.playChime(ctx);
    }
  }

  playRainSound(ctx, durationSec = 30) {
    const bufferSize = ctx.sampleRate * 2;
    const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const output = noiseBuffer.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;

    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + white * 0.0555179;
      b1 = 0.99332 * b1 + white * 0.0750759;
      b2 = 0.96900 * b2 + white * 0.1538520;
      b3 = 0.86650 * b3 + white * 0.3104856;
      b4 = 0.55000 * b4 + white * 0.5329522;
      b5 = -0.7616 * b5 - white * 0.0168980;
      output[i] = b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362;
      output[i] *= 0.11;
      b6 = white * 0.115926;
    }

    const whiteNoise = ctx.createBufferSource();
    whiteNoise.buffer = noiseBuffer;
    whiteNoise.loop = true;

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(800, ctx.currentTime);

    const gainNode = ctx.createGain();
    gainNode.gain.setValueAtTime(0.3, ctx.currentTime);
    gainNode.gain.setValueAtTime(0.3, ctx.currentTime + durationSec - 2);
    gainNode.gain.linearRampToValueAtTime(0.001, ctx.currentTime + durationSec);

    whiteNoise.connect(filter);
    filter.connect(gainNode);
    gainNode.connect(ctx.destination);

    whiteNoise.start();
    this.currentPlayingNode = whiteNoise;

    this.autoStopTimeout = setTimeout(() => {
      this.stopCurrent();
    }, durationSec * 1000);
  }

  playBinauralBeat(ctx, durationSec = 30) {
    const merger = ctx.createChannelMerger(2);

    const oscL = ctx.createOscillator();
    const oscR = ctx.createOscillator();

    oscL.frequency.value = 216; // 216 Hz Left
    oscR.frequency.value = 226; // 226 Hz Right (10 Hz Alpha beat)

    const gainNode = ctx.createGain();
    gainNode.gain.setValueAtTime(0.2, ctx.currentTime);
    gainNode.gain.setValueAtTime(0.2, ctx.currentTime + durationSec - 2);
    gainNode.gain.linearRampToValueAtTime(0.001, ctx.currentTime + durationSec);

    oscL.connect(merger, 0, 0);
    oscR.connect(merger, 0, 1);
    merger.connect(gainNode);
    gainNode.connect(ctx.destination);

    oscL.start();
    oscR.start();

    this.currentPlayingNode = {
      stop: () => {
        try { oscL.stop(); oscR.stop(); } catch(e) {}
      }
    };

    this.autoStopTimeout = setTimeout(() => {
      this.stopCurrent();
    }, durationSec * 1000);
  }

  playChime(ctx) {
    const freqs = [528, 660, 792, 1056];
    const gainNode = ctx.createGain();
    gainNode.gain.setValueAtTime(0.4, ctx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 3.5);
    gainNode.connect(ctx.destination);

    const oscs = freqs.map(f => {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = f;
      o.connect(gainNode);
      o.start();
      o.stop(ctx.currentTime + 3.5);
      return o;
    });

    this.currentPlayingNode = {
      stop: () => {
        oscs.forEach(o => { try { o.stop(); } catch(e) {} });
      }
    };

    this.autoStopTimeout = setTimeout(() => {
      this.stopCurrent();
    }, 3600);
  }

  playAzaanTones(ctx) {
    const notes = [
      { freq: 440, dur: 1.2 },
      { freq: 493.88, dur: 1.0 },
      { freq: 523.25, dur: 1.6 },
      { freq: 440, dur: 1.4 }
    ];

    let t = ctx.currentTime + 0.1;
    const oscs = [];

    notes.forEach(n => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = n.freq;

      gain.gain.setValueAtTime(0.001, t);
      gain.gain.linearRampToValueAtTime(0.3, t + 0.1);
      gain.gain.setValueAtTime(0.3, t + n.dur - 0.2);
      gain.gain.linearRampToValueAtTime(0.0001, t + n.dur);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(t);
      osc.stop(t + n.dur);
      oscs.push(osc);

      t += n.dur + 0.1;
    });

    this.currentPlayingNode = {
      stop: () => {
        oscs.forEach(o => { try { o.stop(); } catch(e) {} });
      }
    };

    const totalDur = t - ctx.currentTime;
    this.autoStopTimeout = setTimeout(() => {
      this.stopCurrent();
    }, totalDur * 1000);
  }
}

window.soundEngine = new SoundEngine();
