/**
 * TURBO QUILL audio — fully original, synthesized with the Web Audio API.
 * Music: look-ahead step sequencer with three tracks (menu / game / boss) and crossfades.
 * SFX: small synthesized one-shots with a polyphony cap, routed through a compressor.
 * Optional licensed files can be wired in via config/assets.js (see README).
 */
import { settings } from './settings.js';

const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

const TRACKS = {
  menu: { bpm: 92, bars: [[57, 'm'], [53, 'M'], [48, 'M'], [55, 'M']], kick: [1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0], hat: 0, snare: 0, bass: 0, arp: 'soft', pad: true, lead: false },
  game: { bpm: 148, bars: [[57, 'm'], [53, 'M'], [48, 'M'], [55, 'M'], [57, 'm'], [53, 'M'], [50, 'm'], [52, 'M']], kick: [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 1], hat: 1, snare: 1, bass: 1, arp: 'fast', pad: true, lead: true },
  boss: { bpm: 158, bars: [[50, 'm'], [46, 'M'], [43, 'm'], [45, 'M'], [50, 'm'], [46, 'M'], [43, 'm'], [38, 'M']], kick: [1, 0, 0, 1, 1, 0, 0, 0, 1, 0, 1, 0, 1, 0, 0, 0], hat: 2, snare: 1, bass: 2, arp: 'dark', pad: true, lead: true },
};
const LEAD = {
  game: [0, -1, 4, -1, 7, -1, 4, 0, 2, -1, 5, -1, 9, -1, 7, 4],
  boss: [0, 0, 3, -1, 0, 0, 7, -1, 6, -1, 3, -1, 0, -1, 1, -1],
};

class AudioEngine {
  constructor() { this.ctx = null; this.track = null; this.step = 0; this.nextTime = 0; this.timer = null; this.paused = false; this.sfxActive = 0; this.lastRing = 0; this.ringPitch = 0; this.unlocked = false; this.pendingTrack = 'menu'; }

