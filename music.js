'use strict';
// Melody mode with accompaniment (Dafa, 10 Nov 2026): the caught notes are the piece's melody, the chip plays the piece's own accompaniment under them,
// and the music waits for the player. One clock drives both the sound and the flight of the notes, so they cannot drift apart.

// MusicClock: position in beats and a tempo in beats per second. Only in the last sixth of a beat before a note that is not caught yet does the tempo ease down (a quarter-sine curve to rest),
// so a player who catches early hears a steady tempo, one who catches on the beat hears a slight rubato, and a late one hears the music settle and wait just short of the beat.
// A catch while waiting puts the clock on the beat and the tempo eases back to the base over one beat (a tempo); an early catch changes nothing but the next note to wait for.
class MusicClock {
  constructor(bpm, { window = 0.15, recover = 1 } = {}) { this.base = bpm / 60; this.tempo = this.base; this.beat = 0; this.hold = Infinity; this.window = window; this.recover = recover; this.from = this.base; this.recoverLeft = 0; }
  holdAt(beat) { this.hold = beat; }
  get holding() { return this.hold - this.beat < 2e-4; }
  step(dt) {
    let target = this.base;
    if (this.recoverLeft > 0) { const u = 1 - this.recoverLeft / (this.recover / this.base); target = this.from + (this.base - this.from) * (0.5 - 0.5 * Math.cos(Math.PI * Math.min(1, u))); this.recoverLeft -= dt; }
    const d = this.hold - this.beat;
    if (d < this.window) target = Math.min(target, this.base * Math.sin(Math.PI / 2 * Math.max(0, d) / this.window) + 0.02 * this.base * (d > 1e-4 ? 1 : 0));
    this.tempo = target;
    this.beat = Math.min(this.hold - 1e-4 * (this.hold < Infinity ? 1 : 0), this.beat + this.tempo * dt);
    if (this.hold - this.beat < 1e-4) { this.beat = this.hold - 1e-4; this.tempo = 0; }
    return this.beat;
  }
  // The awaited note is caught: if the clock was waiting it stands on the beat and recovers from a gentle 70% of the base tempo; an early catch leaves the clock alone.
  release(next) { if (this.hold - this.beat < 1e-3) this.beat = this.hold; if (this.tempo < this.base * 0.99) { this.from = Math.max(this.tempo, 0.7 * this.base); this.tempo = this.from; this.recoverLeft = this.recover / this.base; } this.hold = next; }
}

// Accompaniment data. Beats are quarter notes from the start of the excerpt, MIDI pitches already in the game's key (C major) and octave.
// b = triangle (bass), c = pulse 2 (soft chord tones). Minuet and Sonatina are the left hands of the same Mutopia files the melodies came from;
// Ode and Twinkle are a plain draft by Claude for Dafa to check by ear.
const triad = r => [r, r + (([0, 5, 7].includes(r % 12)) ? 4 : 3), r + 7]; // major on C, F, G; minor elsewhere in C major
function oomPah(chords, perChord, bassBase, chordBase) { // root on the triangle on the first beat, the third and fifth on the pulse on the second, per chord span
  const ev = []; chords.forEach((r, i) => { const b = i * perChord, [, third, fifth] = triad(r); ev.push([b, 'b', bassBase + r % 12, perChord * 0.9]); ev.push([b + 1, 'c', chordBase + third % 12, 0.4]); ev.push([b + 1.5, 'c', chordBase + fifth % 12, 0.4]); }); return ev;
}
const C = 0, F = 5, G = 7;
const ACCOMP = {
  // Petzold, Minuet BWV Anh. 114, left hand bars 1-6, transposed G -> C like the melody: C3/E3 G3 half, D3, then E3, F3, E3, D3, C3 dotted halves
  minuet: { bar: 3, bpm: [84, 100, 116], treble: [[0, 'b', 48, 2], [0, 'c', 55, 2], [2, 'b', 50, 1], [3, 'b', 52, 3], [6, 'b', 53, 3], [9, 'b', 52, 3], [12, 'b', 50, 3], [15, 'b', 48, 3]] },
  // Clementi, Sonatina Op.36 No.1, left hand bars 1-4, one octave below the source so it sits under the melody (which the game plays two octaves down)
  clementi: { bar: 4, bpm: [88, 104, 120], bass: [[0, 'b', 36, 1], [4, 'b', 36, 1], [8, 'b', 36, 1], [10, 'b', 36, 1], [12, 'b', 31, 1], [14, 'b', 43, 0.5], [14.5, 'b', 41, 0.5], [15, 'b', 40, 0.5], [15.5, 'b', 38, 0.5]] },
  // Ode to Joy: | C C | G G | C C | C G | C C | G G | C C | G C |, a chord every two beats
  ode: { bar: 4, bpm: [84, 100, 116], chords: [C, C, G, G, C, C, C, G, C, C, G, G, C, C, G, C], per: 2 },
  // Twinkle: six two-bar phrases, a chord every two beats: C C F C | F C G C | C F C G | C F C G | C C F C | F C G C
  twinkle: { bar: 4, bpm: [84, 100, 116], chords: [C, C, F, C, F, C, G, C, C, F, C, G, C, F, C, G, C, C, F, C, F, C, G, C], per: 2 }
};
function accompaniment(name, clef) {
  const a = ACCOMP[name]; if (!a) return null;
  if (a[clef]) return a[clef].map(([beat, v, midi, len]) => ({ beat, v, midi, len }));
  if (!a.chords) return null;
  // triangle bass from C2 in both clefs; chord tones stay out of the melody's octave: C3-B3 under a treble melody, C4-B4 over a bass-clef one
  return oomPah(a.chords, a.per, 36, clef === 'treble' ? 48 : 60).map(([beat, v, midi, len]) => ({ beat, v, midi, len }));
}

