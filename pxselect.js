'use strict';
// Pixel menus in place of the browser's drop-downs (Dafa, 11 Nov 2026: "очень важно").
// The native <select> stays in the page as the source of truth, hidden: the game still sets .value, fills options and listens to change,
// and the pixel menu mirrors it. A raised button shows the current choice; it opens a recessed list with one raised row per option.
// Keyboard: Enter, Space or the arrows open it; arrows, Home and End move; Enter or Space picks; Esc and Tab close without leaving the sheet.
(function () {
  if (typeof document === 'undefined' || !document.createElement) return;
  const proto = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value');
  let open = null, uid = 0;
  function close(focus) {
    if (!open) return; const m = open; open = null;
    m.list.hidden = true; m.btn.setAttribute('aria-expanded', 'false'); m.btn.classList.remove('open');
    if (focus) m.btn.focus();
  }
  function enhance(sel) {
    if (sel.dataset.px) return; sel.dataset.px = '1';
    const id = 'pxs' + (++uid), wrap = document.createElement('span'), btn = document.createElement('button'), list = document.createElement('ul');
    wrap.className = 'pxsel'; btn.type = 'button'; btn.className = 'px pxsel-btn'; btn.setAttribute('aria-haspopup', 'listbox'); btn.setAttribute('aria-expanded', 'false');
    btn.innerHTML = '<span class="pxsel-val"></span><span class="chev" aria-hidden="true"></span>';
    list.className = 'pxsel-list'; list.id = id; list.setAttribute('role', 'listbox'); list.hidden = true; list.tabIndex = -1; btn.setAttribute('aria-controls', id);
    sel.parentNode.insertBefore(wrap, sel); wrap.append(sel, btn); document.body.appendChild(list);
    sel.classList.add('pxsel-native'); sel.tabIndex = -1; sel.setAttribute('aria-hidden', 'true');
    const m = { sel, btn, list, active: 0 };
    // the visible name: the label's caption, or the select's own aria-label
    const cap = sel.closest('label') && sel.closest('label').querySelector('span');
    const name = () => (cap && cap.textContent.trim()) || sel.getAttribute('aria-label') || '';
    function sync() {
      const o = sel.options[sel.selectedIndex];
      btn.querySelector('.pxsel-val').textContent = o ? o.textContent : '';
      btn.setAttribute('aria-label', name() + (o ? ': ' + o.textContent : ''));
      list.setAttribute('aria-label', name());
      btn.disabled = sel.disabled;
    }
    function rows() {
      list.innerHTML = [...sel.options].map((o, i) => `<li role="option" id="${id}-${i}" data-i="${i}" aria-selected="${i === sel.selectedIndex}"${o.lang ? ` lang="${o.lang}"` : ''}>${o.textContent.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c])}</li>`).join('');
      if (sel.dir || sel.closest('[dir]')) list.dir = getComputedStyle(sel).direction;
    }
    function mark(i) {
      const n = sel.options.length; if (!n) return; m.active = Math.max(0, Math.min(n - 1, i));
      list.querySelectorAll('li').forEach((li, k) => li.classList.toggle('on', k === m.active));
      list.setAttribute('aria-activedescendant', id + '-' + m.active);
      const li = list.children[m.active]; if (li && li.scrollIntoView) li.scrollIntoView({ block: 'nearest' });
    }
    function place() {
      const r = btn.getBoundingClientRect(), vh = innerHeight, vw = innerWidth, gap = 6;
      list.style.minWidth = Math.round(r.width) + 'px'; list.style.maxHeight = '';
      const below = vh - r.bottom - gap - 8, above = r.top - gap - 8, want = Math.min(list.scrollHeight, 320);
      const up = want > below && above > below, room = Math.max(120, up ? above : below);
      list.style.maxHeight = Math.min(320, room) + 'px';
      const h = Math.min(list.scrollHeight, Math.min(320, room));
      list.style.top = Math.round(up ? r.top - gap - h : r.bottom + gap) + 'px';
      const w = list.offsetWidth, rtl = getComputedStyle(btn).direction === 'rtl';
      let x = rtl ? r.right - w : r.left; x = Math.max(8, Math.min(vw - w - 8, x)); list.style.left = Math.round(x) + 'px';
    }
    function show() {
      if (open === m) return; close(false); rows(); list.hidden = false; open = m;
      btn.setAttribute('aria-expanded', 'true'); btn.classList.add('open'); place(); mark(sel.selectedIndex); list.focus({ preventScroll: true });
    }
    function pick(i) {
      if (i !== sel.selectedIndex) { proto.set.call(sel, sel.options[i].value); sync(); sel.dispatchEvent(new Event('change', { bubbles: true })); }
      close(true);
    }
    btn.addEventListener('click', () => (open === m ? close(true) : show()));
    btn.addEventListener('keydown', e => { if (['ArrowDown', 'ArrowUp'].includes(e.key)) { e.preventDefault(); show(); } });
    list.addEventListener('click', e => { const li = e.target.closest('li'); if (li) pick(+li.dataset.i); });
    list.addEventListener('pointermove', e => { const li = e.target.closest('li'); if (li && +li.dataset.i !== m.active) mark(+li.dataset.i); });
    list.addEventListener('keydown', e => {
      const n = sel.options.length, k = e.key;
      if (k === 'ArrowDown') mark(m.active + 1); else if (k === 'ArrowUp') mark(m.active - 1);
      else if (k === 'Home') mark(0); else if (k === 'End') mark(n - 1);
      else if (k === 'PageDown') mark(m.active + 6); else if (k === 'PageUp') mark(m.active - 6);
      else if (k === 'Enter' || k === ' ') pick(m.active);
      else if (k === 'Escape') { close(true); } else if (k === 'Tab') { close(true); return; }
      else if (k.length === 1) { const s = k.toLowerCase(), opts = [...sel.options]; const j = opts.findIndex((o, i) => i > m.active && o.textContent.trim().toLowerCase().startsWith(s)); const f = j >= 0 ? j : opts.findIndex(o => o.textContent.trim().toLowerCase().startsWith(s)); if (f >= 0) mark(f); }
      else return;
      // the game listens for Esc and Space on window: a key used by the menu stops here
      e.preventDefault(); e.stopPropagation();
    });
    // .value set from code and options refilled from code both repaint the button
    Object.defineProperty(sel, 'value', { configurable: true, get() { return proto.get.call(this); }, set(v) { proto.set.call(this, v); sync(); } });
    new MutationObserver(() => { sync(); if (open === m) { rows(); mark(sel.selectedIndex); } }).observe(sel, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['disabled'] });
    if (cap) new MutationObserver(sync).observe(cap, { childList: true, characterData: true, subtree: true });
    sel.addEventListener('change', sync); sync();
  }
  document.addEventListener('pointerdown', e => { if (open && !open.list.contains(e.target) && !open.btn.contains(e.target)) close(false); }, true);
  addEventListener('resize', () => close(false));
  document.addEventListener('scroll', e => { if (open && !open.list.contains(e.target)) close(false); }, true);
  function all() { document.querySelectorAll('select').forEach(enhance); }
  window.PxSelect = { enhance, all, close: () => close(false) };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', all); else all();
})();
