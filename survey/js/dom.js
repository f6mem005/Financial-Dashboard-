/* dom.js - safe DOM builder. Strings only ever become text nodes; only listed tags and attributes are allowed. */
(function (root) {
  'use strict';
  var SV = (root.SV = root.SV || {});
  var SVG_NS = 'http://www.w3.org/2000/svg';
  var SVG_TAGS = /^(svg|path|circle|line|rect)$/;
  var HTML_TAGS = /^(div|span|p|h1|h2|h3|ul|ol|li|main|section|header|footer|nav|button|input|textarea|label|strong|em|output|table|thead|tbody|tr|th|td|select|option)$/;
  var ATTR_OK = /^(class|id|type|role|tabindex|placeholder|maxlength|rows|name|for|inputmode|autocomplete|disabled|min|max|scope|accept|aria-[a-z]+|viewBox|d|cx|cy|r|x1|x2|y1|y2|width|height|fill|stroke|stroke-width)$/;

  function h(tag, attrs) {
    var svg = SVG_TAGS.test(tag);
    if (!svg && !HTML_TAGS.test(tag)) throw new Error('h(): tag not allowed: ' + tag);
    var el = svg ? document.createElementNS(SVG_NS, tag) : document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        var v = attrs[k];
        if (v === null || v === undefined || v === false) return;
        if (k.slice(0, 2) === 'on') { if (typeof v === 'function') el.addEventListener(k.slice(2), v); return; }
        if (k === 'value' && !svg) { el.value = v; return; }
        if (k === 'checked' && !svg) { el.checked = !!v; return; }
        if (!ATTR_OK.test(k)) { if (root.console) root.console.warn('h(): attribute not allowed: ' + k); return; }
        el.setAttribute(k, v === true ? '' : String(v));
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
  SV.h = h;
})(typeof window !== 'undefined' ? window : globalThis);
