/* app.js — state, routing, boot. */
(function (root) {
  'use strict';
  var FD = (root.FD = root.FD || {});
  var U = FD.util, h = U.h, UI = FD.ui, E = FD.engine;
  var doc = root.document;

  // Clickjacking guard: a <meta> CSP can't set frame-ancestors, so refuse to render inside another page.
  try { if (root.top !== root.self) doc.documentElement.hidden = true; } catch (e) { doc.documentElement.hidden = true; }

  var TABS = [['home', 'Home', 'M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z'],
    ['forecast', 'Forecast', 'M3 17l6-6 4 4 8-8M15 7h6v6'],
    ['plan', 'Plan', 'M5 4h14v16H5zM9 9h6M9 13h6'],
    ['ideas', 'Ideas', 'M9 18h6M10 21h4M12 3a6 6 0 0 0-4 10.5c.7.7 1 1.5 1 2.5h6c0-1 .3-1.8 1-2.5A6 6 0 0 0 12 3z'],
    ['activity', 'Activity', 'M4 6h16M4 12h16M4 18h10'],
    ['settings', 'Settings', 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM3 12h3M18 12h3M12 3v3M12 18v3']];

  var app = {
    S: FD.store.load(),
    ui: { tab: 'home', how: false, started: false, step: 0, editing: null, horizon: 3, whatIf: { cut: Object.create(null), extraSavings: 0 }, debtExtra: 50, txnLimit: 50 },
    _cfg: null, _pendingBalance: undefined,
    now: function () { return U.today(); },
    cfg: function () {
      if (!app._cfg) app._cfg = FD.config.buildConfig(app.S.answers, app.S.settings, app.now());
      return app._cfg;
    },
    balance: function () { return E.currentBalance(app.S, app.now()); },
    /* returns true only if the data was really written (demo mode writes nothing and counts as fine) */
    save: function () {
      app._cfg = null;
      if (app._stale && app.S.mode === 'real') { // another tab changed the data while we were busy: never silently overwrite it
        UI.toast('Your data changed in another tab, so this tab can\u2019t save. Reload this page to continue.', 9000);
        return false;
      }
      var ok = FD.store.save(app.S);
      if (!ok) UI.toast('NOT SAVED — your browser storage is full or blocked. Export a backup from Settings.', 9000);
      return ok;
    },
    commit: function () { var ok = app.save(); app.render(); return ok; },
    setBalance: function (v, quiet) {
      // the date only anchors "bills due before this day are already in my balance"; a later correction must not erase real unpaid bills
      if (!app.S.settings.balanceSet || !app.S.settings.balanceDate) app.S.settings.balanceDate = U.iso(app.now());
      app.S.settings.openingBalance = U.round2(v - E.netToDate(app.S, app.now())); app.S.settings.balanceSet = true;
      app.S.settings.balanceChecked = U.iso(app.now());
      if (!quiet) app.commit(); else app.save();
    },
    go: function (tab) { app.ui.tab = tab; app.ui.editing = null; app.render(true); },
    goStep: function (i) {
      app.ui.step = Math.max(0, Math.min(i, FD.onboarding.total));
      if (app.S.mode === 'real' && !app.S.onboarded) { app.S.setupStep = app.ui.step; if (!app._stale) app.save(); }   // so "Continue setup" picks up here, even after the tab is closed
      app.render(true);
    },
    /* Keep what is typed so far during setup (answers are only written on Next, Back, Skip and so on). Used before the page reloads for an update. */
    flush: function () {
      try {
        if (app.S.mode !== 'real' || app.S.onboarded || app._stale) return;
        if (app._pendingBalance !== undefined && app._pendingBalance !== null) { app.setBalance(app._pendingBalance, true); app._pendingBalance = undefined; }
        app.S.setupStep = Math.min(app.ui.step, FD.onboarding.total); app.save();
      } catch (e) { /* reloading matters more than saving a half-typed answer */ }
    },
    /* Leave the questions for the landing page. Whatever is typed so far is kept; "Continue setup" picks up at the same question.
       `announce` is the Save and exit button: it only leaves once the save really worked, and says so. */
    exitSetup: function (announce) {
      clearTimeout(app._adv);
      if (app._pendingBalance !== undefined && app._pendingBalance !== null) { app.setBalance(app._pendingBalance, true); app._pendingBalance = undefined; }
      app.S.setupStep = Math.min(app.ui.step, FD.onboarding.total);
      var ok = app.save();
      if (announce && !ok) return;
      app.ui.started = false; app.render(true);
      if (announce) UI.toast('Saved. Choose \u201cContinue setup\u201d to pick up where you left off.');
    },
    editQuestion: function (i) {
      app.ui.editing = i; app.ui.returnTab = app.ui.tab; app._editBackup = JSON.parse(JSON.stringify(app.S.answers)); // Cancel restores this
      app.render(true);
    },
    finishOnboarding: function () {
      if (app._pendingBalance !== undefined && app._pendingBalance !== null) app.setBalance(app._pendingBalance, true);
      app._pendingBalance = undefined;
      app.S.onboarded = true; app.ui.tab = 'home'; app.commit();
    },
    startReal: function () {
      // never silently replace data that exists on disk (e.g. saved in another tab, or unreadable)
      if (FD.store.hasData() && !root.confirm('This browser already has saved Finance Sense data. Starting over will replace it. Continue?')) return;
      app._stale = false; // only after the confirm above: cancelling must not mark an out-of-date tab as current
      app.S = FD.store.defaultState(); app.S.mode = 'real'; app._cfg = null;
      app.ui.step = 0; app.ui.editing = null; app.ui.tab = 'home'; app.ui.how = false; app.ui.proj = null; app.ui.started = true; app.ui.whatIf = { cut: Object.create(null), extraSavings: 0 };
      app.save(); app.render(true);
    },
    startDemo: function () {
      app._stale = false;
      app.S = FD.sample.build(app.now()); app._cfg = null; app.ui.tab = 'home'; app.ui.how = false; app.ui.proj = null; app.render(true);
    },
    wipe: function () { app._stale = false; FD.store.clear(); app.S = FD.store.defaultState(); app._cfg = null; app.ui.tab = 'home'; app.ui.how = false; app.ui.proj = null; app.render(true); },
    /* a backup the person chose to restore (already validated by FD.backup): it replaces what is on this device */
    replaceState: function (state) {
      app._stale = false; app.S = state; app._cfg = null;
      app.ui.step = app.S.onboarded ? 0 : Math.min(app.S.setupStep || 0, FD.onboarding.total); app.ui.editing = null; app.ui.tab = 'home'; app.ui.how = false; app.ui.proj = null; app.ui.started = true; app.ui.whatIf = { cut: Object.create(null), extraSavings: 0 };
      var ok = app.save(); app.render(true);
      if (ok) UI.toast('Backup restored on this device.');
    },
    render: function (focusTitle) {
      var mount = doc.getElementById('app');
      var prev = doc.activeElement, key = null, occ = 0;
      function keyOf(el, i) { return el.getAttribute('aria-label') || el.textContent || (el.tagName + ':' + (el.type || '') + ':' + i); }
      if (!focusTitle && prev && /^(BUTTON|INPUT|SELECT)$/.test(prev.tagName) && mount.contains(prev)) {
        var before = mount.querySelectorAll('button,input,select');
        for (var q = 0; q < before.length; q++) {
          if (before[q] === prev) { key = keyOf(prev, q); break; }
          if (keyOf(before[q], q) === keyOf(prev, -1)) occ++;
        }
      }
      mount.textContent = '';
      var S = app.S, node;
      if (app.ui.how && S.mode !== 'fresh') node = howItWorks(true);
      else if (S.mode === 'fresh') node = howItWorks(false);
      else if (S.mode === 'real' && !S.onboarded && !app.ui.started) node = howItWorks(false, true);   // setup not finished: show the landing page first, Start leads to the questions
      else if (S.mode === 'real' && !S.onboarded) {
        node = app.ui.step >= FD.onboarding.total ? FD.onboarding.summary(app) : FD.onboarding.screen(app, app.ui.step);
      } else if (app.ui.editing !== null) {
        node = FD.onboarding.screen(app, app.ui.editing, { editing: true,
          onNext: function () { app._editBackup = null; app.ui.editing = null; app.ui.tab = app.ui.returnTab || 'settings'; app.ui.returnTab = null; app.commit(); app.render(true); },
          onCancel: function () { if (app._editBackup) { app.S.answers = app._editBackup; app._editBackup = null; app._cfg = null; } app.ui.editing = null; app.render(true); } });
      } else {
        node = shell(FD.views[app.ui.tab](app));
      }
      mount.appendChild(node);
      if (focusTitle) { var t = doc.getElementById('q-title'); if (t) { t.focus({ preventScroll: true }); root.scrollTo(0, 0); } }
      else if (key) {
        var cands = mount.querySelectorAll('button,input,select'), seen = 0;
        for (var i = 0; i < cands.length; i++) {
          if (keyOf(cands[i], i) !== key) continue;
          if (seen++ === occ) { cands[i].focus({ preventScroll: true }); break; }
        }
      }
    }
  };

  function disclaimer() {
    return h('footer', { class: 'disclaimer' }, 'Finance Sense is for education and organizing, not financial advice. It doesn’t recommend specific investments or products. Forecasts are estimates based on what you enter.');
  }

  var STEPS = [
    ['Answer a few questions', 'About 13 quick ones, around 3 minutes: what you earn, your bills, what you owe, what you want. The money questions need an answer, even if it is $0 or N/A, so nothing is guessed for you.'],
    ['See where you stand', 'Home shows how much is safe to spend until payday, which bills are coming, and where your balance is heading over the next months.'],
    ['Get ideas', 'The Ideas tab works out how much you could set aside, shows what saving or investing it could grow into, points out places to spend less, and flags charges that look doubled up.'],
    ['Keep it current', 'Log what you spend or import a CSV from your bank. When your pay, bills or plans change, we notice and offer to update, or you can change any answer in a tap.'],
    ['Take it with you', 'Everything stays in this browser. There is no account and nothing is uploaded. To use another device, save a backup file (you can lock it with a passphrase) and open it there.']
  ];

  var FEATURES = [
    ['Safe to spend', 'See what you can spend until your next payday, after your bills.', TABS[0][2]],
    ['Balance forecast', 'Watch where your balance is heading over the next months.', TABS[1][2]],
    ['Ideas that fit you', 'How much you could set aside, and what saving it could grow into.', TABS[3][2]],
    ['Spend less', 'Spot ways to cut back and charges that look doubled up.', TABS[2][2]]
  ];

  function logo() { return UI.logo(48); }

  // Three plain facts shown under the intro (text only: nothing here is a button or a card).
  var FACTS = [['About 3 min', 'to set up'], ['No account', 'or bank link'], ['On device', 'nothing uploaded']];

  /* A picture of the dashboard with example numbers. It is decoration only: hidden from screen readers, no buttons or links inside it,
     and the caption says the numbers are an example. It must never look or behave like something you can tap. */
  function phonePreview() {
    function row(name, when, amt) { return h('div', { class: 'ph-row' }, h('span', { class: 'ph-name' }, name), h('span', { class: 'ph-when' }, when), h('span', { class: 'ph-amt' }, amt)); }
    var spark = h('svg', { viewBox: '0 0 200 36', class: 'ph-spark', width: 200, height: 36 },
      h('polyline', { points: '0,26 23,24 47,27 70,20 93,22 117,14 140,17 163,9 200,6', class: 'ph-line', fill: 'none', 'stroke-width': 2.4, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }));
    var track = h('svg', { viewBox: '0 0 200 6', class: 'ph-track', width: 200, height: 6 },
      h('rect', { x: 0, y: 0, width: 200, height: 6, class: 'ph-track-bg' }), h('rect', { x: 0, y: 0, width: 124, height: 6, class: 'ph-track-fill' }));
    return h('div', { class: 'landing-phone-wrap' },
      h('div', { class: 'phone', 'aria-hidden': 'true' },
        h('div', { class: 'ph-notch' }),
        h('div', { class: 'ph-body' },
          h('span', { class: 'ph-brand' }, 'Finance Sense'),
          h('span', { class: 'ph-label' }, 'Safe to spend until payday'),
          h('span', { class: 'ph-big' }, '$412'),
          track,
          h('span', { class: 'ph-sub' }, '6 days to go. Bills already set aside.'),
          h('span', { class: 'ph-label ph-gap' }, 'Coming up'),
          row('Rent', 'Fri', '$900'), row('Phone', 'Mon', '$45'), row('Streaming', 'Wed', '$12'),
          h('span', { class: 'ph-label ph-gap' }, 'Balance forecast'),
          spark)),
      h('p', { class: 'landing-caption' }, 'A peek at your dashboard, with example numbers. Yours are built from your answers.'));
  }

  /* The landing page: a Finance Sense banner, what the app is for, what you get, how it works, and ONE Start button pinned to the
     bottom. It is the first screen for anyone who has not finished setup, and is reopened from the top bar (inApp = true). */
  function howItWorks(inApp, resuming) {
    var S = app.S;
    var blank = !inApp && resuming && !Object.keys(S.answers || {}).length && !(S.setupStep > 0);   // started, but nothing answered yet: not really "resuming"
    var primary = inApp
      ? UI.btn('Back', function () { app.ui.how = false; app.render(true); }, 'primary big')
      : blank ? UI.btn('Get started', function () { app.ui.started = true; app.ui.step = 0; app.render(true); }, 'primary big')
      : resuming
        ? UI.btn('Continue setup', function () { app.ui.started = true; app.ui.step = Math.min(S.setupStep || 0, FD.onboarding.total); app.render(true); }, 'primary big')
        : UI.btn('Get started', function () { app.startReal(); }, 'primary big');
    if (blank) resuming = false;
    function link(text, fn) { return UI.btn(text, fn, 'landing-link'); }
    var unreadable = !inApp && FD.store.loadFailed() ? h('div', { class: 'note', role: 'alert' },
        h('p', null, FD.store.backupOk()
          ? 'We couldn’t read your saved data. A raw copy was kept in this browser (keys fd.v1.bak / fd.v1.bak2), but starting over will replace what’s in fd.v1.'
          : 'We couldn’t read your saved data, and there wasn’t room to keep a copy. Starting over will replace it.'),
        UI.btn('Delete the unreadable data and any copies', function () { if (root.confirm('Delete the unreadable data and its backup copies? This can’t be undone.')) app.wipe(); }, 'small danger')) : null;
    var hero = h('header', { class: 'landing-hero' }, h('div', { class: 'landing-in' },
      h('div', { class: 'brand-row' }, logo(), h('div', { class: 'brand-text' }, h('span', { class: 'brand-name' }, 'Finance Sense'), h('span', { class: 'brand-tag' }, 'Your money, made simple'))),
      h('h1', { class: 'landing-title', tabindex: '-1', id: 'q-title' }, inApp ? 'How Finance Sense works' : 'Know where your money is going'),
      h('p', { class: 'landing-intro' }, 'Finance Sense is a simple money dashboard that makes managing your money clearer and easier. Answer a few quick questions and it shows what is safe to spend until payday, which bills are coming and where your balance is heading, then suggests how much you could set aside. No account, no bank connection, and your numbers stay on this device.'),
      !inApp ? h('p', { class: 'landing-note' }, resuming ? 'Your earlier answers are saved. You can change any of them.' : 'Takes about 3 minutes. Nothing to enter? Choose $0 or N/A.') : null,
      !inApp ? h('ul', { class: 'landing-stats' }, FACTS.map(function (f) { return h('li', null, h('strong', null, f[0]), h('span', null, f[1])); })) : null,
      h('div', { class: 'landing-links' },
        !inApp ? link('Look at a demo first', function () { app.startDemo(); }) : null,
        FD.session.slot('landing'),
        !inApp && resuming ? link('Start over with a blank setup', function () { app.startReal(); }) : null,
        inApp && S.mode === 'demo' ? link('Use my numbers', function () { app.startReal(); }) : null),
      !inApp ? phonePreview() : null));
    var main = h('main', { class: 'screen welcome', id: 'main' },
      h('h2', { class: 'section-title' }, 'What you get'),
      h('ul', { class: 'benefits' }, FEATURES.map(function (f) {
        return h('li', { class: 'benefit' }, h('span', { class: 'benefit-icon' }, icon(f[2])), h('div', null, h('strong', null, f[0]), h('p', { class: 'benefit-text' }, f[1])));
      })),
      h('h2', { class: 'section-title' }, 'How it works'),
      h('ol', { class: 'how' }, STEPS.map(function (st, i) {
        return h('li', null, h('span', { class: 'how-n', 'aria-hidden': 'true' }, String(i + 1)), h('div', null, h('strong', null, st[0]), h('p', { class: 'how-text' }, st[1])));
      })),
      h('div', { class: 'card' }, h('h2', null, 'What it isn’t'),
        h('p', { class: 'q-help' }, 'It is not financial advice. It doesn’t connect to your bank, and it doesn’t recommend specific investments or products. Forecasts and growth illustrations are estimates built from what you enter, not promises.')),
      !inApp && !resuming ? h('details', { class: 'restore' }, h('summary', null, 'Already use Finance Sense on another device? Restore from a backup'), FD.transfer.restoreCard(app)) : null,
      !inApp && resuming ? h('details', { class: 'restore' }, h('summary', null, 'Restore from a backup instead'), FD.transfer.restoreCard(app)) : null,
      disclaimer());
    return h('div', { class: 'landing' + (inApp ? '' : ' with-phone') }, unreadable ? h('div', { class: 'landing-alert' }, unreadable) : null, hero, main, h('div', { class: 'cta-bar' }, primary));
  }

  function icon(d) {
    return h('svg', { viewBox: '0 0 24 24', class: 'tab-icon', 'aria-hidden': 'true', fill: 'none', 'stroke-width': 2 }, h('path', { d: d, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }));
  }

  function shell(content) {
    var S = app.S;
    var banner = S.mode === 'demo' ? h('div', { class: 'demo-banner', role: 'status' }, h('span', null, 'Demo with sample data — changes aren’t saved'), UI.btn('Use my numbers', function () { app.startReal(); }, 'small primary')) : null;
    var nav = h('nav', { class: 'tabs', 'aria-label': 'Main' }, TABS.map(function (t) {
      return h('button', { type: 'button', class: 'tab' + (app.ui.tab === t[0] ? ' on' : ''), 'aria-current': app.ui.tab === t[0] ? 'page' : null, onclick: function () { app.go(t[0]); } }, icon(t[2]), h('span', null, t[1]));
    }));
    return h('div', { class: 'shell' }, banner, UI.banner(UI.btn('How it works', function () { app.ui.how = true; app.render(true); }, 'small ghost how-btn')), content, disclaimer(), nav);
  }

  // Another tab changed the data: reload it instead of overwriting it on our next save.
  root.addEventListener('storage', function (e) {
    if (e.storageArea !== root.localStorage || (e.key !== FD.store.KEY && e.key !== null)) return;
    if (app.S.mode === 'demo') return;
    var busy = (app.S.mode === 'real' && !app.S.onboarded) || app.ui.editing !== null ||
      (doc.activeElement && /^(INPUT|SELECT|TEXTAREA)$/.test(doc.activeElement.tagName));
    if (busy) { app._stale = true; UI.toast('Your saved data changed in another tab. Reload this page to see it \u2014 saving here is paused so nothing is overwritten.', 9000); return; } // don't wipe what you're typing
    var fresh = FD.store.load();
    app._stale = false; // we are about to be (or already are) in sync with what's on disk
    if (JSON.stringify(fresh) === JSON.stringify(app.S)) return;
    app.S = fresh; app._cfg = null;
    app.render(); UI.toast('Updated \u2014 your data changed in another tab.');
  });

  if (app.S.mode === 'real' && FD.store.wasMigrated()) FD.store.save(app.S); // keep the one-time migration from drifting day to day

  // The browser may offer to install the app at any moment; the Settings card redraws only itself (see js/install.js).
  FD.install.init();
  FD.session.load();   // who is signed in, so every screen can show Sign out

  FD.app = app;
  function boot() { app.render(); }
  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', boot); else boot();
})(typeof window !== 'undefined' ? window : globalThis);
