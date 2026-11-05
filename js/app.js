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
    ['activity', 'Activity', 'M4 6h16M4 12h16M4 18h10'],
    ['settings', 'Settings', 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM3 12h3M18 12h3M12 3v3M12 18v3']];

  var app = {
    S: FD.store.load(),
    ui: { tab: 'home', step: 0, editing: null, horizon: 3, whatIf: { cut: Object.create(null), extraSavings: 0 }, debtExtra: 50, txnLimit: 50 },
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
      if (!quiet) app.commit(); else app.save();
    },
    go: function (tab) { app.ui.tab = tab; app.ui.editing = null; app.render(true); },
    goStep: function (i) { app.ui.step = Math.max(0, Math.min(i, FD.onboarding.total)); app.render(true); },
    editQuestion: function (i) {
      app.ui.editing = i; app._editBackup = JSON.parse(JSON.stringify(app.S.answers)); // Cancel restores this
      app.render(true);
    },
    finishOnboarding: function () {
      if (app._pendingBalance !== undefined && app._pendingBalance !== null) app.setBalance(app._pendingBalance, true);
      app._pendingBalance = undefined;
      app.S.onboarded = true; app.ui.tab = 'home'; app.commit();
    },
    startReal: function () {
      app._stale = false;
      // never silently replace data that exists on disk (e.g. saved in another tab, or unreadable)
      if (FD.store.hasData() && !root.confirm('This browser already has saved Money Map data. Starting over will replace it. Continue?')) return;
      app.S = FD.store.defaultState(); app.S.mode = 'real'; app._cfg = null;
      app.ui.step = 0; app.ui.editing = null; app.ui.tab = 'home'; app.ui.whatIf = { cut: Object.create(null), extraSavings: 0 };
      app.save(); app.render(true);
    },
    startDemo: function () {
      app._stale = false;
      app.S = FD.sample.build(app.now()); app._cfg = null; app.ui.tab = 'home'; app.render(true);
    },
    wipe: function () { app._stale = false; FD.store.clear(); app.S = FD.store.defaultState(); app._cfg = null; app.ui.tab = 'home'; app.render(true); },
    exportData: function () {
      var blob = new Blob([JSON.stringify(app.S, null, 2)], { type: 'application/json' });
      var url = root.URL.createObjectURL(blob);
      var a = doc.createElement('a'); a.href = url; a.download = 'money-map-backup-' + U.iso(app.now()) + '.json';
      doc.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { root.URL.revokeObjectURL(url); }, 1000);
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
      if (S.mode === 'fresh') node = welcome();
      else if (S.mode === 'real' && !S.onboarded) {
        node = app.ui.step >= FD.onboarding.total ? FD.onboarding.summary(app) : FD.onboarding.screen(app, app.ui.step);
      } else if (app.ui.editing !== null) {
        node = FD.onboarding.screen(app, app.ui.editing, { editing: true,
          onNext: function () { app._editBackup = null; app.ui.editing = null; app.ui.tab = 'settings'; app.commit(); app.render(true); },
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
    return h('footer', { class: 'disclaimer' }, 'Money Map is for education and organizing, not financial advice. It doesn’t recommend specific investments or products. Forecasts are estimates based on what you enter.');
  }

  function welcome() {
    return h('main', { class: 'screen welcome', id: 'main' },
      FD.store.loadFailed() ? h('div', { class: 'note', role: 'alert' },
        h('p', null, FD.store.backupOk()
          ? 'We couldn\u2019t read your saved data. A raw copy was kept in this browser (keys fd.v1.bak / fd.v1.bak2), but starting over will replace what\u2019s in fd.v1.'
          : 'We couldn\u2019t read your saved data, and there wasn\u2019t room to keep a copy. Starting over will replace it.'),
        UI.btn('Delete the unreadable data and any copies', function () { if (root.confirm('Delete the unreadable data and its backup copies? This can\u2019t be undone.')) app.wipe(); }, 'small danger')) : null,
      h('h1', { class: 'q-title', tabindex: '-1', id: 'q-title' }, 'Know where your money is going'),
      h('p', { class: 'q-help' }, 'Answer a few quick questions and get a simple picture of your month and where your balance is heading. No account. Your numbers stay on this device.'),
      h('div', { class: 'stack' },
        UI.btn('Set up with my numbers', function () { app.startReal(); }, 'primary big'),
        UI.btn('Look at a demo first', function () { app.startDemo(); }, 'ghost big')),
      h('p', { class: 'hint' }, 'Takes about 3 minutes. You can skip any question.'),
      disclaimer());
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
    return h('div', { class: 'shell' }, banner, h('header', { class: 'topbar' }, h('span', { class: 'brand' }, 'Money Map')), content, disclaimer(), nav);
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

  FD.app = app;
  function boot() { app.render(); }
  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', boot); else boot();
})(typeof window !== 'undefined' ? window : globalThis);
