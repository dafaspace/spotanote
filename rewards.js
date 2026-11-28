'use strict';
/* Rewards v1 (Dafa, 27-28 Nov 2026; docs/REWARDS-2026-11.md and CLAUDE.md, "Решения владельца" of 27 and 28 Nov).
   A cell is clef x level x note set (3, 5, 8, 11): 24 cells, plus melodies (piece x clef). "Weak" earns nothing, its notes keep changing.
   Accuracy, by mistakes counted as a number (wrong keys + escaped notes): 1 bronze medal (90% or better, and at least 75% of the round's notes caught),
   2 silver medal (1-2 mistakes), 3 gold cup (no mistakes). Speed has one prize, lightning: the median time per note at or under ZAP seconds,
   with at most 2 mistakes. Cup and lightning in one round make the cell gold. Marks never go down and are kept under their own key, so
   "Reset statistics" leaves them; they have a reset of their own. Passing a harder cell gives bronze to every easier cell of the same clef,
   since the note sets are nested and the levels only add speed and sharps. Nothing is locked; Next suggests the next empty cell, and after
   Easy 11 a second button offers the other clef. */
const Rewards = (() => {
  const KEY = 'spotanote-cells', ZAP = 0.7, MIN_CAUGHT = 10, SETS = [3, 5, 8, 11];
  // glyphs: 22 x 22 pixel art built from geometry, so the medal is truly round (mockup v4, docs/mockups/rewards.html)
  const C = { dim: '#43503b', red: '#d0524a', redLo: '#9a3030', bronze: '#d08a4c', bronzeRim: '#7a4420', bronzeHi: '#f4c08c', silver: '#d6dccf', silverRim: '#6f7a6a', silverHi: '#ffffff', gold: '#f7b36b', goldRim: '#9a5a1a', goldHi: '#fff0b0', bolt: '#ffe66b', boltRim: '#9a7a10' };
  const N = 22, cache = {};
  const inCircle = (cx, cy, r) => (x, y) => (x + .5 - cx) ** 2 + (y + .5 - cy) ** 2 <= r * r;
  const inPoly = pts => (x, y) => { const px = x + .5, py = y + .5; let ins = false; for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) { const [xi, yi] = pts[i], [xj, yj] = pts[j]; if ((yi > py) !== (yj > py) && px < (xj - xi) * (py - yi) / (yj - yi) + xi) ins = !ins; } return ins; };
  const edge = (f, x, y) => f(x, y) && (!f(x - 1, y) || !f(x + 1, y) || !f(x, y - 1) || !f(x, y + 1));
  function svg(fn) { let r = ''; for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { const c = fn(x, y); if (c) r += `<rect x="${x}" y="${y}" width="1" height="1" fill="${c}"/>`; } return r; }
  const disc = inCircle(11, 13.5, 8.5), inner = inCircle(11, 13.5, 6.5);
  const ribL = inPoly([[3, 0], [9, 0], [13, 9], [8, 9]]), ribR = inPoly([[13, 0], [19, 0], [14, 9], [9, 9]]);
  const NOTE = new Set(['8,16', '9,16', '10,16', '7,17', '8,17', '9,17', '10,17', '8,18', '9,18', '11,9', '11,10', '11,11', '11,12', '11,13', '11,14', '11,15', '11,16', '12,10', '13,11', '14,12', '14,13', '13,14']);
  const bowl = (x, y) => (y >= 2 && y <= 7 && x >= 4 && x <= 17) || inCircle(11, 7, 7)(x, y) && y > 7 && y <= 12;
  const handles = (x, y) => { const l = inCircle(4.5, 6, 3.6)(x, y) && !inCircle(4.5, 6, 2)(x, y) && x < 5, r = inCircle(17.5, 6, 3.6)(x, y) && !inCircle(17.5, 6, 2)(x, y) && x > 16; return (l || r) && y >= 2 && y <= 10; };
  const cupAll = (x, y) => bowl(x, y) || handles(x, y) || (x >= 10 && x <= 11 && y >= 13 && y <= 16) || (y >= 17 && y <= 18 && x >= 7 && x <= 14) || (y >= 19 && y <= 20 && x >= 5 && x <= 16);
  const boltShape = inPoly([[14, 0], [4, 12], [10, 12], [6, 22], [18, 8], [12, 8], [17, 0]]);
  const ART = {
    slot: () => svg((x, y) => edge(disc, x, y) ? C.dim : null),
    bronze: () => medal('bronze'), silver: () => medal('silver'),
    cup: () => svg((x, y) => { if (!cupAll(x, y)) return null; if (handles(x, y) || (y === 2 && bowl(x, y)) || edge(cupAll, x, y)) return C.goldRim; if ((x === 6 && y >= 3 && y <= 8) || (x === 7 && y === 9)) return C.goldHi; return C.gold; }),
    bolt: () => svg((x, y) => !boltShape(x, y) ? null : edge(boltShape, x, y) ? C.boltRim : (x + y < 16 && x < 13 ? C.goldHi : C.bolt)),
    boltOff: () => svg((x, y) => boltShape(x, y) && edge(boltShape, x, y) ? C.dim : null)
  };
  function medal(m) { return svg((x, y) => { if (disc(x, y)) { if (edge(disc, x, y)) return C[m + 'Rim']; if (!inner(x, y) && x + y < 20 && x < 11 && y < 13) return C[m + 'Hi']; if (NOTE.has(x + ',' + y)) return C[m + 'Rim']; return C[m]; } if (ribR(x, y)) return C.redLo; if (ribL(x, y)) return C.red; return null; }); }
  function glyph(name, size, cls) { const body = cache[name] ??= ART[name](); return `<svg class="${cls || 'rw-g'}" width="${size}" height="${size}" viewBox="0 0 ${N} ${N}" shape-rendering="crispEdges" aria-hidden="true">${body}</svg>`; }
  const accName = a => ['slot', 'bronze', 'silver', 'cup'][a] || 'slot';
  // a cell's marks: the accuracy mark, and the lightning lying over its lower right corner, shifted, never shrinking either
  function marks(a, z, size) { return `<span class="rw-mark" style="width:${size}px;height:${size}px">${glyph(accName(a), size)}${z ? glyph('bolt', Math.round(size * .68), 'rw-zap') : ''}</span>`; }

  // storage
  function load() { try { const v = JSON.parse(localStorage.getItem(KEY) || '{}'); return v && typeof v === 'object' ? v : {}; } catch { return {}; } }
  function keep(all) { try { localStorage.setItem(KEY, JSON.stringify(all)); } catch {} }
  const get = id => load()[id] || { a: 0, z: 0 };
  const reset = () => { try { localStorage.removeItem(KEY); } catch {} };

  // the honest speed measure: from the moment a note becomes the one to catch (it appears, or the note before it is caught) to its catch
  function pace(journal) {
    const dts = []; let prev = 0;
    for (const [, t0, tc] of journal || []) if (tc >= 0) { dts.push(Math.max(0, tc - Math.max(t0, prev))); prev = tc; }
    if (!dts.length) return null;
    dts.sort((a, b) => a - b); const m = dts.length >> 1;
    return dts.length % 2 ? dts[m] : (dts[m - 1] + dts[m]) / 2;
  }
  function judge({ score, wrong, missed, acc, journal }) {
    const mistakes = wrong + missed, notes = (journal || []).length, p = pace(journal);
    const passed = score >= MIN_CAUGHT && acc >= 90 && score >= .75 * notes;
    const a = !passed ? 0 : mistakes === 0 ? 3 : mistakes <= 2 ? 2 : 1;
    const z = passed && mistakes <= 2 && p !== null && p <= ZAP ? 1 : 0;
    return { a, z, mistakes, pace: p };
  }
  const ids = clef => [0, 1, 2].flatMap(l => [0, 1, 2, 3].map(s => `${clef}:${l}:${s}`));
  // marks only rise; a pass on (level, set) fills bronze below it in the same clef
  function record(id, res, where) {
    const all = load(), before = all[id] || { a: 0, z: 0 }, after = { a: Math.max(before.a || 0, res.a), z: Math.max(before.z || 0, res.z) };
    const filled = [];
    if (after.a !== before.a || after.z !== before.z) all[id] = after;
    if (res.a && where && !where.piece && where.stage <= 3) for (let l = 0; l <= where.level; l++) for (let s = 0; s <= where.stage; s++) {
      const k = `${where.clef}:${l}:${s}`; if (k === id || (all[k] && all[k].a)) continue;
      all[k] = { a: 1, z: (all[k] && all[k].z) || 0, inf: 1 }; filled.push(k);
    }
    if (filled.length || all[id] === after) keep(all);
    return { id, res, before, after, filled, newA: after.a > (before.a || 0), newZ: after.z > (before.z || 0) };
  }
  const empty = (all, k) => !(all[k] && all[k].a);
  // where to go next, after a passed round: the next empty cell of this clef (wrapping), and after Easy 11 or a finished clef, the other hero
  function next(clef, level, stage) {
    const all = load(), list = ids(clef), at = list.indexOf(`${clef}:${level}:${stage}`), other = clef === 'treble' ? 'bass' : 'treble', out = [];
    const after = [...list.slice(at + 1), ...list.slice(0, Math.max(0, at))].find(k => empty(all, k));
    if (after) { const [, l, s] = after.split(':'); out.push({ clef, level: +l, stage: +s }); }
    const otherFirst = ids(other).find(k => empty(all, k));
    if (otherFirst && ((level === 0 && stage === 3) || !after)) { const [, l, s] = otherFirst.split(':'); out.push({ clef: other, level: +l, stage: +s, hero: true }); }
    return out;
  }
  const num = v => (Math.round(v * 10) / 10).toLocaleString(typeof lang === 'string' ? lang : 'en', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  // the round's own result, under the number cells: what was earned and the threshold of the next step, both in plain words
  function resultHtml(r) {
    if (!r) return '';
    const { res } = r, a = res.a;
    const accLine = a ? t(['', 'mk_bronze', 'mk_silver', 'mk_cup'][a]) : t('mk_none');
    const accHint = a === 3 ? '' : a === 2 ? t('mk_to_cup') : a === 1 ? t('mk_to_silver') : t('mk_to_bronze');
    const spdLine = res.pace === null ? '' : t('mk_pace', { s: num(res.pace) });
    const spdHint = res.z ? t('mk_zap') : t('mk_to_zap', { s: num(ZAP) });
    return `<div class="rw-row"><div class="rw-item${r.newA ? ' new' : ''}">${marks(a, 0, 48)}<span><b>${esc(accLine)}</b><small>${esc(t('mk_mistakes', { n: res.mistakes }))}${accHint ? ' · ' + esc(accHint) : ''}</small></span></div>`
      + `<div class="rw-item${r.newZ ? ' new' : ''}">${glyph(res.z ? 'bolt' : 'boltOff', 48)}<span><b>${esc(spdLine || t('mk_zap'))}</b><small>${esc(spdHint)}</small></span></div></div>`;
  }
  // the grid in Options: rows are levels, columns the note sets; a tap picks the cell
  function gridHtml(clef, level, stage) {
    const all = load(), name = k => t('lvl' + k.l) + ' · ' + SETS[k.s];
    let h = `<div class="rw-grid" role="group"><span></span>${SETS.map(n => `<span class="rw-col">${n}</span>`).join('')}`;
    for (let l = 0; l < 3; l++) {
      h += `<span class="rw-lvl">${esc(t('lvl' + l))}</span>`;
      for (let s = 0; s < 4; s++) {
        const c = all[`${clef}:${l}:${s}`] || { a: 0, z: 0 }, gold = c.a === 3 && c.z, here = l === level && s === stage;
        const label = name({ l, s }) + ': ' + (c.a ? t(['', 'mk_bronze', 'mk_silver', 'mk_cup'][c.a]) : t('mk_none')) + (c.z ? ', ' + t('mk_zap') : '');
        h += `<button type="button" class="rw-cell${c.a ? '' : ' empty'}${gold ? ' gold' : ''}${here ? ' here' : ''}" data-cell="${l}:${s}" aria-label="${esc(label)}"${here ? ' aria-current="true"' : ''}>${marks(c.a, c.z, 40)}</button>`;
      }
    }
    return h + `</div><p class="rw-legend">${esc(t('grid_legend', { s: num(ZAP) }))}</p>`;
  }

  // the two heroes, introduced once on the first visit before the tips (Dafa, 28 Nov 2026, answer "5 да")
  function paintHero(cv, name) {
    const h = typeof HEROES !== 'undefined' && HEROES[name]; if (!h || !cv.getContext) return;
    const box = 112, w = h.sprite[0].length * 4, ht = (h.sprite.length + 2) * 4; cv.width = box; cv.height = box;
    const g = cv.getContext('2d'); g.imageSmoothingEnabled = false;
    const k = Math.floor(Math.min(box / w, box / ht) * 4) / 4 || .25, ox = Math.round((box - w * k) / 2), oy = Math.round((box - ht * k) / 2);
    g.save(); g.translate(ox, oy); g.scale(k, k);
    h.sprite.forEach((r, y) => [...r].forEach((ch, x) => { if (ch !== '0') { g.fillStyle = ch === '1' ? h.outline : h.body; g.fillRect(x * 4, y * 4, 4, 4); } }));
    g.fillStyle = h.boots; h.feet.forEach(([x, y]) => g.fillRect(x * 4, y * 4, 12, 8));
    const f = h.face; g.fillStyle = h.outline; g.fillRect(f.e1, f.ey, 4, 6); g.fillRect(f.e2, f.ey, 4, 6);
    g.fillStyle = '#fff'; g.fillRect(f.e1 + 2, f.ey, 2, 2); g.fillRect(f.e2 + 2, f.ey, 2, 2);
    g.fillStyle = h.mouthColor; g.fillRect(f.mx, f.my, f.mw, 2); g.fillRect(f.mx - 2, f.my - 2, 2, 2); g.fillRect(f.mx + f.mw, f.my - 2, 2, 2);
    g.restore();
  }
  let heroesEl = null, heroesDone = null;
  function heroes(done) {
    if (typeof document === 'undefined' || !document.body) { if (done) done(); return; }
    heroesDone = done;
    if (!heroesEl) {
      heroesEl = document.createElement('div'); heroesEl.className = 'heroes-intro'; document.body.appendChild(heroesEl);
      heroesEl.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Escape' || e.key === 'Enter') { e.preventDefault(); closeHeroes(); } }, true);
    }
    const card = (id, cls) => `<figure class="polaroid ${cls}"><canvas data-hero="${id}" aria-hidden="true"></canvas><figcaption><b>${esc(HEROES[id].name)}</b><span class="role">${esc(t('hero_' + cls + '_role'))}</span><p>${esc(t('hero_' + cls + '_bio'))}</p></figcaption></figure>`;
    heroesEl.innerHTML = `<div class="dlg heroes-card" role="dialog" aria-modal="true" aria-labelledby="heroesTitle"><h2 id="heroesTitle">${esc(t('heroes_title'))}</h2><div class="heroes">${card('treble', 'pip')}${card('bass', 'bo')}</div><button class="px primary heroes-go" type="button">${esc(t('tour_next'))}</button></div>`;
    heroesEl.querySelectorAll('canvas[data-hero]').forEach(cv => paintHero(cv, cv.dataset.hero));
    heroesEl.querySelector('.heroes-go').onclick = closeHeroes;
    heroesEl.hidden = false; heroesEl.querySelector('.heroes-go').focus({ preventScroll: true });
  }
  function closeHeroes() { if (heroesEl) heroesEl.hidden = true; const d = heroesDone; heroesDone = null; if (d) d(); }

  return { ZAP, judge, pace, record, next, get, load, reset, marks, glyph, resultHtml, gridHtml, heroes };
})();
