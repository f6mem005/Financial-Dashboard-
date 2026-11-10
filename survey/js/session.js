/* session.js - "who is signed in, and a Sign out button for everyone". The survey sits behind a sign-in (see netlify/edge-functions/gate.ts), so this
   asks /auth/session once: if it says someone is signed in, a Sign out button appears in the banner above every screen. Where there is no sign-in
   (running locally) the question fails and nothing is shown. The button lives in a small slot that is redrawn on its own when the answer arrives,
   so the screen is never rebuilt. Signing out does not delete the answers saved in this browser (they are kept so the survey can be resumed). */
(function (root) {
  'use strict';
  var SV = (root.SV = root.SV || {});
  var h = SV.h;
  var info = null;                       // { role: 'admin' } or { role: 'person', name }
  var slots = [], epoch = 0, ticking = false;   // a screen is built in one go: slots made in the same go are "new" and are not forgotten before they are attached
  var busy = false, signedOut = false, failed = false, retry = false, wired = false;
  function tick() { if (!ticking) { ticking = true; Promise.resolve().then(function () { epoch++; ticking = false; }); } }
  function alive(s) { return s.epoch === epoch || (root.document && root.document.contains(s.el)); }
  function clean(v) {   // text only: no control or invisible characters, at most 40 long
    var s = String(v == null ? '' : v), out = '', i, c;
    for (i = 0; i < s.length; i++) { c = s.charCodeAt(i); if (c < 32 || (c >= 127 && c <= 159) || (c >= 0x200b && c <= 0x200f) || (c >= 0x2028 && c <= 0x202e) || (c >= 0x2060 && c <= 0x206f) || c === 0xfeff) continue; out += s.charAt(i); }
    return out.trim().slice(0, 40);
  }
  function label() { return info && info.role === 'admin' ? 'the admin' : (info && info.name) || 'you'; }

  function signOut() {
    if (busy) return; busy = true; failed = false; refresh();
    try { if (SV.flush) SV.flush(); } catch (e) { /* keep going */ }   // whatever is typed is kept, as when you leave the survey any other way
    function fail() { busy = false; failed = true; refresh(); }          // never pretend it worked
    try { root.fetch('/auth/logout', { method: 'POST', credentials: 'same-origin' }).then(function (r) { if (r.ok) { signedOut = true; root.location.assign('/'); } else fail(); }, fail); } catch (e) { fail(); }
  }
  function fill(slot) {
    slot.el.textContent = '';
    if (!info) return;
    slot.el.appendChild(h('button', { type: 'button', class: 'signout-btn', onclick: signOut, 'aria-label': 'Sign out. You are signed in as ' + label() }, 'Sign out'));
    if (failed) slot.el.appendChild(h('span', { class: 'so-fail', role: 'alert' }, 'Could not sign out. Check your connection and try again.'));
  }
  function refresh() { slots = slots.filter(alive); slots.forEach(fill); }
  function slot() {
    tick();
    var s = { el: h('span', { class: 'session-slot' }), epoch: epoch };
    fill(s); slots = slots.filter(alive); slots.push(s); return s.el;
  }
  function load() {
    if (!root.fetch) return;
    try {
      root.fetch('/auth/session', { credentials: 'same-origin', cache: 'no-store' }).then(function (r) { if (r.ok) return r.json(); retry = r.status >= 500; return null; }, function () { retry = true; return null; })
        .then(function (j) {
          info = j && (j.role === 'admin' || (j.role === 'person' && typeof j.name === 'string')) ? { role: j.role, name: j.role === 'person' ? clean(j.name) : '' } : null;
          if (info) retry = false;
          refresh();
        }, function () { retry = true; });
      if (!wired && root.document) {   // after a network or server error, try again when the tab comes back (a plain "not signed in" is not retried)
        wired = true;
        var again = function () { if (retry && !info && root.document.visibilityState !== 'hidden') load(); };
        root.document.addEventListener('visibilitychange', again); root.addEventListener('focus', again);
      }
    } catch (e) { /* ignore */ }
  }
  // Back after signing out can bring this page back from the browser's page cache, still showing the survey: clear the stuck state, and if the sign-out had worked, reload so the gate shows the sign-in page.
  if (root.addEventListener) root.addEventListener('pageshow', function (e) { if (e && e.persisted) { busy = false; if (signedOut) root.location.reload(); } });

  SV.session = { load: load, slot: slot, refresh: refresh, signOut: signOut, who: function () { return info; } };
  if (typeof module !== 'undefined' && module.exports) module.exports = SV;
})(typeof window !== 'undefined' ? window : globalThis);