// Accompanist: owns the clock for one round of a piece, tells the game where each note is, and schedules the chip 60 ms ahead, never past the awaited note.
// One bar of introduction (Dafa, 11 Nov 2026): the accompaniment plays the piece's first bar with a quiet count-in tick on every beat while the first notes fly in from the far side,
// so the player hears the tempo and catches the first note in rhythm. The downbeat of every note sounds on time; the music waits only when a note is still not caught a quarter of a beat later.
const GRACE = 0.25;
class Accompanist {
  constructor(name, clef, level, sound) {
    this.sound = sound; this.melody = []; let b = 0;
    PIECES[name][clef].forEach((m, i) => { this.melody.push({ beat: b, midi: m, len: PIECES[name].dur[i] }); b += PIECES[name].dur[i]; });
    const a = ACCOMP[name] || { bpm: [84, 100, 116] }, bar = a.bar || 4, body = accompaniment(name, clef) || [];
    const intro = body.filter(e => e.beat < bar).map(e => ({ ...e, beat: e.beat - bar })), ticks = Array.from({ length: bar }, (_, i) => ({ beat: i - bar, v: 'n', accent: i === 0 }));
    this.end = b; this.events = [...intro, ...ticks, ...body].sort((x, y) => x.beat - y.beat); this.next = 0; this.head = 0;
    this.clock = new MusicClock(a.bpm[level] || 100);
    this.lead = bar; this.clock.beat = 0; this.clock.holdAt(this.noteBeat(0) + GRACE);
    this.done = false; this.lastBass = 48; this.vampAt = 0;
  }
  noteBeat(i) { return this.melody[i].beat + this.lead; }
  // the game calls this every frame with the elapsed seconds and the audio time
  tick(dt, now) {
    const c = this.clock;
    if (this.head >= this.melody.length) c.hold = this.end + this.lead + 1;
    c.step(dt);
    // schedule events whose beat comes within the next 60 ms at the current tempo, but never at or past the awaited beat
    const ahead = c.beat + Math.max(c.tempo, 0) * 0.06;
    while (this.next < this.events.length) {
      const e = this.events[this.next], eb = e.beat + this.lead;
      if (eb > ahead || eb >= c.hold) break;
      const at = now + Math.max(0, (eb - c.beat) / Math.max(c.tempo, 1e-3)), len = e.len / Math.max(c.base, 1e-3);
      this.play(e, at, len); this.next++;
    }
    if (c.holding && this.head < this.melody.length) this.vamp(now); else this.vampAt = now;
    if (this.head >= this.melody.length && this.next >= this.events.length && c.beat >= this.end + this.lead + 0.5) this.done = true;
  }
  play(e, at, len) {
    if (!this.sound) return;
    if (e.v === 'n') { this.sound.note(3, 0, at, 0.03, { noise: 1, vol: e.accent ? 5 : 3, decay: 1 }); return; }
    if (e.v === 'b') { this.lastBass = e.midi; this.sound.note(2, e.midi, at, len * 0.95); }
    else this.sound.note(1, e.midi, at, len * 0.9, { duty: 0, vol: 4, decay: 2 });
  }
  // While waiting: the bass is held and a quiet arpeggio of it (octave, fifth, octave) turns over every eighth, so the wait sounds like a fermata, not a gap.
  vamp(now) {
    if (!this.sound || now - this.vampAt < 0.5 / this.clock.base) return;
    this.vampAt = now; const m = this.lastBass, k = Math.round(now * this.clock.base * 2) % 3;
    this.sound.note(1, m + [12, 19, 24][k], now, 0.18, { duty: 0, vol: 3, decay: 2 });
  }
  // the awaited note was caught (by index): the clock moves on and will wait, if it must, a quarter beat after the next note's downbeat
  caught() {
    this.head++;
    const next = this.head < this.melody.length ? this.noteBeat(this.head) + GRACE : this.end + this.lead + 1;
    this.clock.release(next);
  }
  start() { this.clock.holdAt(this.noteBeat(0) + GRACE); }
}
if (typeof module !== 'undefined') module.exports = { MusicClock, Accompanist, accompaniment, ACCOMP };
