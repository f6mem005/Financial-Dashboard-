/* install.js - "put Finance Sense on your home screen". There is no service worker and no offline mode: this only lets the browser
   install the site as an app (own icon, full screen). Chrome and Edge offer a button through the beforeinstallprompt event;
   Safari on iPhone has no such event, so it gets plain steps instead. Nothing here changes any data. */
(function (root) {
  'use strict';
  var FD = (root.FD = root.FD || {});
  var U = FD.util, h = U.h, UI = FD.ui;
  var offer = null;   // the browser's install prompt, kept until it is used

  function standalone() {
    try { return !!(root.matchMedia && root.matchMedia('(display-mode: standalone)').matches) || root.navigator.standalone === true; } catch (e) { return false; }
  }
  /* onChange is called when the offer appears or goes away, so a screen that is showing the card can redraw it. */
  function init(onChange) {
    root.addEventListener('beforeinstallprompt', function (e) { e.preventDefault(); offer = e; if (onChange) onChange(); });
    root.addEventListener('appinstalled', function () { offer = null; if (onChange) onChange(); });
  }
  function card(app) {
    if (standalone()) return UI.card('Install on your phone', h('p', { class: 'q-help' }, 'You are using the installed app. Nothing else to do here.'));
    var body = h('div', { class: 'stack' },
      h('p', { class: 'q-help' }, 'Add Finance Sense to your home screen so it opens like an app, full screen and with its own icon. It is the same site: nothing comes from an app store and nothing is uploaded.'));
    if (offer) {
      body.appendChild(UI.btn('Install Finance Sense', function () {
        var e = offer; offer = null;
        try { e.prompt(); Promise.resolve(e.userChoice).then(function () { app.render(); }, function () { app.render(); }); } catch (err) { app.render(); }
      }, 'primary'));
    } else {
      body.appendChild(h('ul', { class: 'install-steps' },
        h('li', null, h('strong', null, 'iPhone or iPad (Safari): '), 'tap Share, then Add to Home Screen.'),
        h('li', null, h('strong', null, 'Android (Chrome): '), 'open the menu, then Install app or Add to home screen.'),
        h('li', null, h('strong', null, 'Computer (Chrome or Edge): '), 'click the install icon at the right end of the address bar.')));
    }
    body.appendChild(h('p', { class: 'note' }, 'On an iPhone or iPad the installed app keeps its own storage, so it can open empty. Save a backup first (see Move to another device below), then choose “Restore from a backup” inside the installed app. You will also sign in again there.'));
    body.appendChild(h('p', { class: 'hint' }, 'It still needs a connection to open. There is no offline mode.'));
    return UI.card('Install on your phone', body);
  }

  FD.install = { init: init, card: card, standalone: standalone };
  if (typeof module !== 'undefined' && module.exports) module.exports = FD;
})(typeof window !== 'undefined' ? window : globalThis);
