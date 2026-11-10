// AudioWorklet host for the chip: the main thread posts note events with AudioContext times, the chip renders them sample-exact.
import { Chip } from './chip-core.js';
class ChipProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.chip = new Chip(sampleRate);
    this.port.onmessage = e => { const m = e.data; if (m.clear) this.chip.clear(); for (const ev of m.events || []) this.chip.schedule(ev); };
  }
  process(_, outputs) {
    const out = outputs[0][0];
    this.chip.time = currentTime; // keep the chip's clock on the context's clock
    this.chip.render(out);
    return true;
  }
}
registerProcessor('chip', ChipProcessor);
