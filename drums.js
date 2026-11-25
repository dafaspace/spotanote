'use strict';
/* The drum part under random notes, written the way NES composers wrote drums (Dafa, 25 Nov 2026: the first loop was thin, the same every bar, strong beats only;
   then: five styles, each growing the same way, with different rhythms).
   The kit is the chip's own: a kick is the triangle dropping fast in pitch with a low noise click, a snare is a bright noise crack over a short triangle
   punch, hats are the highest noise with a fast envelope, toms are triangle drops at three pitches, a crash is a long noise tail.
   Every style follows one plan. A phrase is 8 bars: grooves A A B A, a short fill ends bar 4, bar 8 ends in a long fill or a break,
   and the bar after either opens on a crash. The groove grows with the catch multiplier (x1 to x4), and a crash marks every step up.
   A bar is 16 sixteenths, or 12 triplet eighths for the shuffle; a short fill is its last quarter, a long fill its second half.
   Pure: bar() picks the steps, hits() turns one step into chip events. catcher.js schedules them; tests/drums.mjs renders them offline. */
const Drums = (() => {
  // drum lane: k kick, s snare, x kick and snare together, g ghost snare, 1 2 3 toms high to low, c crash with a kick under it.
  // hat lane: h hat, H accented hat, o open hat. A hat sounds only where the drum lane rests: the chip has one noise voice, as the console had.
  // grooves: [tier x1..x4][A, B] = [drum lane, hat lane]
  const STYLES = {
    beat: {
      grooves: [
        [['k...s...k...s...', '..h...h...h...h.'], ['k...s...k.k.s...', '..h...h...h...h.']],
        [['k...s..k..k.s...', 'h.H.h.H.h.H.h.H.'], ['k...s.k...k.s..k', 'h.H.h.H.h.H.h.H.']],
        [['k..ks..g..k.s..g', 'hhHhhhHhhhHhhhHh'], ['k..ks..gk.k.s.g.', 'hhHhhhHhhhHhhhHh']],
        [['k..ks..gk.kks..g', 'hhHhhhHhhhHhhho.'], ['k.kks..gk..ks.g.', 'hhHhhhHhhhHhhho.']]],
      short: ['gsss', '1123', 's.12', 'ssk3', 's1s2'],
      long: ['s.s.ssss', 'ss112233', 'k.s.1.23', 'gsgs1122', 's..s..s.'],
      breaks: ['k...........gsss', 'k..k..k.....s.ss', 'c.......k...ssss']
    },
    // triplet swing: beats on steps 0 3 6 9, ghosts on the middle triplet, hats on the swung off-beat 2 5 8 11
    shuffle: {
      grooves: [
        [['k..s..k..s..', '..h..h..h..h'], ['k..s..k.ks..', '..h..h.....h']],
        [['k..s..k.ks..', '..H..h..H..h'], ['k..s.kk..s..', '..H.....H..h']],
        [['kg.sg.kgksg.', '..h..H.....h'], ['kg.sg.kgks.k', '..h..H....h.']],
        [['kgksg.kgksg.', '.....H.....o'], ['kgksg.kgks.k', '.....H....o.']]],
      short: ['gss', '123', 's.3', 'ss1', 's23'],
      long: ['s.ss.s', 'ss1122', 's.1.23', 'gsg123', 's..s..'],
      breaks: ['k........gss', 'k..k..k..sss', 'c.....k..s.s']
    },
    // four on the floor, open hats on the off-beats
    disco: {
      grooves: [
        [['k...x...k...x...', '..o...o...o...o.'], ['k...x...k...x.k.', '..o...o...o...o.']],
        [['k...x...k...x...', '.ho..ho..ho..ho.'], ['k...x...k.k.x...', '.ho..ho..ho..ho.']],
        [['k...x..gk...x.g.', 'hhohhhohhhohhhoh'], ['k...x..gk.k.x.g.', 'hhohhhohhhohhhoh']],
        [['k...x.gkk...x.gk', 'hhohhhohhhohhhoh'], ['k...x..gk..kx.gs', 'hhohhhohhhohhhoh']]],
      short: ['xsss', '1123', 'x.ss', 's1s1', 'xx11'],
      long: ['x.x.ssss', 'ss112233', 'k.s.k.ss', 'xsxs1122', 'x..x..x.'],
      breaks: ['k...........ssss', 'k...k...k...x.xx', 'c.......k.k.ssss']
    },
    // syncopated kicks and ghost notes around a backbeat
    funk: {
      grooves: [
        [['k..ks..k..k.s...', 'h.h.h.h.h.h.h.h.'], ['k..ks.....kks...', 'h.h.h.h.h.h.h.h.']],
        [['k..ks.gk..k.s.g.', 'h.H.h.H.h.H.h.H.'], ['k.gks..k.gk.s..k', 'h.H.h.H.h.H.h.H.']],
        [['k.gks.gk.gk.sg.k', 'hHhhhHhhhHhhhHhh'], ['kg.ks.gk.gkks.gk', 'hHhhhHhhhHhhhHhh']],
        [['k.gks.gkkgk.sg.k', 'hHhhhHhohHhhhHho'], ['kgkks.gk.gkks.gs', 'hHhhhHhohHhhhHho']]],
      short: ['gsgs', 's123', 'ssgs', '1g2g', 'sg3k'],
      long: ['gsgsgsgs', 's.gs1.23', 'ss.ss.ss', 'kgsg1g2g', 'k.gsk.gs'],
      breaks: ['k.....s.......ss', 'k..k..s..k..ssss', 'c.........k.s.ss']
    },
    // a snare band: kick on the beat, snare figures between
    march: {
      grooves: [
        [['k.s.k.s.k.s.k.s.', '................'], ['k.s.k.s.k.s.kss.', '................']],
        [['k.s.k.ssk.s.k.ss', '................'], ['k.s.k.s.k.ssk.s.', '................']],
        [['k.sgk.ssk.sgk.ss', '.h.h.h.h.h.h.h.h'], ['k.ssk.sgk.ssk.sg', '.h.h.h.h.h.h.h.h']],
        [['k.sgk.ssk.ssk.ss', '.H.h.H.h.H.h.H.h'], ['kssgk.ssk.sgksss', '.H.h.H.h.H.h.H.h']]],
      short: ['ssss', 's.ss', 'sss.', '1.23', 'ss12'],
      long: ['ssssssss', 's.sss.ss', 'k.ssk.ss', 'ss.ss123', 'sss.sss.'],
      breaks: ['k.......k...ssss', 'k...k...k...k.ss', 'c.......s.s.ssss']
    }
  };
  const NAMES = Object.keys(STYLES);
  const steps = style => (STYLES[style] || STYLES.beat).grooves[0][0][0].length;
  // the style of one round: the one chosen, or with 'mix' any style but the last one
  function pick(choice, last, rand = Math.random) {
    if (STYLES[choice]) return choice;
    const pool = NAMES.filter(n => n !== last);
    return pool[Math.floor(rand() * pool.length)];
  }
  function bar(style, n, tier, prevTier, rand = Math.random) {
    const S = STYLES[style] || STYLES.beat, len = steps(style), q = len / 4;
    const t = Math.max(1, Math.min(4, tier)) - 1, inPhrase = n % 8, any = a => a[Math.floor(rand() * a.length)];
    let [d, h] = S.grooves[t][inPhrase === 2 || inPhrase === 6 ? 1 : 0];
    let hatsUntil = len;
    if (inPhrase === 7) {
      if (rand() < .35) { d = any(S.breaks); hatsUntil = 0; }
      else { d = d.slice(0, 2 * q) + any(S.long); hatsUntil = 2 * q; }
    } else if (inPhrase === 3) { d = d.slice(0, 3 * q) + any(S.short); hatsUntil = 3 * q; }
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
      case 'x': return [...T(at, 52, -1.8, .06), N(at, 4, 6, 1), N(at + .012, 6, 4, 3)];
      case 'g': return [N(at, 6, 3, 1)];
      case '1': case '2': case '3': return [...T(at, [50, 45, 40][c - 1], -1, .05), N(at, 10, 3, 1)];
      case 'h': return [N(at, 1, 3, 1)];
      case 'H': return [N(at, 1, 5, 1)];
      case 'o': return [N(at, 1, 3, 8)];
      default: return [];
    }
  }
  return { STYLES, NAMES, steps, pick, bar, hits };
})();
if (typeof module !== 'undefined') module.exports = Drums;
