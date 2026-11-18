// Every sound in Coral Bay Heat is synthesized with WebAudio — there are no audio files.
// The engine hum and the police siren are continuous voices steered every frame; the
// rest are one-shots. A small lookahead scheduler plays the music loop: a warm bass
// line under slow pad chords in A minor, kept quiet under the game.

class AudioEngine {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.master = null;
    this.engineOsc = null;
    this.engineSub = null;
    this.engineGain = null;
    this.engineFilter = null;
    this.sirenOsc = null;
    this.sirenGain = null;
    this.sirenFlipAt = 0;
    this.sirenHigh = false;
    this.musicTimer = null;
    this.nextStepAt = 0;
    this.step = 0;
  }

  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const Ctor = window.AudioContext || window.webkitAudioContext;
    if (!Ctor) return;
    const ctx = new Ctor();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.55;
    this.master.connect(ctx.destination);

    // Engine: a sawtooth through a lowpass, plus a sine an octave down.
    this.engineFilter = ctx.createBiquadFilter();
    this.engineFilter.type = 'lowpass';
    this.engineFilter.frequency.value = 320;
    this.engineGain = ctx.createGain();
    this.engineGain.gain.value = 0;
    this.engineOsc = ctx.createOscillator();
    this.engineOsc.type = 'sawtooth';
    this.engineOsc.frequency.value = 55;
    this.engineSub = ctx.createOscillator();
    this.engineSub.type = 'sine';
    this.engineSub.frequency.value = 28;
    this.engineOsc.connect(this.engineFilter);
    this.engineSub.connect(this.engineFilter);
    this.engineFilter.connect(this.engineGain);
    this.engineGain.connect(this.master);
    this.engineOsc.start();
    this.engineSub.start();

    // Siren: a square wave whose pitch flips between two tones.
    this.sirenGain = ctx.createGain();
    this.sirenGain.gain.value = 0;
    this.sirenOsc = ctx.createOscillator();
    this.sirenOsc.type = 'triangle';
    this.sirenOsc.frequency.value = 720;
    this.sirenOsc.connect(this.sirenGain);
    this.sirenGain.connect(this.master);
    this.sirenOsc.start();

    this.nextStepAt = ctx.currentTime + 0.1;
    this.musicTimer = window.setInterval(() => this.scheduleMusic(), 90);
  }

  setMuted(muted) {
    this.muted = muted;
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(muted ? 0 : 0.55, this.ctx.currentTime, 0.03);
    }
  }

  // Called every frame: speedNorm 0..1 while the player drives, sirenLevel 0..1 by the
  // nearest police presence.
  update(speedNorm, sirenLevel) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const engineTarget = speedNorm === null ? 0 : 0.028 + speedNorm * 0.02;
    this.engineGain.gain.setTargetAtTime(engineTarget, t, 0.08);
    if (speedNorm !== null) {
      const freq = 52 + speedNorm * 118;
      this.engineOsc.frequency.setTargetAtTime(freq, t, 0.06);
      this.engineSub.frequency.setTargetAtTime(freq / 2, t, 0.06);
      this.engineFilter.frequency.setTargetAtTime(300 + speedNorm * 950, t, 0.1);
    }
    this.sirenGain.gain.setTargetAtTime(sirenLevel * 0.035, t, 0.12);
    if (sirenLevel > 0.01 && t >= this.sirenFlipAt) {
      this.sirenHigh = !this.sirenHigh;
      this.sirenOsc.frequency.setValueAtTime(this.sirenHigh ? 955 : 712, t);
      this.sirenFlipAt = t + 0.34;
    }
  }

  tone(freq, dur, type = 'sine', vol = 0.12, when = 0, slideTo = null) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime + when;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(gain);
    gain.connect(this.master);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  noise(dur, vol, filterFreq, type = 'lowpass') {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = filterFreq;
    const gain = ctx.createGain();
    gain.gain.value = vol;
    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    src.start();
  }

  shot() {
    this.noise(0.13, 0.32, 2600, 'highpass');
    this.tone(150, 0.09, 'square', 0.10, 0, 55);
  }

  dryFire() {
    this.tone(1200, 0.03, 'square', 0.05);
  }

  reload() {
    this.tone(500, 0.05, 'square', 0.06);
    this.tone(760, 0.05, 'square', 0.06, 0.12);
  }

  crash(strength) {
    this.noise(0.22, Math.min(0.4, 0.1 + strength * 0.3), 420);
    this.tone(70, 0.18, 'sine', 0.16, 0, 38);
  }

  explosion() {
    this.noise(0.7, 0.5, 240);
    this.tone(55, 0.6, 'sine', 0.3, 0, 26);
  }

  pickup() {
    this.tone(880, 0.07, 'sine', 0.10);
    this.tone(1318, 0.1, 'sine', 0.10, 0.07);
  }

  cash() {
    this.tone(1568, 0.06, 'triangle', 0.12);
    this.tone(2093, 0.09, 'triangle', 0.12, 0.05);
  }

  phone() {
    this.tone(1046, 0.06, 'sine', 0.08);
    this.tone(1046, 0.06, 'sine', 0.08, 0.11);
  }

  missionDone() {
    const notes = [523, 659, 784, 1046];
    notes.forEach((freq, i) => this.tone(freq, 0.16, 'triangle', 0.13, i * 0.09));
  }

  bustedSting() {
    this.tone(392, 0.22, 'sawtooth', 0.10);
    this.tone(311, 0.34, 'sawtooth', 0.10, 0.2);
  }

  wastedSting() {
    this.tone(330, 0.3, 'triangle', 0.12, 0, 220);
    this.tone(196, 0.55, 'triangle', 0.12, 0.25, 130);
  }

  uiClick() {
    this.tone(700, 0.05, 'sine', 0.07);
  }

  scheduleMusic() {
    if (!this.ctx) return;
    const stepDur = 0.155; // ~97 BPM sixteenths
    const roots = [55, 43.65, 65.41, 49]; // A1 F1 C2 G1, one bar each
    const chords = [
      [220, 261.63, 329.63],
      [174.61, 220, 261.63],
      [196, 261.63, 329.63],
      [196, 246.94, 293.66],
    ];
    while (this.nextStepAt < this.ctx.currentTime + 0.22) {
      const stepInBar = this.step % 16;
      const bar = Math.floor(this.step / 16) % 4;
      const when = this.nextStepAt - this.ctx.currentTime;
      if (stepInBar % 4 === 0) this.tone(roots[bar], 0.34, 'triangle', 0.105, when);
      if (stepInBar === 8) this.tone(roots[bar] * 2, 0.2, 'triangle', 0.06, when);
      if (stepInBar === 0) {
        for (const freq of chords[bar]) this.tone(freq, 1.9, 'sine', 0.021, when);
      }
      if (stepInBar % 2 === 0) this.noiseTick(when);
      this.nextStepAt += stepDur;
      this.step += 1;
    }
  }

  noiseTick(when) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime + when;
    const len = Math.floor(ctx.sampleRate * 0.03);
    const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = 6000;
    const gain = ctx.createGain();
    gain.gain.value = 0.016;
    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    src.start(t);
  }
}

export const audio = new AudioEngine();
