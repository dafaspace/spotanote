'use strict';
/* The drum part under random notes, written the way NES composers wrote drums (Dafa, 25 Nov 2026: the first loop was thin, the same every bar, strong beats only).
   The kit is the chip's own: a kick is the triangle dropping fast in pitch with a low noise click, a snare is a bright noise crack over a short triangle
   punch, hats are the highest noise with a fast envelope, toms are triangle drops at three pitches, a crash is a long noise tail.
   One bar is 16 sixteenths. A phrase is 8 bars: grooves A A B A, a short fill ends bar 4, bar 8 ends in a long fill or a break,
   and the bar after either opens on a crash. The groove grows with the catch multiplier (x1 to x4), and a crash marks every step up.
   Pure: bar() picks the steps, hits() turns one step into chip events. catcher.js schedules them; tests/drums.mjs renders them offline. */
const Drums = (() => {
  // drum lane: k kick, s snare, g ghost snare, 1 2 3 toms high to low, c crash with a kick under it. hat lane: h hat, H accented hat, o open hat.
  // A hat sounds only where the drum lane rests: the chip has one noise voice, as the console had.
  const GROOVES = [
    [['k...s...k...s...', '..h...h...h...h.'], ['k...s...k.k.s...', '..h...h...h...h.']],
    [['k...s..k..k.s...', 'h.H.h.H.h.H.h.H.'], ['k...s.k...k.s..k', 'h.H.h.H.h.H.h.H.']],
    [['k..ks..g..k.s..g', 'hhHhhhHhhhHhhhHh'], ['k..ks..gk.k.s.g.', 'hhHhhhHhhhHhhhHh']],
    [['k..ks..gk.kks..g', 'hhHhhhHhhhHhhho.'], ['k.kks..gk..ks.g.', 'hhHhhhHhhhHhhho.']]
  ];
  const SHORT = ['gsss', '1123', 's.12', 'ssk3', 's1s2'];
  const LONG = ['s.s.ssss', 'ss112233', 'k.s.1.23', 'gsgs1122', 's..s..s.'];
  // breaks: the band stops, then a pickup brings it back
  const BREAKS = ['k...........gsss', 'k..k..k.....s.ss', 'c.......k...ssss'];
  function bar(n, tier, prevTier, rand = Math.random) {
    const t = Math.max(1, Math.min(4, tier)) - 1, inPhrase = n % 8;
    let [d, h] = GROOVES[t][inPhrase === 2 || inPhrase === 6 ? 1 : 0];
    let hatsUntil = 16;
    if (inPhrase === 7) {
      if (rand() < .35) { d = BREAKS[Math.floor(rand() * BREAKS.length)]; hatsUntil = 0; }
      else { const f = LONG[Math.floor(rand() * LONG.length)]; d = d.slice(0, 8) + f; hatsUntil = 8; }
    } else if (inPhrase === 3) { const f = SHORT[Math.floor(rand() * SHORT.length)]; d = d.slice(0, 12) + f; hatsUntil = 12; }
    // a crash opens the round, every phrase, and every step up in the multiplier
    if (n === 0 || inPhrase === 0 || tier > prevTier) d = 'c' + d.slice(1);
    return [...d].map((c, i) => c !== '.' ? c : i < hatsUntil && h[i] !== '.' ? h[i] : '.');
  }
  // One step as chip events. Noise hits end on their own envelope (no 'off'), so a long tail is cut only by the next hit, as on the console.
  const N = (at, noise, vol, decay) => ({ at, ch: 3, cmd: 'on', noise, vol, decay });
  const T = (at, midi, slide, len) => [{ at, ch: 2, cmd: 'on', midi, slide }, { at: at + len, ch: 2, cmd: 'off' }];
  function hits(c, at) {
    switch (c) {
      case 'k': return [...T(at, 52, -1.8, .06), N(at, 11, 6, 1)];
      case 'c': return [...T(at, 52, -1.8, .06), N(at, 2, 3, 16)];
      case 's': return [...T(at, 57, -3, .02), N(at, 4, 6, 1), N(at + .012, 6, 4, 3)];
      case 'g': return [N(at, 6, 3, 1)];
      case '1': case '2': case '3': return [...T(at, [50, 45, 40][c - 1], -1, .05), N(at, 10, 3, 1)];
      case 'h': return [N(at, 1, 3, 1)];
      case 'H': return [N(at, 1, 5, 1)];
      case 'o': return [N(at, 1, 3, 8)];
      default: return [];
    }
  }
  return { bar, hits, GROOVES, SHORT, LONG, BREAKS };
})();
if (typeof module !== 'undefined') module.exports = Drums;
