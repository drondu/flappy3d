/**
 * Procedural retro sound synthesizer using Web Audio API.
 * Zero external audio assets required.
 */
class SoundFX {
  constructor(storageKey = "flappy_muted") {
    this.ctx = null;
    this.storageKey = storageKey;
    this.muted = this._loadMuted();
  }

  _loadMuted() {
    try {
      return localStorage.getItem(this.storageKey) === "1";
    } catch {
      return false;
    }
  }

  _ensureContext() {
    if (this.muted) return null;
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return null;
      this.ctx = new AudioCtx();
    }
    if (this.ctx.state === "suspended") {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  toggleMute() {
    this.muted = !this.muted;
    try {
      localStorage.setItem(this.storageKey, this.muted ? "1" : "0");
    } catch {
      // Ignore storage errors in private contexts
    }
    return this.muted;
  }

  flap() {
    const ctx = this._ensureContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = "triangle";
    osc.frequency.setValueAtTime(240, now);
    osc.frequency.exponentialRampToValueAtTime(540, now + 0.085);

    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.14, now + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.095);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.1);
  }

  score() {
    const ctx = this._ensureContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const notes = [987.77, 1318.51]; // B5 -> E6

    notes.forEach((freq, i) => {
      const t = now + i * 0.075;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, t);

      gain.gain.setValueAtTime(0.001, t);
      gain.gain.linearRampToValueAtTime(0.14, t + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.17);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.18);
    });
  }

  hit() {
    const ctx = this._ensureContext();
    if (!ctx) return;

    const now = ctx.currentTime;

    // Low impact thud
    const osc = ctx.createOscillator();
    const oscGain = ctx.createGain();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(160, now);
    osc.frequency.exponentialRampToValueAtTime(42, now + 0.14);

    oscGain.gain.setValueAtTime(0.2, now);
    oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);

    osc.connect(oscGain);
    oscGain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.17);

    // Filtered noise burst
    const bufferSize = Math.floor(ctx.sampleRate * 0.11);
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
    }

    const noise = ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(900, now);

    const nGain = ctx.createGain();
    nGain.gain.setValueAtTime(0.18, now);
    nGain.gain.exponentialRampToValueAtTime(0.001, now + 0.11);

    noise.connect(filter);
    filter.connect(nGain);
    nGain.connect(ctx.destination);
    noise.start(now);
  }

  die() {
    const ctx = this._ensureContext();
    if (!ctx) return;

    const now = ctx.currentTime + 0.1;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = "triangle";
    osc.frequency.setValueAtTime(420, now);
    osc.frequency.exponentialRampToValueAtTime(110, now + 0.28);

    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.12, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.31);
  }
}
