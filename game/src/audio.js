// audio.js — every sound is synthesized with WebAudio; there are no audio files.
// One-shot effects (shots, crashes, pickups) plus three continuous voices:
// the player's engine, the nearest police siren and a small looping music motif.
// In a headless run (no AudioContext) the whole engine stays silent and inert.

export class SoundEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.muted = false;
    this.engineOsc = null; this.engineGain = null;
    this.sirenOsc = null; this.sirenGain = null; this.sirenLfo = null;
    this.musicTimer = 0; this.musicStep = 0;
  }

  ensure() {
    if (this.ctx || typeof window === 'undefined') return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try {
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.5;
      this.master.connect(this.ctx.destination);
    } catch { this.ctx = null; }
  }

  setMuted(m) {
    this.muted = m;
    if (this.master && this.ctx) this.master.gain.setValueAtTime(m ? 0 : 0.5, this.ctx.currentTime);
  }

  blip(freq, dur, type = 'square', vol = 0.2, slideTo = null) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator(), g = this.ctx.createGain();
    osc.type = type; osc.frequency.setValueAtTime(freq, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(g); g.connect(this.master);
    osc.start(t); osc.stop(t + dur + 0.02);
  }

  noise(dur, vol = 0.3, low = 400, high = 3000) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const len = Math.max(1, Math.floor(this.ctx.sampleRate * dur));
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource(); src.buffer = buf;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass'; filter.frequency.value = (low + high) / 2; filter.Q.value = 0.7;
    const g = this.ctx.createGain(); g.gain.value = vol;
    src.connect(filter); filter.connect(g); g.connect(this.master);
    src.start(t);
  }

  shot() { this.noise(0.09, 0.35, 900, 4200); this.blip(160, 0.07, 'square', 0.18, 60); }
  dryFire() { this.blip(1200, 0.03, 'square', 0.08); }
  reload() { this.blip(500, 0.05, 'square', 0.12); setTimeout(() => this.blip(750, 0.05, 'square', 0.12), 90); }
  crash(hard) { this.noise(hard ? 0.3 : 0.14, hard ? 0.5 : 0.25, 150, 1400); }
  explosion() { this.noise(0.7, 0.7, 60, 900); this.blip(90, 0.6, 'sine', 0.5, 30); }
  pickup() { this.blip(880, 0.08, 'sine', 0.2); setTimeout(() => this.blip(1320, 0.12, 'sine', 0.2), 70); }
  cash() { this.blip(990, 0.07, 'triangle', 0.22); setTimeout(() => this.blip(1480, 0.1, 'triangle', 0.22), 60); }
  door() { this.blip(220, 0.06, 'square', 0.1, 140); }
  phoneBuzz() { this.blip(1400, 0.05, 'square', 0.06); setTimeout(() => this.blip(1400, 0.05, 'square', 0.06), 110); }
  bustedTone() { this.blip(392, 0.16, 'triangle', 0.25); setTimeout(() => this.blip(311, 0.16, 'triangle', 0.25), 170); setTimeout(() => this.blip(233, 0.3, 'triangle', 0.25), 340); }
  stinger(win) {
    const notes = win ? [523, 659, 784, 1046] : [330, 262, 196];
    notes.forEach((f, i) => setTimeout(() => this.blip(f, 0.22, 'triangle', 0.22), i * 110));
  }

  // --- continuous voices -------------------------------------------------
  engine(on, speedRatio) {
    if (!this.ctx) return;
    if (on && !this.engineOsc) {
      this.engineOsc = this.ctx.createOscillator();
      this.engineGain = this.ctx.createGain();
      this.engineOsc.type = 'sawtooth';
      this.engineGain.gain.value = 0.0;
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass'; filter.frequency.value = 500;
      this.engineOsc.connect(filter); filter.connect(this.engineGain); this.engineGain.connect(this.master);
      this.engineOsc.start();
    }
    if (this.engineOsc) {
      const t = this.ctx.currentTime;
      this.engineOsc.frequency.setTargetAtTime(55 + speedRatio * 165, t, 0.08);
      this.engineGain.gain.setTargetAtTime(on ? 0.05 + speedRatio * 0.05 : 0, t, 0.1);
    }
  }

  siren(distance) {
    if (!this.ctx) return;
    const audible = distance < 700;
    if (audible && !this.sirenOsc) {
      this.sirenOsc = this.ctx.createOscillator();
      this.sirenGain = this.ctx.createGain();
      this.sirenLfo = this.ctx.createOscillator();
      const lfoGain = this.ctx.createGain();
      this.sirenOsc.type = 'triangle'; this.sirenOsc.frequency.value = 800;
      this.sirenLfo.frequency.value = 0.55; lfoGain.gain.value = 190;
      this.sirenLfo.connect(lfoGain); lfoGain.connect(this.sirenOsc.frequency);
      this.sirenGain.gain.value = 0;
      this.sirenOsc.connect(this.sirenGain); this.sirenGain.connect(this.master);
      this.sirenOsc.start(); this.sirenLfo.start();
    }
    if (this.sirenGain) {
      const vol = audible ? Math.max(0, 0.075 * (1 - distance / 700)) : 0;
      this.sirenGain.gain.setTargetAtTime(vol, this.ctx.currentTime, 0.15);
    }
  }

  // A lazy A-minor motif: bass pulse plus a sparse plucked line, looped.
  music(dt, playing) {
    if (!this.ctx || this.muted || !playing) return;
    this.musicTimer -= dt;
    if (this.musicTimer > 0) return;
    this.musicTimer = 0.24;
    const bass = [110, 110, 131, 110, 98, 98, 110, 165];
    const lead = [440, 0, 523, 0, 659, 587, 0, 523, 440, 0, 392, 440, 0, 0, 349, 392];
    const s = this.musicStep++;
    if (s % 2 === 0) this.blip(bass[(s / 2) % 8], 0.22, 'triangle', 0.10);
    const note = lead[s % 16];
    if (note) this.blip(note, 0.18, 'sine', 0.05);
  }
}
