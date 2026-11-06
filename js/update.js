/* update.js - tells people when a newer version of the site is live, so they can refresh.
   While a page is open it asks /version.json which build is current (when the tab comes back into view, when the window is
   focused, and every 5 minutes). If that differs from the build this page loaded (FD.build), a bar appears with a Refresh button.
   It never reloads by itself, so nothing anyone is typing is lost. If the sign-in has ended it says so instead.
   Before the first deploy, or when run locally, there is no version file and nothing is shown. */
(function (root) {
  'use strict';
  var FD = (root.FD = root.FD || {});
  var INTERVAL_MS = 5 * 60 * 1000, shown = null, bar = null, timer = null;
  var MESSAGES = {
    'new': 'A new version of Finance Sense is available. Refresh to get it. Your numbers stay on this device.',
    signin: 'You have been signed out. Refresh to sign in again. Your numbers stay on this device.'
  };

  /* Resolves to 'same' | 'new' | 'signin' | 'unknown'. Never rejects. */
  function check(fetchFn, build) {
    if (!build || build === 'dev') return Promise.resolve('unknown');
    var asked;
    try { asked = fetchFn('/version.json', { cache: 'no-store', credentials: 'same-origin' }); } catch (e) { return Promise.resolve('unknown'); }
    return Promise.resolve(asked).then(function (r) {
      if (r.status === 401) return confirmSignedOut(fetchFn);   // the gate also says 401 when storage hiccups: ask the session check before claiming "signed out"
      if (!r.ok) return 'unknown';
      return r.json().then(function (j) {
        return j && typeof j.build === 'string' && /^[A-Za-z0-9._-]{1,64}$/.test(j.build) ? (j.build === build ? 'same' : 'new') : 'unknown';
      }, function () { return 'unknown'; });
    }, function () { return 'unknown'; });
  }

  // /auth/session answers 401 only for a real sign-out (503 when storage is down, 200 when all is well)
  function confirmSignedOut(fetchFn) {
    try { return Promise.resolve(fetchFn('/auth/session', { cache: 'no-store', credentials: 'same-origin' })).then(function (r) { return r.status === 401 ? 'signin' : 'unknown'; }, function () { return 'unknown'; }); }
    catch (e) { return Promise.resolve('unknown'); }
  }

  function show(kind) {
    if (shown === kind || !root.document || !FD.util) return;
    hide();
    var h = FD.util.h;
    bar = h('div', { class: 'update-bar', role: 'alert', id: 'update-bar' },
      h('span', { class: 'update-text' }, MESSAGES[kind]),
      h('button', { type: 'button', class: 'update-btn', onclick: function () { try { if (FD.app && FD.app.flush) FD.app.flush(); } catch (e) { /* reload anyway */ } root.location.reload(); } }, 'Refresh'));
    var skip = root.document.querySelector('.skip');   // after the skip link, so that stays first in the tab order
    if (skip && skip.parentNode === root.document.body) root.document.body.insertBefore(bar, skip.nextSibling); else root.document.body.insertBefore(bar, root.document.body.firstChild);   // in the page flow, at the top, so it pushes content down instead of covering it
    shown = kind;
  }
  function hide() { if (bar && bar.parentNode) bar.parentNode.removeChild(bar); bar = null; shown = null; }

  function run() { return check(root.fetch.bind(root), FD.build).then(function (kind) { if (kind === 'new' || kind === 'signin') show(kind); else if (kind === 'same' && shown === 'signin') hide(); return kind; }); }
  function start() {
    if (timer || !root.document) return;
    // old HTML with a newer script (or the reverse) because a deploy landed mid-load: say so at once
    var meta = root.document.querySelector('meta[name="build"]');
    if (meta && FD.build && FD.build !== 'dev' && meta.getAttribute('content') && meta.getAttribute('content') !== 'dev' && meta.getAttribute('content') !== FD.build) show('new');
    root.document.addEventListener('visibilitychange', function () { if (root.document.visibilityState === 'visible') run(); });
    root.addEventListener('focus', run);
    timer = root.setInterval(function () { if (root.document.visibilityState !== 'hidden') run(); }, INTERVAL_MS);
  }

  FD.update = { check: check, run: run, start: start, show: show, hide: hide, INTERVAL_MS: INTERVAL_MS };
  if (typeof module !== 'undefined' && module.exports) module.exports = FD;
  else if (root.document) start();
})(typeof window !== 'undefined' ? window : globalThis);
