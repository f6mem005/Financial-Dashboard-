/* theme.js - light / dark / match-my-device. Loaded in <head> so the choice is applied before anything is painted (no flash of the wrong theme).
   The choice is one word ('light' or 'dark') kept under its own key, fd.theme: it is a display preference, not your data, so it is not part of the saved
   data (fd.v1), a backup, or "Delete all my data". Anything else stored there is ignored, and a browser that will not store it still switches for this visit.
   How it is applied: the attribute data-theme="light" or "dark" on <html>; with no attribute the stylesheet follows the device (prefers-color-scheme). */
(function (root) {
  'use strict';
  var FD = (root.FD = root.FD || {});
  var KEY = 'fd.theme', MODES = ['auto', 'light', 'dark'];
  var doc = root.document, html = doc && doc.documentElement;
  // the status-bar colours of the page (the same two the <meta name="theme-color"> tags carry in index.html)
  var BAR = { light: '#1d4f9f', dark: '#0f2a55' };
  var current = 'auto';

  function read() {
    try { var v = root.localStorage.getItem(KEY); return v === 'light' || v === 'dark' ? v : 'auto'; } catch (e) { return 'auto'; }
  }
  function metas() { return doc && doc.querySelectorAll ? doc.querySelectorAll('meta[name="theme-color"]') : []; }
  function apply(mode) {
    current = MODES.indexOf(mode) >= 0 ? mode : 'auto';
    if (!html) return;
    if (current === 'auto') html.removeAttribute('data-theme'); else html.setAttribute('data-theme', current);
    // a chosen theme also sets the browser's / home-screen app's top bar colour; "match my device" puts the two media-specific tags back to normal
    Array.prototype.forEach.call(metas(), function (m) {
      if (!m.hasAttribute('data-auto-content')) m.setAttribute('data-auto-content', m.getAttribute('content') || '');
      m.setAttribute('content', current === 'auto' ? m.getAttribute('data-auto-content') : BAR[current]);
    });
  }
  function set(mode) {
    apply(mode);
    try { if (current === 'auto') root.localStorage.removeItem(KEY); else root.localStorage.setItem(KEY, current); } catch (e) { /* not saved, but it still applies to this visit */ }
    return current;
  }
  function get() { return current; }

  apply(read());
  FD.theme = { get: get, set: set, MODES: MODES.slice() };
  if (typeof module !== 'undefined' && module.exports) module.exports = FD;
})(typeof window !== 'undefined' ? window : globalThis);
