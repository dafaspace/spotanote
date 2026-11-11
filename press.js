'use strict';
// Pressed state on every tap, taken whole from Cinemail (app/index.html, initPressFeedback; root CLAUDE.md, "Taps").
// The tap highlight is off on html, so this is the only thing that answers a touch. Delegated, because iOS WKWebView fires :active unreliably
// on anything but buttons. Purely visual; never blocks the click.
(function initPressFeedback(){
  if (typeof document === 'undefined' || !document.addEventListener) return;
  const SEL = 'button, a.px, .pxsel-list li';
  const clear = () => document.querySelectorAll('.is-pressed').forEach(el => el.classList.remove('is-pressed'));
  document.addEventListener('pointerdown', (e) => {
    if (e.target.closest && e.target.closest('input, textarea, select, [contenteditable]')) return;
    const el = e.target.closest && e.target.closest(SEL);
    if (el && !el.disabled) el.classList.add('is-pressed');
  }, true);
  ['pointerup','pointercancel','pointerleave','dragstart','scroll'].forEach(ev =>
    document.addEventListener(ev, clear, true));
})();