  unlock() {
    if (this.unlocked) { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); return; }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      const c = this.ctx;
      this.master = c.createGain();
      this.comp = c.createDynamicsCompressor();
      this.comp.threshold.value = -14; this.comp.ratio.value = 6; this.comp.attack.value = 0.004; this.comp.release.value = 0.2;
      this.musicBus = c.createGain(); this.sfxBus = c.createGain();
      this.musicFilter = c.createBiquadFilter(); this.musicFilter.type = 'lowpass'; this.musicFilter.frequency.value = 20000;
      this.musicBus.connect(this.musicFilter); this.musicFilter.connect(this.master);
      this.sfxBus.connect(this.master); this.master.connect(this.comp); this.comp.connect(c.destination);
      this.trackGains = {};
      for (const k of Object.keys(TRACKS)) { const g = c.createGain(); g.gain.value = 0; g.connect(this.musicBus); this.trackGains[k] = g; }
      const len = c.sampleRate; this.noiseBuf = c.createBuffer(1, len, c.sampleRate);
      const d = this.noiseBuf.getChannelData(0); for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      this.unlocked = true;
      this.applyVolumes();
      if (c.state === 'suspended') c.resume();
      this.play(this.pendingTrack);
      document.addEventListener('visibilitychange', () => { if (!this.ctx) return; if (document.hidden) this.ctx.suspend(); else this.ctx.resume(); });
    } catch (e) { console.warn('Audio unavailable', e); this.ctx = null; }
  }

  applyVolumes() {
    if (!this.ctx) return;
    const s = settings.data, t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(s.muted ? 0 : 1, t, 0.03);
    this.musicBus.gain.setTargetAtTime(s.music * 0.55 * (this.paused ? 0.3 : 1), t, 0.05);
    this.sfxBus.gain.setTargetAtTime(s.sfx * 0.9, t, 0.03);
    this.musicFilter.frequency.setTargetAtTime(this.paused ? 900 : 20000, t, 0.08);
  }
  toggleMute() { settings.set('muted', !settings.data.muted); this.applyVolumes(); return settings.data.muted; }
  setPaused(p) { this.paused = p; this.applyVolumes(); }

  // ---------- music ----------
  play(name) {
    this.pendingTrack = name;
    if (!this.ctx || !TRACKS[name]) return;
    if (this.track === name) return;
    const c = this.ctx, t = c.currentTime;
    for (const [k, g] of Object.entries(this.trackGains)) { g.gain.cancelScheduledValues(t); g.gain.setTargetAtTime(k === name ? 1 : 0, t, 0.35); }
    this.track = name; this.step = 0; this.nextTime = t + 0.08;
    if (!this.timer) this.timer = setInterval(() => this.schedule(), 25);
  }
  stopMusic() { if (!this.ctx) return; const t = this.ctx.currentTime; Object.values(this.trackGains).forEach((g) => g.gain.setTargetAtTime(0, t, 0.2)); this.track = null; }

  schedule() {
    if (!this.ctx || !this.track || this.ctx.state !== 'running') return;
    const T = TRACKS[this.track], spb = 60 / T.bpm / 4;
    while (this.nextTime < this.ctx.currentTime + 0.14) { this.playStep(T, this.step, this.nextTime, spb); this.nextTime += spb; this.step++; }
  }
  playStep(T, step, t, spb) {
    const g = this.trackGains[this.track]; const s16 = step % 16, bar = Math.floor(step / 16) % T.bars.length;
    const [root, qual] = T.bars[bar]; const third = qual === 'm' ? 3 : 4;
    if (T.kick[s16]) this.kick(g, t, this.track === 'menu' ? 0.35 : 0.9);
    if (T.snare && (s16 === 4 || s16 === 12)) this.snare(g, t, 0.35);
    if (T.hat === 1 && s16 % 4 === 2) this.hat(g, t, 0.16);
    if (T.hat === 2 && s16 % 2 === 0) this.hat(g, t, 0.12);
    if (T.bass) {
      const on = T.bass === 1 ? (s16 % 2 === 0) : (s16 % 4 !== 3);
      if (on) this.bassNote(g, t, mtof(root - 24 + (s16 === 14 ? 7 : 0)), spb * (T.bass === 1 ? 1.7 : 1.2), T.bass === 2);
    }
    if (T.pad && s16 === 0) { for (const iv of [0, third, 7]) this.pad(g, t, mtof(root + 12 + iv), spb * 16); }
    if (T.arp) {
      const seq = [0, third, 7, 12, 7, third];
      const note = root + 24 + seq[step % seq.length];
      if (T.arp === 'soft' && s16 % 2 === 0) this.pluck(g, t, mtof(note - 12), spb * 3, 0.16, 'triangle', 2200);
      if (T.arp === 'fast') this.pluck(g, t, mtof(note), spb * 1.4, 0.07, 'square', 3200);
      if (T.arp === 'dark' && s16 % 2 === 1) this.pluck(g, t, mtof(note - 12), spb * 1.4, 0.09, 'sawtooth', 1800);
    }
    if (T.lead && LEAD[this.track]) {
      const n = LEAD[this.track][s16];
      if (n >= 0) this.pluck(g, t, mtof(root + 36 + (this.track === 'boss' ? 0 : 0) + n), spb * 1.8, 0.1, this.track === 'boss' ? 'sawtooth' : 'square', 4200);
    }
  }
  env(node, t, a, peak, dur) { node.gain.setValueAtTime(0.0001, t); node.gain.linearRampToValueAtTime(peak, t + a); node.gain.exponentialRampToValueAtTime(0.0001, t + dur); }
  kick(dst, t, v) { const c = this.ctx, o = c.createOscillator(), g = c.createGain(); o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.12); this.env(g, t, 0.002, v, 0.22); o.connect(g); g.connect(dst); o.start(t); o.stop(t + 0.25); }
  noiseHit(dst, t, v, dur, hp, bp) { const c = this.ctx, s = c.createBufferSource(), g = c.createGain(), f = c.createBiquadFilter(); s.buffer = this.noiseBuf; f.type = bp ? 'bandpass' : 'highpass'; f.frequency.value = hp; this.env(g, t, 0.001, v, dur); s.connect(f); f.connect(g); g.connect(dst); s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.02); }
  hat(dst, t, v) { this.noiseHit(dst, t, v, 0.05, 7000); }
  snare(dst, t, v) { this.noiseHit(dst, t, v, 0.16, 1800, true); const c = this.ctx, o = c.createOscillator(), g = c.createGain(); o.type = 'triangle'; o.frequency.setValueAtTime(220, t); o.frequency.exponentialRampToValueAtTime(110, t + 0.08); this.env(g, t, 0.001, v * 0.5, 0.1); o.connect(g); g.connect(dst); o.start(t); o.stop(t + 0.12); }
  bassNote(dst, t, f, dur, grit) { const c = this.ctx, o = c.createOscillator(), g = c.createGain(), lp = c.createBiquadFilter(); o.type = 'sawtooth'; o.frequency.value = f; lp.type = 'lowpass'; lp.frequency.setValueAtTime(grit ? 900 : 650, t); lp.frequency.exponentialRampToValueAtTime(180, t + dur); lp.Q.value = grit ? 8 : 4; this.env(g, t, 0.004, 0.42, dur); o.connect(lp); lp.connect(g); g.connect(dst); o.start(t); o.stop(t + dur + 0.02); }
  pad(dst, t, f, dur) { const c = this.ctx, g = c.createGain(), lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1400; g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.055, t + dur * 0.25); g.gain.linearRampToValueAtTime(0.0001, t + dur); lp.connect(g); g.connect(dst); for (const d of [-7, 7]) { const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; o.detune.value = d; o.connect(lp); o.start(t); o.stop(t + dur + 0.05); } }
  pluck(dst, t, f, dur, v, type, cutoff) { const c = this.ctx, o = c.createOscillator(), g = c.createGain(), lp = c.createBiquadFilter(); o.type = type; o.frequency.value = f; lp.type = 'lowpass'; lp.frequency.setValueAtTime(cutoff, t); lp.frequency.exponentialRampToValueAtTime(500, t + dur); this.env(g, t, 0.002, v, dur); o.connect(lp); lp.connect(g); g.connect(dst); o.start(t); o.stop(t + dur + 0.02); }

  // ---------- sfx ----------
  tone(f0, f1, dur, type = 'sine', vol = 0.4, delay = 0) {
    if (!this.ctx || this.ctx.state !== 'running' || this.sfxActive > 14) return;
    const c = this.ctx, t = c.currentTime + delay, o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(f0, t); if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    this.env(g, t, 0.004, vol, dur); o.connect(g); g.connect(this.sfxBus); o.start(t); o.stop(t + dur + 0.02);
    this.sfxActive++; o.onended = () => { this.sfxActive--; };
  }
  noise(dur, vol, freq, bp = false, delay = 0) { if (!this.ctx || this.ctx.state !== 'running' || this.sfxActive > 14) return; this.noiseHit(this.sfxBus, this.ctx.currentTime + delay, vol, dur, freq, bp); }
  sfx(name) {
    if (!this.ctx) return;
    switch (name) {
      case 'jump': this.tone(280, 640, 0.16, 'square', 0.16); break;
      case 'land': this.noise(0.07, 0.12, 400, true); break;
      case 'slide': this.noise(0.28, 0.14, 1400, true); break;
      case 'ring': { const n = this.ctx.currentTime; if (n - this.lastRing < 0.035) return; this.ringPitch = (n - this.lastRing < 0.45) ? Math.min(this.ringPitch + 1, 7) : 0; this.lastRing = n; const f = 880 * Math.pow(2, this.ringPitch / 12); this.tone(f, f, 0.12, 'sine', 0.3); this.tone(f * 1.5, f * 1.5, 0.2, 'triangle', 0.14, 0.04); break; }
      case 'powerup': [523, 659, 784, 1047, 1319].forEach((f, i) => this.tone(f, f, 0.22, 'square', 0.14, i * 0.07)); this.noise(0.5, 0.1, 3000, false, 0.0); break;
      case 'powerdown': [784, 523, 392].forEach((f, i) => this.tone(f, f * 0.9, 0.18, 'triangle', 0.2, i * 0.08)); break;
      case 'boost': this.noise(0.5, 0.2, 700, true); this.tone(200, 900, 0.45, 'sawtooth', 0.1); break;
      case 'pad': this.tone(330, 990, 0.3, 'sawtooth', 0.12); this.noise(0.25, 0.12, 2000, true); break;
      case 'hit': this.noise(0.25, 0.4, 900, true); this.tone(220, 60, 0.3, 'square', 0.3); break;
      case 'stomp': this.tone(500, 160, 0.14, 'square', 0.25); this.noise(0.1, 0.2, 1500, true); break;
      case 'enemy': this.tone(700, 120, 0.25, 'sawtooth', 0.22); this.noise(0.22, 0.25, 1200, true); break;
      case 'warn': this.tone(1100, 1100, 0.08, 'square', 0.1); this.tone(1100, 1100, 0.08, 'square', 0.1, 0.12); break;
      case 'shoot': this.tone(900, 200, 0.14, 'sawtooth', 0.14); break;
      case 'bolt': this.tone(1200, 300, 0.18, 'square', 0.18); break;
      case 'bossHit': this.noise(0.5, 0.45, 600, true); this.tone(160, 40, 0.5, 'sawtooth', 0.35); this.tone(1400, 400, 0.2, 'square', 0.15); break;
      case 'deflect': this.tone(1800, 1200, 0.08, 'triangle', 0.14); break;
      case 'bossRoar': this.tone(90, 45, 1.2, 'sawtooth', 0.4); this.noise(1.0, 0.25, 300, true); break;
      case 'explode': this.noise(1.2, 0.5, 500, true); this.tone(120, 25, 1.2, 'sawtooth', 0.45); break;
      case 'gate': this.tone(500, 1500, 0.3, 'triangle', 0.2); break;
      case 'win': [523, 659, 784, 1047, 784, 1047, 1319].forEach((f, i) => this.tone(f, f, 0.3, 'square', 0.16, i * 0.12)); break;
      case 'lose': [440, 392, 349, 262].forEach((f, i) => this.tone(f, f * 0.97, 0.4, 'triangle', 0.26, i * 0.2)); break;
      case 'click': this.tone(660, 660, 0.05, 'square', 0.1); break;
      case 'hover': this.tone(520, 520, 0.03, 'sine', 0.05); break;
      case 'heal': [660, 880, 1100].forEach((f, i) => this.tone(f, f, 0.15, 'sine', 0.2, i * 0.07)); break;
    }
  }
}
export const audio = new AudioEngine();
settings.onChange((k) => { if (['music', 'sfx', 'muted'].includes(k)) audio.applyVolumes(); });
