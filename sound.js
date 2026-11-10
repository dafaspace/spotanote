'use strict';
// The game's voice: the NES-style chip (chip-core.js in an AudioWorklet) plus an optional warm finish.
// Warm: a low shelf brings back the body the console's 440 Hz filter takes away, a "TV speaker" low-pass softens the top, a gentle tape-like saturation and a short room glue it.
// Clean: the chip straight, for people who want the console as it was. Browsers without AudioWorklet keep the old simple oscillator (Chip.ready stays false).
const Sound = {
  ctx: null, node: null, ready: false, warm: true,
  start(ctx) {
    if (this.ctx || !ctx || !ctx.audioWorklet) return;
    this.ctx = ctx;
    ctx.audioWorklet.addModule('chip-worklet.js').then(() => {
      this.node = new AudioWorkletNode(ctx, 'chip', { numberOfInputs: 0, outputChannelCount: [1] });
      this.build(); this.ready = true;
    }).catch(() => { this.ready = false; });
  },
  build() {
    const c = this.ctx;
    this.master = c.createGain(); this.master.gain.value = 0.8; this.master.connect(c.destination);
    // The chip's mixer peaks near 0.25 for one voice: a pre-gain brings it to a normal level. Clean gets more of it, so switching style compares sound, not loudness (measured 10 Nov 2026: catch RMS warm 0.028, clean 0.012 at equal gain).
    this.pre = c.createGain();
    this.low = c.createBiquadFilter(); this.low.type = 'lowshelf'; this.low.frequency.value = 180; this.low.gain.value = 5;
    this.tv = c.createBiquadFilter(); this.tv.type = 'lowpass'; this.tv.frequency.value = 5500; this.tv.Q.value = 0.6;
    this.sat = c.createWaveShaper(); const n = 1024, curve = new Float32Array(n); for (let i = 0; i < n; i++) { const x = i / (n - 1) * 2 - 1; curve[i] = Math.tanh(1.8 * x) / Math.tanh(1.8); } this.sat.curve = curve; this.sat.oversample = '2x';
    this.room = c.createConvolver(); const len = Math.round(c.sampleRate * 0.35), ir = c.createBuffer(2, len, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) { const d = ir.getChannelData(ch); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.exp(-i / (c.sampleRate * 0.07)); }
    this.room.buffer = ir; this.wet = c.createGain(); this.wet.gain.value = 0.16;
    this.low.connect(this.tv); this.tv.connect(this.sat); this.sat.connect(this.master); this.sat.connect(this.room); this.room.connect(this.wet); this.wet.connect(this.master);
    this.setWarm(this.warm);
  },
  setWarm(on) {
    this.warm = on;
    if (!this.node) return;
    this.node.disconnect(); this.pre.disconnect();
    this.node.connect(this.pre); this.pre.gain.value = on ? 2.2 : 5;
    this.pre.connect(on ? this.low : this.master);
  },
  send(events) { if (this.ready) this.node.port.postMessage({ events }); },
  clear() { if (this.ready) this.node.port.postMessage({ clear: true }); },
  now() { return this.ctx ? this.ctx.currentTime : 0; },
  // One note on a voice: ch 0-1 pulse, 2 triangle, 3 noise. dur in seconds; the voice is released at the end.
  note(ch, midi, at, dur, o = {}) { this.send([{ at, ch, cmd: 'on', midi, vol: o.vol ?? 12, duty: o.duty ?? 1, decay: o.decay ?? 0, slide: o.slide ?? 0, noise: o.noise, short: o.short }, { at: at + dur, ch, cmd: 'off' }]); }
};
