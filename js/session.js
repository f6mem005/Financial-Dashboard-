/* session.js - "who is signed in, and a Sign out button for everyone". The site sits behind a sign-in (see netlify/edge-functions/gate.ts), so
   this asks /auth/session once: if it says someone is signed in, a Sign out button appears in the top bar, on the first screen and in Settings.
   Where there is no sign-in (running locally, the demo on a plain server) the question fails and nothing is shown.
   Buttons live in small slots that are redrawn on their own when the answer arrives, so nothing else on the screen is rebuilt or disturbed. */
(function (root) {
  'use strict';
  var FD = (root.FD = root.FD || {});
  var U = FD.util, h = U.h, UI = FD.ui;
  var info = null;   // { role: 'admin' } or { role: 'person', name }
  var slots = [];    // { el, kind, epoch } for every slot currently on the page
  var epoch = 0, ticking = false;   // a screen is built in one go, so slots made in the same go are "new" and are not forgotten just because they are not on the page yet
  function tick() { if (!ticking) { ticking = true; Promise.resolve().then(function () { epoch++; ticking = false; }); } }
  function alive(s) { return s.epoch === epoch || (root.document && root.document.contains(s.el)); }

  function signOut() {
    function done() { root.location.assign('/'); }   // the gate answers with the sign-in page
    try { root.fetch('/auth/logout', { method: 'POST', credentials: 'same-origin' }).then(done, done); } catch (e) { done(); }
  }
  function label() { return info && info.role === 'admin' ? 'the admin' : (info && info.name) || 'you'; }
  function button(kind) {
    var text = 'Sign out', aria = 'Sign out. You are signed in as ' + label();
    if (kind === 'landing') return UI.btn(text, signOut, 'landing-link', { 'aria-label': aria });
    return UI.btn(text, signOut, 'small ghost signout-btn', { 'aria-label': aria });
  }
  function fill(slot) {
    slot.el.textContent = '';
    if (!info) return;
    if (slot.kind === 'card') {
      var admin = info.role === 'admin';
      slot.el.appendChild(UI.card('Signed in', h('div', { class: 'stack' },
        h('p', { class: 'q-help' }, 'You are signed in as ' + (admin ? 'the admin' : info.name) + '. Sign out to sign in as someone else' + (admin ? '' : ', or as the admin (leave the name blank and use the admin passcode)') + '.'),
        h('div', { class: 'inline' }, UI.btn('Sign out', signOut, 'primary', { 'aria-label': 'Sign out. You are signed in as ' + label() }),
          admin ? UI.btn('Admin tools', function () { root.location.assign('/admin/'); }, 'ghost') : null),
        h('p', { class: 'hint' }, 'Signing out does not remove your numbers from this browser. If other people use this browser, delete your data first (see Your data below).'))));
    } else slot.el.appendChild(button(slot.kind));
  }
  function refresh() {
    slots = slots.filter(alive);
    slots.forEach(fill);
  }
  /* kind: 'bar' (default, the top bar), 'landing' (a link in the first screen) or 'card' (the Settings card). */
  function slot(kind) {
    tick();
    var s = { el: h('span', { class: 'session-slot session-' + (kind || 'bar') }), kind: kind || 'bar', epoch: epoch };
    fill(s);
    slots = slots.filter(alive);   // forget slots from earlier screens
    slots.push(s); return s.el;
  }
  function load() {
    if (!root.fetch) return;
    try {
      root.fetch('/auth/session', { credentials: 'same-origin', cache: 'no-store' }).then(function (r) { return r.ok ? r.json() : null; }, function () { return null; })
        .then(function (j) {
          info = j && (j.role === 'admin' || (j.role === 'person' && typeof j.name === 'string')) ? { role: j.role, name: j.role === 'person' ? U.cleanStr(j.name, 40) : '' } : null;
          refresh();
        }, function () { /* no answer: no button */ });
    } catch (e) { /* ignore */ }
  }

  FD.session = { load: load, slot: slot, refresh: refresh, signOut: signOut, who: function () { return info; } };
  if (typeof module !== 'undefined' && module.exports) module.exports = FD;
})(typeof window !== 'undefined' ? window : globalThis);
