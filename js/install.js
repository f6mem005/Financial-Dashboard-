/* install.js - "put Finance Sense on your home screen". There is no service worker and no offline mode: this only lets the browser
   install the site as an app (own icon, full screen). Chrome and Edge offer a button through the beforeinstallprompt event;
   Safari on iPhone has no such event, so it gets plain steps instead. Nothing here changes any data.
   The card is a self-contained slot: when the browser's offer arrives or goes away, only that slot is redrawn, never the whole
   screen, so a backup being restored or a number being typed elsewhere on Settings is never disturbed. */
(function (root) {
  'use strict';
  var FD = (root.FD = root.FD || {});
  var U = FD.util, h = U.h, UI = FD.ui;
  var offer = null;        // the browser's install prompt, kept until it is used
  var installed = false;   // true once the person accepted, or the browser says it was installed
  var slots = [];          // card containers currently on screen

  function standalone() {
    try {
      var mm = root.matchMedia;
      return !!(mm && ['standalone', 'minimal-ui', 'fullscreen'].some(function (m) { return mm.call(root, '(display-mode: ' + m + ')').matches; })) || root.navigator.standalone === true;
    } catch (e) { return false; }
  }
  function body() {
    if (standalone()) return h('p', { class: 'q-help' }, 'You are using the installed app. Nothing else to do here.');
    if (installed) return h('p', { class: 'q-help' }, 'Installed. Open Finance Sense from your home screen or app list. This tab can be closed.');
    var box = h('div', { class: 'stack' },
      h('p', { class: 'q-help' }, 'Add Finance Sense to your home screen so it opens like an app, full screen and with its own icon. It is the same site: nothing comes from an app store and nothing is uploaded.'));
    if (offer) {
      box.appendChild(UI.btn('Install Finance Sense', function (ev) {
        var e = offer, mine = ev && ev.target && ev.target.closest ? ev.target.closest('.install-slot') : null;
        offer = null; refresh();
        if (mine && mine.focus) mine.focus({ preventScroll: true });   // the button is gone after the redraw: keep keyboard focus on the card
        try {
          Promise.resolve(e.prompt()).catch(function () { /* the browser declined to show it */ });
          Promise.resolve(e.userChoice).then(function (c) { if (c && c.outcome === 'accepted') installed = true; refresh(); }, refresh);
        } catch (err) { refresh(); }
      }, 'primary'));
    } else {
      box.appendChild(h('ul', { class: 'install-steps' },
        h('li', null, h('strong', null, 'iPhone or iPad (Safari): '), 'tap Share, then Add to Home Screen.'),
        h('li', null, h('strong', null, 'Android (Chrome): '), 'open the menu, then Install app or Add to home screen.'),
        h('li', null, h('strong', null, 'Computer (Chrome or Edge): '), 'click the install icon at the right end of the address bar.')));
    }
    box.appendChild(h('p', { class: 'note' }, 'On an iPhone or iPad the installed app keeps its own storage, so it can open empty. Save a backup first (see Move to another device below), then choose “Restore from a backup” inside the installed app. You will also sign in again there.'));
    box.appendChild(h('p', { class: 'hint' }, 'It still needs a connection to open. There is no offline mode.'));
    return box;
  }
  function fill(slot) { slot.textContent = ''; slot.appendChild(UI.card('Install on your phone', body())); }

  /* Redraw only the install card(s) that are still on the page. */
  function refresh() {
    slots = slots.filter(function (s) { return root.document && root.document.contains(s); });
    slots.forEach(fill);
  }
  function init() {
    root.addEventListener('beforeinstallprompt', function (e) { e.preventDefault(); offer = e; installed = false; refresh(); });   // a fresh offer means it is not installed (any more)
    root.addEventListener('appinstalled', function () { offer = null; installed = true; refresh(); });
  }
  function card() {
    var slot = h('div', { class: 'install-slot', tabindex: '-1' }); fill(slot);
    slots = slots.filter(function (s) { return root.document && root.document.contains(s); });   // forget cards from earlier Settings screens
    slots.push(slot); return slot;
  }

  FD.install = { init: init, card: card, refresh: refresh, standalone: standalone, slotCount: function () { return slots.length; } };
  if (typeof module !== 'undefined' && module.exports) module.exports = FD;
})(typeof window !== 'undefined' ? window : globalThis);
