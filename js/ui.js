/* ui.js — small shared UI helpers. All text goes through the safe DOM builder. */
(function (root) {
  'use strict';
  var FD = (root.FD = root.FD || {});
  var U = FD.util, h = U.h;

  function btn(text, onclick, cls, attrs) {
    var a = { type: 'button', class: 'btn ' + (cls || ''), onclick: onclick };
    if (attrs) Object.keys(attrs).forEach(function (k) { a[k] = attrs[k]; });
    return h('button', a, text);
  }
  function card(title, body, opts) {
    opts = opts || {};
    return h('section', { class: 'card ' + (opts.cls || '') },
      title || opts.action ? h('div', { class: 'card-head' }, title ? h('h2', null, title) : null, opts.action || null) : null,
      body);
  }
  function tile(label, value, cls) {
    return h('div', { class: 'tile ' + (cls || '') }, h('div', { class: 'tile-label' }, label), h('div', { class: 'tile-value' }, value));
  }
  var fieldId = 0;
  /* $-prefixed text input. onchange receives number|null (null when blank). */
  function moneyInput(value, onchange, o) {
    o = o || {};
    fieldId++;
    var id = 'f' + fieldId;
    var input = h('input', { id: id, type: 'text', inputmode: 'decimal', autocomplete: 'off', class: 'input', placeholder: o.placeholder || '0',
      value: value === null || value === undefined ? '' : String(value), 'aria-label': o.label || 'Amount', maxlength: 12 });
    input.addEventListener('input', function () {
      var raw = input.value.trim();
      var n = raw === '' ? NaN : U.num(raw, NaN, o.min === undefined ? 0 : o.min, o.max || 1e8);
      onchange(isNaN(n) ? null : n);
    });
    return h('span', { class: 'money-input' }, h('span', { class: 'prefix', 'aria-hidden': 'true' }, o.suffix ? '' : '$'), input, o.suffix ? h('span', { class: 'suffix' }, o.suffix) : null);
  }
  function field(label, control, hint) {
    return h('label', { class: 'field' }, h('span', { class: 'field-label' }, label), control, hint ? h('span', { class: 'hint' }, hint) : null);
  }
  function select(options, value, onchange, label) {
    var s = h('select', { class: 'input', 'aria-label': label || 'Choose' }, options.map(function (o) {
      var op = h('option', { value: String(o[0]) }, o[1]);
      if (String(o[0]) === String(value)) op.selected = true;
      return op;
    }));
    s.addEventListener('change', function () { onchange(s.value); });
    return s;
  }
  function chip(text, pressed, onclick) {
    return h('button', { type: 'button', class: 'chip' + (pressed ? ' on' : ''), 'aria-pressed': pressed ? 'true' : 'false', onclick: onclick }, text);
  }
  function toast(msg, ms) {
    var el = document.getElementById('toast');
    if (!el) return;
    el.textContent = msg; el.classList.add('show');
    clearTimeout(toast.t); toast.t = setTimeout(function () { el.classList.remove('show'); }, ms || 3500);
  }

  /* The Finance Sense banner shown at the top of every screen. `actions` is an optional button or two on the right. */
  function logo(size) {
    return h('svg', { viewBox: '0 0 32 32', class: 'logo', 'aria-hidden': 'true', width: size, height: size },
      h('circle', { cx: 16, cy: 16, r: 16, class: 'logo-bg' }),
      h('path', { d: 'M7 21 L13 14 L18 18 L25 9', class: 'logo-line' }),
      h('path', { d: 'M20 9 L25 9 L25 14', class: 'logo-line' }));
  }
  /* A small button in the top bar that steps Match my device -> Light -> Dark. It shows the current one. The top bar is already full on a phone (name, How it works, Sign out),
     so here it only appears from 600px up (CSS); on a phone the choice is the first card on Settings, and a button on the first screen. */
  var THEME_NAMES = { auto: 'Match my device', light: 'Light', dark: 'Dark' }, THEME_NEXT = { auto: 'light', light: 'dark', dark: 'auto' };
  var THEME_ICON = {   // sun = Light, moon = Dark, half-filled circle = Match my device
    light: [['circle', { cx: 12, cy: 12, r: 4 }], ['path', { d: 'M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4' }]],
    dark: [['path', { d: 'M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z' }]],
    auto: [['circle', { cx: 12, cy: 12, r: 9 }], ['path', { d: 'M12 3a9 9 0 0 1 0 18z', class: 'solid' }]]
  };
  function themeButton() {
    if (!FD.theme) return null;
    var btnEl = h('button', { type: 'button', class: 'theme-btn' });
    function draw() {
      var m = FD.theme.get();
      btnEl.textContent = '';
      btnEl.setAttribute('aria-label', 'Appearance: ' + THEME_NAMES[m] + '. Tap to change.');
      btnEl.appendChild(h('svg', { viewBox: '0 0 24 24', class: 'theme-ic', 'aria-hidden': 'true', fill: 'none' }, THEME_ICON[m].map(function (e) { return h(e[0], e[1]); })));
    }
    btnEl.addEventListener('click', function () { var next = THEME_NEXT[FD.theme.get()]; FD.theme.set(next); toast('Appearance: ' + THEME_NAMES[next]); });
    draw();
    FD.theme.subscribe(btnEl, draw);
    return btnEl;
  }

  function banner(actions, onHome) {   // onHome: the logo and name become a Home button (so there is always a way back, even if the tab bar is out of sight)
    var brand = h('span', { class: 'brand-row' }, logo(30), h('span', { class: 'brand' }, 'Finance Sense'));
    return h('header', { class: 'topbar site-banner' },
      onHome ? h('button', { type: 'button', class: 'brand-btn', onclick: onHome, 'aria-label': 'Finance Sense. Go to Home' }, brand) : brand,
      h('div', { class: 'banner-actions' }, actions || null, onHome && !(root.FD_DEMO_ONLY) ? themeButton() : null, FD.session ? FD.session.slot('bar') : null));   // Sign out shows here for anyone who is signed in
  }

  /* Appearance: Match my device / Light / Dark (js/theme.js applies and remembers it). The card redraws only itself, and keeps keyboard focus on the chip pressed. */
  function themeCard() {
    if (!FD.theme) return null;
    var box = h('div', { class: 'stack' });
    function draw(focusLabel) {
      var cur = FD.theme.get(), focusEl = null;
      box.textContent = '';
      box.appendChild(h('p', { class: 'q-help' }, 'Choose how Finance Sense looks. \u201cMatch my device\u201d follows your phone or computer\u2019s light or dark setting. This choice stays on this device and is separate from your numbers.'));
      box.appendChild(h('div', { class: 'seg', role: 'group', 'aria-label': 'Appearance' }, [['auto', 'Match my device'], ['light', 'Light'], ['dark', 'Dark']].map(function (m) {
        var c = chip(m[1], cur === m[0], function () { FD.theme.set(m[0]); draw(m[1]); });
        if (m[1] === focusLabel) focusEl = c;
        return c;
      })));
      if (focusEl) focusEl.focus({ preventScroll: true });
    }
    draw();
    FD.theme.subscribe(box, function () { if (!box.contains(root.document.activeElement)) draw(); });   // the top-bar button changed it: redraw, unless a chip here is being used (it redraws itself)
    return card('Appearance', box);
  }

  FD.ui = { themeCard: themeCard, themeButton: themeButton, logo: logo, banner: banner, btn: btn, card: card, tile: tile, moneyInput: moneyInput, field: field, select: select, chip: chip, toast: toast };
  if (typeof module !== 'undefined' && module.exports) module.exports = FD;
})(typeof window !== 'undefined' ? window : globalThis);
