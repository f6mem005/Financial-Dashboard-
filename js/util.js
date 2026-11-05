/* util.js — dates, money, safe DOM building. No dependencies. */
(function (root) {
  'use strict';
  var FD = (root.FD = root.FD || {});

  /* ---------- numbers & money ---------- */
  function num(v, fallback, min, max) {
    var n = typeof v === 'number' ? v : parseFloat(String(v == null ? '' : v).replace(/[$,\s]/g, ''));
    if (!isFinite(n)) return fallback === undefined ? 0 : fallback;
    if (min !== undefined && n < min) n = min;
    if (max !== undefined && n > max) n = max;
    return n;
  }
  function round2(n) { return Math.round(n * 100) / 100; }
  function money(n, opts) {
    n = isFinite(n) ? n : 0;
    var abs = Math.abs(n);
    var frac = opts && opts.cents ? 2 : 0;
    var s = '$' + abs.toLocaleString('en-US', { minimumFractionDigits: frac, maximumFractionDigits: frac });
    return n < 0 && Math.round(abs * Math.pow(10, frac)) > 0 ? '-' + s : s;
  }

  /* ---------- dates (all local, 'YYYY-MM-DD' strings) ---------- */
  var ISO_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function iso(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function parseISO(s) {
    if (typeof s !== 'string') return null;
    var m = ISO_RE.exec(s);
    if (!m) return null;
    var y = +m[1], mo = +m[2], d = +m[3];
    var dt = new Date(y, mo - 1, d);
    if (dt.getFullYear() !== y || dt.getMonth() !== mo - 1 || dt.getDate() !== d) return null;
    return dt;
  }
  function today() { var d = new Date(); return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }
  function addDays(d, n) { return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n); }
  function daysInMonth(y, m0) { return new Date(y, m0 + 1, 0).getDate(); }
  function clampDay(y, m0, day) { return Math.min(Math.max(1, day), daysInMonth(y, m0)); }
  function monthKey(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1); }
  function diffDays(a, b) { return Math.round((b - a) / 86400000); }
  function addMonths(d, n) {
    var t = new Date(d.getFullYear(), d.getMonth() + n, 1);
    return new Date(t.getFullYear(), t.getMonth(), clampDay(t.getFullYear(), t.getMonth(), d.getDate()));
  }
  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  function fmtDate(d) { return MONTHS[d.getMonth()] + ' ' + d.getDate(); }
  function fmtMonth(d) { return MONTHS[d.getMonth()] + ' ' + d.getFullYear(); }
  function ordinal(n) {
    var s = ['th', 'st', 'nd', 'rd'], v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
  }

  /* ---------- strings ---------- */
  function cleanStr(v, max) {
    // Strip control chars; cap length. Output is only ever rendered via textContent.
    return String(v == null ? '' : v).replace(/[\u0000-\u001f\u007f-\u009f\u00ad\u061c\u115f\u1160\u180e\u200b-\u200f\u2028-\u202e\u2060-\u206f\u3164\ufe00-\ufe0f\ufeff\uffa0\u{E0000}-\u{E007F}]/gu, ' ').trim().slice(0, max || 80);
  }
  var idCounter = 0;
  function uid(prefix) {
    idCounter += 1;
    return (prefix || 'id') + Date.now().toString(36) + idCounter.toString(36) + Math.floor(Math.random() * 1296).toString(36);
  }

  /* ---------- safe DOM builder ----------
     h('div', {class:'x', onclick:fn, 'aria-label':'..'}, child, 'text', [more])
     Strings always become text nodes (never HTML). Only on* function handlers and
     the ATTR_OK allow-list are applied, and only allow-listed tags can be created. */
  var SVG_NS = 'http://www.w3.org/2000/svg';
  var SVG_TAGS = /^(svg|g|path|circle|line|rect|text|polyline|polygon|title|desc)$/;
  var HTML_TAGS = /^(div|span|p|h1|h2|h3|ul|ol|li|main|section|header|footer|nav|button|input|select|option|label|table|thead|tbody|tr|th|td|details|summary|strong|output)$/;
  // Real allow-list: anything else is dropped (and warned about), so data can never reach href/src/style/etc.
  var ATTR_OK = /^(class|id|type|role|tabindex|placeholder|maxlength|min|max|step|name|for|inputmode|autocomplete|accept|disabled|aria-[a-z]+|viewBox|d|cx|cy|r|x|y|x1|x2|y1|y2|width|height|points|fill|stroke-width|stroke-linecap|stroke-linejoin|text-anchor)$/;
  function h(tag, attrs) {
    var svg = SVG_TAGS.test(tag);
    if (!svg && !HTML_TAGS.test(tag)) throw new Error('h(): tag not allowed: ' + tag);
    var el = svg ? document.createElementNS(SVG_NS, tag) : document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        var v = attrs[k];
        if (v === null || v === undefined || v === false) return;
        if (k.slice(0, 2) === 'on') {
          if (typeof v === 'function') el.addEventListener(k.slice(2), v);
        } else if (k === 'class') {
          el.setAttribute('class', v);
        } else if (k === 'value' && !svg) {
          el.value = v;
        } else if (k === 'checked' && !svg) {
          el.checked = !!v;
        } else if (k === 'text') {
          el.textContent = String(v);
        } else {
          if (!ATTR_OK.test(k)) { if (root.console) root.console.warn('h(): attribute not allowed: ' + k); return; }
          el.setAttribute(k, v === true ? '' : String(v));
        }
      });
    }
    for (var i = 2; i < arguments.length; i++) append(el, arguments[i]);
    return el;
  }
  function append(el, c) {
    if (c === null || c === undefined || c === false) return;
    if (Array.isArray(c)) { c.forEach(function (x) { append(el, x); }); return; }
    el.appendChild(typeof c === 'object' && c.nodeType ? c : document.createTextNode(String(c)));
  }

  FD.util = {
    num: num, round2: round2, money: money, iso: iso, parseISO: parseISO, today: today, addDays: addDays,
    daysInMonth: daysInMonth, clampDay: clampDay, monthKey: monthKey, diffDays: diffDays, addMonths: addMonths,
    fmtDate: fmtDate, fmtMonth: fmtMonth, ordinal: ordinal, cleanStr: cleanStr, uid: uid, h: h, MONTHS: MONTHS
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = FD;
})(typeof window !== 'undefined' ? window : globalThis);
