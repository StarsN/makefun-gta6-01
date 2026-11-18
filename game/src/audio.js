// All sound is synthesised with WebAudio: engine hum pitched by speed, a
// two-tone siren that follows the nearest police car, gunshots, booms and
// little jingles, over a quiet A-minor bass-and-arp loop. No audio files.
// When no AudioContext exists (headless tests) every call is a no-op.

export class SoundBank {
  constructor(save) {
    this.ctx = null;
    this.master = null;
    this.muted = !!(save && save.muted);
    this.engineOsc = null; this.engineGain = null;
    this.sirenOsc = null; this.sirenGain = null;
    this.musicTimer = 0; this.musicStep = 0;
  }

  unlock() {
    if (this.ctx || typeof globalThis.AudioContext !== 'function') return;
    try {
      this.ctx = new globalThis.AudioContext();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.5;
      this.master.connect(this.ctx.destination);
      const mk = (type, freq, gain) => {
        const o = this.ctx.createOscillator(), gn = this.ctx.createGain();
        o.type = type; o.frequency.value = freq; gn.gain.value = 0;
        o.connect(gn); gn.connect(this.master); o.start();
        return { o, gn };
      };
      const eng = mk('sawtooth', 55, 0); this.engineOsc = eng.o; this.engineGain = eng.gn;
      const sir = mk('triangle', 700, 0); this.sirenOsc = sir.o; this.sirenGain = sir.gn;
    } catch { this.ctx = null; }
  }

  setMuted(m) {
    this.muted = m;
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(m ? 0 : 0.5, this.ctx.currentTime, 0.03);
  }

  tone(freq, dur, type = 'sine', vol = 0.2, slideTo = 0, delay = 0) {
    if (!this.ctx) return;
    const t0 = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator(), gn = this.ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t0);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t0 + dur);
    gn.gain.setValueAtTime(vol, t0);
    gn.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    o.connect(gn); gn.connect(this.master);
    o.start(t0); o.stop(t0 + dur + 0.02);
  }

  noise(dur, vol = 0.3, freq = 1200, delay = 0) {
    if (!this.ctx) return;
    const t0 = this.ctx.currentTime + delay;
    const len = Math.max(1, Math.floor(this.ctx.sampleRate * dur));
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource(); src.buffer = buf;
    const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = freq;
    const gn = this.ctx.createGain(); gn.gain.value = vol;
    src.connect(f); f.connect(gn); gn.connect(this.master);
    src.start(t0);
  }

  shot() { this.noise(0.09, 0.35, 2600); this.tone(160, 0.07, 'square', 0.12, 60); }
  dryFire() { this.tone(900, 0.03, 'square', 0.06); }
  reload() { this.tone(500, 0.05, 'square', 0.08); this.tone(700, 0.05, 'square', 0.08, 0, 0.12); }
  hit() { this.noise(0.05, 0.16, 1800); }
  crash(big) { this.noise(big ? 0.4 : 0.16, big ? 0.5 : 0.25, big ? 500 : 900); }
  explosion() { this.noise(0.8, 0.7, 300); this.tone(70, 0.7, 'sine', 0.5, 34); }
  honk() { this.tone(370, 0.14, 'square', 0.07); this.tone(370, 0.18, 'square', 0.07, 0, 0.2); }
  pickup() { this.tone(880, 0.08, 'sine', 0.18); this.tone(1320, 0.12, 'sine', 0.18, 0, 0.07); }
  cash() { this.tone(990, 0.07, 'triangle', 0.2); this.tone(1480, 0.1, 'triangle', 0.2, 0, 0.06); }
  phone() { this.tone(1175, 0.09, 'sine', 0.12); this.tone(1175, 0.09, 'sine', 0.12, 0, 0.16); }
  stinger() { [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.16, 'triangle', 0.2, 0, i * 0.09)); }
  fail() { this.tone(392, 0.18, 'triangle', 0.2, 370); this.tone(311, 0.3, 'triangle', 0.2, 262, 0.16); }
  sirenLevel(distPx, active) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const vol = active ? Math.max(0, 0.14 * (1 - distPx / 900)) : 0;
    this.sirenGain.gain.setTargetAtTime(vol, t, 0.1);
    if (active) this.sirenOsc.frequency.setTargetAtTime(650 + 250 * Math.sin(t * 4.2), t, 0.05);
  }
  engine(speedRatio, driving) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const vol = driving ? 0.05 + 0.05 * speedRatio : 0;
    this.engineGain.gain.setTargetAtTime(vol, t, 0.08);
    this.engineOsc.frequency.setTargetAtTime(50 + 130 * speedRatio, t, 0.08);
  }

  // A slow two-bar loop: A-minor bass pulse with a soft plucked arp.
  music(dt, playing) {
    if (!this.ctx || !playing) return;
    this.musicTimer -= dt;
    if (this.musicTimer > 0) return;
    this.musicTimer = 0.24;
    const bass = [110, 110, 130.8, 98];
    const arp = [440, 523, 659, 523, 440, 523, 784, 659];
    const s = this.musicStep++;
    if (s % 4 === 0) this.tone(bass[(s / 4) % 4 | 0], 0.9, 'triangle', 0.11);
    this.tone(arp[s % 8], 0.2, 'sine', 0.045);
  }
}
