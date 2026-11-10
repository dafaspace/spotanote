// Spotanote's sound chip, modelled on the NES APU (2A03) as documented on the NESdev Wiki (APU, APU Pulse, APU Triangle, APU Noise, APU Envelope, APU Mixer):
// two pulse voices with the chip's four duty cycles, a 32-step triangle, a 15-bit LFSR noise voice, envelopes clocked at the chip's 240 Hz quarter-frame,
// the non-linear mixer and the console's output filters. Pitches are snapped to the periods the real chip can play.
// Pure DSP, no Web Audio here: the AudioWorklet (chip-worklet.js) and the Node tests both drive this class.
export const CPU = 1789773;
const NOISE_PERIODS = [4, 8, 16, 32, 64, 96, 128, 160, 202, 254, 380, 508, 762, 1016, 2034, 4068];
const TRI_STEPS = [15, 14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15];
export const DUTIES = [0.125, 0.25, 0.5, 0.75];

// Frequencies the chip can actually produce: pulse f = CPU / (16 (t+1)), triangle f = CPU / (32 (t+1)), t an 11-bit timer.
export function chipFreq(f, kind) {
  const div = kind === 'tri' ? 32 : 16;
  const t = Math.max(kind === 'tri' ? 2 : 8, Math.min(2047, Math.round(CPU / (div * f) - 1)));
  return CPU / (div * (t + 1));
}
export const midiFreq = m => 440 * 2 ** ((m - 69) / 12);

// PolyBLEP: removes the aliasing of an ideal step, so a pulse sounds like the chip and not like a digital buzz.
function blep(t, dt) {
  if (t < dt) { t /= dt; return t + t - t * t - 1; }
  if (t > 1 - dt) { t = (t - 1) / dt; return t * t + t + t + 1; }
  return 0;
}

class OnePole {
  constructor(sr, hz, high) { this.high = high; this.a = Math.exp(-2 * Math.PI * hz / sr); this.y = 0; this.x = 0; }
  run(x) {
    if (this.high) { const y = this.a * (this.y + x - this.x); this.x = x; this.y = y; return y; }
    this.y = (1 - this.a) * x + this.a * this.y; return this.y;
  }
}

export class Chip {
  constructor(sr, { nesFilters = true } = {}) {
    this.sr = sr;
    this.time = 0; // seconds of audio rendered
    this.quarter = sr / 240; this.quarterLeft = this.quarter;
    this.v = [0, 1, 2, 3].map(i => ({ kind: ['pulse', 'pulse', 'tri', 'noise'][i], on: false, freq: 440, phase: 0, duty: 0.5, vol: 0, decay: 0, decayLeft: 0, slide: 0, lfsr: 1, short: false, noiseHz: 0, noiseAcc: 0, out: 0, g: 0 }));
    // Each voice's level glides to its target in about a millisecond: a note that stops mid-cycle fades instead of clicking. The chip's own stepped envelopes stay audible.
    this.glide = 1 - Math.exp(-1 / (0.001 * sr));
    this.queue = [];
    this.filters = nesFilters ? [new OnePole(sr, 90, true), new OnePole(sr, 440, true), new OnePole(sr, 14000, false)] : [new OnePole(sr, 20, true)];
  }
  // ev: { at (s), ch 0-3, cmd 'on'|'off', midi | freq, vol 0-15, duty 0-3, decay (quarter-frames per volume step, 0 = hold), slide (semitones per quarter-frame), noise (0-15 period index), short }
  schedule(ev) {
    let i = this.queue.length;
    while (i > 0 && this.queue[i - 1].at > ev.at) i--;
    this.queue.splice(i, 0, ev);
  }
  clear() { this.queue.length = 0; for (const v of this.v) v.on = false; }
  apply(ev) {
    const v = this.v[ev.ch];
    if (ev.cmd === 'off') { v.on = false; return; }
    v.on = true; v.vol = ev.vol ?? 15; v.decay = ev.decay ?? 0; v.decayLeft = v.decay; v.slide = ev.slide ?? 0;
    if (v.kind === 'noise') { v.noiseHz = CPU / NOISE_PERIODS[ev.noise ?? 8]; v.short = !!ev.short; return; }
    const f = ev.freq ?? midiFreq(ev.midi);
    v.freq = chipFreq(f, v.kind);
    if (v.kind === 'pulse') v.duty = DUTIES[ev.duty ?? 2];
  }
  quarterFrame() {
    for (const v of this.v) {
      if (!v.on) continue;
      if (v.decay > 0 && v.kind !== 'tri' && --v.decayLeft <= 0) { v.decayLeft = v.decay; if (v.vol > 0) v.vol--; else v.on = false; }
      if (v.slide && v.kind !== 'noise') v.freq = chipFreq(v.freq * 2 ** (v.slide / 12), v.kind);
    }
  }
  render(out, start = 0, n = out.length - start) {
    const sr = this.sr, dtS = 1 / sr, [p1, p2, tr, ns] = this.v;
    for (let i = 0; i < n; i++) {
      while (this.queue.length && this.queue[0].at <= this.time) this.apply(this.queue.shift());
      if (--this.quarterLeft <= 0) { this.quarterLeft += this.quarter; this.quarterFrame(); }
      for (const v of this.v) v.g += ((v.on ? (v.kind === 'tri' ? 1 : v.vol) : 0) - v.g) * this.glide;
      for (const p of [p1, p2]) {
        if (p.g < 1e-4) { p.out = 0; continue; }
        const dt = p.freq / sr;
        let s = p.phase < p.duty ? 1 : 0;
        s += 0.5 * blep(p.phase, dt);
        let q = p.phase - p.duty; if (q < 0) q += 1;
        s -= 0.5 * blep(q, dt);
        p.out = Math.max(0, Math.min(1, s)) * p.g;
        p.phase += dt; if (p.phase >= 1) p.phase -= 1;
      }
      if (tr.g > 1e-4) { tr.out = TRI_STEPS[Math.floor(tr.phase * 32) & 31] * tr.g; tr.phase += tr.freq / sr; if (tr.phase >= 1) tr.phase -= 1; } else tr.out = 0;
      if (ns.g > 1e-4) {
        ns.noiseAcc += ns.noiseHz / sr;
        while (ns.noiseAcc >= 1) { ns.noiseAcc -= 1; const bit = (ns.lfsr ^ (ns.lfsr >> (ns.short ? 6 : 1))) & 1; ns.lfsr = (ns.lfsr >> 1) | (bit << 14); }
        ns.out = (ns.lfsr & 1) ? 0 : ns.g;
      } else ns.out = 0;
      const ps = p1.out + p2.out, tnd = tr.out / 8227 + ns.out / 12241;
      let y = (ps > 0 ? 95.88 / (8128 / ps + 100) : 0) + (tnd > 0 ? 159.79 / (1 / tnd + 100) : 0);
      for (const f of this.filters) y = f.run(y);
      out[start + i] = y;
      this.time += dtS;
    }
  }
}
