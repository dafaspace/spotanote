'use strict';
/* First-visit tips and one hint for a player who is stuck (Dafa, 26 Nov 2026: a short tour of 3 steps, plus a hint after two wrong presses in a row).
   The tour points at the real controls: the staff and piano, the mode button, the Options button. It shows once, to a player with no stats yet,
   and Options has "Show tips again". Esc skips, Enter goes on; the game's own keys are held while it is open.
   The hint offers note names on the keys when they are off and two presses in a row were wrong; it shows once ever and never pauses the round. */
const Tour = (() => {
  const STEPS = [
    { text: 'tour_1', at: () => [document.querySelector('#piano')] },
    { text: 'tour_2', at: () => [document.querySelector('#modeBtn')] },
    { text: 'tour_3', at: () => [document.querySelector('#optionsBtn')] }
  ];
  let i = -1, root, ring, card, wrongRun = 0, hintEl, hintTimer;
  const el = (tag, cls, parent) => { const e = document.createElement(tag); if (cls) e.className = cls; if (parent) parent.appendChild(e); return e; };
  function build() {
    root = el('div', 'tour', document.body); root.hidden = true;
    ring = el('div', 'tour-ring', root);
    card = el('div', 'tour-card dlg', root); card.setAttribute('role', 'dialog'); card.setAttribute('aria-modal', 'true'); card.setAttribute('aria-live', 'polite');
    card.innerHTML = '<p class="tour-text"></p><div class="tour-foot"><span class="tour-step"></span><button class="px quiet tour-skip"></button><button class="px primary tour-next"></button></div>';
    card.querySelector('.tour-skip').onclick = () => finish();
    card.querySelector('.tour-next').onclick = () => go(i + 1);
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    // capture phase, so the piano and Space never reach the game while a tip is open
    window.addEventListener('keydown', e => {
      if (root.hidden || e.key === 'Tab') return;
      e.stopPropagation();
      if (e.key === 'Escape') { e.preventDefault(); finish(); }
      else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(i + 1); }
    }, true);
  }
  function rectOf(nodes) {
    const rs = nodes.filter(Boolean).map(n => n.getBoundingClientRect()).filter(r => r.width && r.height);
    if (!rs.length) return null;
    const l = Math.min(...rs.map(r => r.left)), t = Math.min(...rs.map(r => r.top)), r = Math.max(...rs.map(r => r.right)), b = Math.max(...rs.map(r => r.bottom));
    return { left: l, top: t, right: r, bottom: b, width: r - l, height: b - t };
  }
  function place() {
    if (!root || root.hidden) return;
    const r = rectOf(STEPS[i].at()), vw = innerWidth, vh = innerHeight, pad = 6, gap = 12, side = 16;
    if (!r) return;
    Object.assign(ring.style, { left: r.left - pad + 'px', top: r.top - pad + 'px', width: r.width + 2 * pad + 'px', height: r.height + 2 * pad + 'px' });
    const w = Math.min(340, vw - 2 * side); card.style.width = w + 'px';
    const h = card.offsetHeight;
    let top = r.bottom + pad + gap;
    if (top + h > vh - side) top = r.top - pad - gap - h;           // no room below: above
    if (top < side) top = Math.max(side, Math.min(vh - side - h, r.top + r.height / 2 - h / 2)); // a tall target: over its middle
    const left = Math.max(side, Math.min(vw - side - w, r.left + r.width / 2 - w / 2));
    Object.assign(card.style, { left: left + 'px', top: top + 'px' });
  }
  function go(n) {
    if (n >= STEPS.length) return finish();
    i = n;
    const nodes = STEPS[i].at().filter(Boolean);
    if (nodes[0] && nodes[0].scrollIntoView) nodes[nodes.length - 1].scrollIntoView({ block: 'nearest' });
    card.querySelector('.tour-text').textContent = t(STEPS[i].text);
    card.querySelector('.tour-step').textContent = t('tour_step', { i: i + 1, n: STEPS.length });
    card.querySelector('.tour-skip').textContent = t('tour_skip');
    card.querySelector('.tour-skip').hidden = i === STEPS.length - 1;
    card.querySelector('.tour-next').textContent = t(i === STEPS.length - 1 ? 'tour_done' : 'tour_next');
    root.hidden = false; place();
    card.querySelector('.tour-next').focus({ preventScroll: true });
  }
  function finish() { if (!root) return; root.hidden = true; i = -1; store.set('spotanote-tour', '1'); }
  function start() {
    if (!root) build();
    if (typeof state !== 'undefined' && state === 'playing') return;
    go(0);
  }
  // the hint: two wrong presses in a row with names off, once ever
  function press(ok) {
    if (ok) { wrongRun = 0; return; }
    if (++wrongRun < 2 || store.get('spotanote-names-hint') === '1' || store.get('spotanote-names') === '1') return;
    store.set('spotanote-names-hint', '1');
    if (!hintEl) {
      hintEl = el('div', 'names-hint dlg', document.body); hintEl.setAttribute('role', 'status');
      hintEl.innerHTML = '<span></span><button class="px primary nh-yes"></button><button class="px quiet nh-no"></button>';
      hintEl.querySelector('.nh-yes').onclick = () => { const b = document.querySelector('#namesBtn'); if (b && b.getAttribute('aria-checked') !== 'true') b.click(); hide(); };
      hintEl.querySelector('.nh-no').onclick = hide;
      // a tap on the hint must not leave a button focused, or Space would press it instead of swinging the net
      hintEl.addEventListener('pointerup', () => setTimeout(() => document.activeElement && document.activeElement.blur && document.activeElement.blur(), 0));
    }
    hintEl.querySelector('span').textContent = t('names_hint');
    hintEl.querySelector('.nh-yes').textContent = t('names_yes');
    hintEl.querySelector('.nh-no').textContent = t('names_no');
    const p = document.querySelector('#piano'), r = p && p.getBoundingClientRect();
    hintEl.hidden = false;
    if (r) hintEl.style.bottom = Math.max(16, innerHeight - r.top + 12) + 'px';
    clearTimeout(hintTimer); hintTimer = setTimeout(hide, 9000);
  }
  function hide() { if (hintEl) hintEl.hidden = true; clearTimeout(hintTimer); }
  function auto() {
    let seen = true;
    try { seen = store.get('spotanote-tour') === '1' || localStorage.getItem('spotanote-v1') !== null; } catch { seen = true; }
    if (!seen) setTimeout(() => typeof Rewards !== 'undefined' ? Rewards.heroes(start) : start(), 500);
  }
  return { start, press, auto, reset: () => { wrongRun = 0; } };
})();
if (typeof document !== 'undefined') {
  const again = document.querySelector('#tourAgain');
  if (again) again.onclick = () => { if (typeof closeOptions === 'function') closeOptions(); setTimeout(() => typeof Rewards !== 'undefined' ? Rewards.heroes(Tour.start) : Tour.start(), 50); };
  if (document.readyState === 'complete') Tour.auto(); else window.addEventListener('load', Tour.auto);
}
