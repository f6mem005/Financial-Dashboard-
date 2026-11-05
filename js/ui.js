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

  FD.ui = { btn: btn, card: card, tile: tile, moneyInput: moneyInput, field: field, select: select, chip: chip, toast: toast };
  if (typeof module !== 'undefined' && module.exports) module.exports = FD;
})(typeof window !== 'undefined' ? window : globalThis);
