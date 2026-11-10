/* Browser test: demo-only mode (window.FD_DEMO_ONLY, set by the survey's demo page): sample data only, no Settings, nothing saved, and a pinned Continue bar
   that can only lead to a path on this site. Needs Playwright and the app served on 8912 (python3 -m http.server 8912):  node tests/browser/demo-only-flow.js */
'use strict';
const { chromium } = require('playwright');
const URL = process.env.BASE_URL || 'http://localhost:8912/index.html';
let failed = 0; const out = (k, v) => { if (!v) failed++; console.log((v ? 'PASS ' : 'FAIL ') + k); };
(async () => {
  const b = await chromium.launch(); const errs = [];
  async function open(cfg, extra) {
    const ctx = await b.newContext({ viewport: { width: 390, height: 800 } }); const p = await ctx.newPage();
    p.on('pageerror', (e) => errs.push('pageerror ' + e.message)); p.on('console', (m) => { if (['error', 'warning'].includes(m.type()) && !/\/auth\/session|\/next\//.test((m.location() || {}).url || '')) errs.push(m.text()); });
    p.on('dialog', (d) => d.dismiss());
    await p.addInitScript(([c, x]) => { if (c !== null) window.FD_DEMO_ONLY = c; if (x) try { localStorage.setItem('fd.v1', x); } catch (e) {} }, [cfg, extra || null]);
    await p.goto(URL); p.ctx = ctx; return p;
  }
  const ls = (p) => p.evaluate(() => { const o = {}; for (let i = 0; i < localStorage.length; i++) o[localStorage.key(i)] = localStorage.getItem(localStorage.key(i)); return o; });

  // ---- without the setting nothing changes: the normal landing page, with Settings
  let p = await open(null);
  out('without the setting the app starts on its normal first screen', (await p.locator('button:has-text("Get started")').count()) === 1 && (await p.locator('.demo-only').count()) === 0);
  await p.ctx.close();

  // ---- with the setting
  const good = { continueUrl: '/next/?demo=done', continueLabel: 'Carry on', note: 'Made-up numbers.' };
  p = await open(good); await p.waitForSelector('.tabs');
  out('it starts straight in the sample dashboard (no landing page, no setup)', (await p.locator('button:has-text("Get started")').count()) === 0 && /safe to spend/i.test(await p.innerText('#app')));
  out('the pinned bar shows the given label and note', (await p.locator('.demo-only button:has-text("Carry on")').count()) === 1 && /Made-up numbers\./.test(await p.innerText('.demo-only')));
  out('Settings and How it works are gone', (await p.locator('.tab:has-text("Settings")').count()) === 0 && (await p.locator('button:has-text("How it works")').count()) === 0);
  out('nothing is written to storage', Object.keys(await ls(p)).length === 0);
  const ev = await p.evaluate(() => { const a = FD.app; const before = a.S.mode; a.startReal(); a.wipe(); a.replaceState({ mode: 'real', onboarded: true }); a.go('settings'); return { mode: a.S.mode, tab: a.ui.tab, before }; });
  out('the app can not be switched to real data from inside the page (start, wipe, restore, Settings all refused)', ev.mode === 'demo' && ev.tab === 'home');
  out('a storage event from another tab does not replace the sample data', await p.evaluate(() => { window.dispatchEvent(new StorageEvent('storage', { key: 'fd.v1', storageArea: localStorage })); return FD.app.S.mode === 'demo'; }));
  await p.ctx.close();

  // ---- no button leads to the missing Settings tab (an old balance date is what normally brings up "Update balance")
  p = await open(good); await p.waitForSelector('.tabs');
  await p.evaluate(() => { const a = FD.app; a.S.settings.balanceChecked = FD.util.iso(new Date(a.now().getTime() - 60 * 86400000)); a._cfg = null; a.go('ideas'); });
  await p.waitForTimeout(200);
  out('the old-balance prompt is on Ideas, but with no "Update balance" button, and no "Update my balance" button either', /Update your balance/.test(await p.innerText('#app')) && (await p.locator('button:has-text("Update balance"), button:has-text("Update my balance")').count()) === 0);
  await p.ctx.close();
  { const n = await open(null); await n.evaluate(() => { const a = FD.app; a.startDemo(); a.S.settings.balanceChecked = FD.util.iso(new Date(a.now().getTime() - 60 * 86400000)); a._cfg = null; a.go('ideas'); }); await n.waitForTimeout(200);
    out('(control) the normal app, same state: the "Update balance" button is there', (await n.locator('button:has-text("Update balance")').count()) === 1); await n.ctx.close(); }

  // ---- saved real data in the same browser is not read, shown or changed
  const real = JSON.stringify({ v: 1, mode: 'real', onboarded: true, transactions: [{ id: 't1', date: '2026-01-01', type: 'expense', amount: 5, category: 'food', note: 'SECRET-REAL-ROW' }] });
  p = await open(good, real); await p.waitForSelector('.tabs'); await p.click('.tab:has-text("Activity")'); await p.waitForTimeout(200);
  out('saved data is not shown and stays exactly as it was', !/SECRET-REAL-ROW/.test(await p.innerText('#app')) && (await ls(p))['fd.v1'] === real);
  await p.ctx.close();

  // ---- Continue can only lead to a path on this site
  for (const [bad, label] of [['https://evil.example/', 'another site'], ['//evil.example/x', 'a protocol-relative address'], ['javascript:alert(1)', 'a javascript: address'], ['/\\evil.example', 'a backslash address'], ['/a b', 'a path with a space'], [5, 'a non-string'], ['/' + 'a'.repeat(200), 'a very long path']]) {
    const q = await open({ continueUrl: bad, continueLabel: 'Go' }); await q.waitForSelector('.tabs');
    await q.click('.demo-only button'); await q.waitForTimeout(400);
    const u = new globalThis.URL(q.url());
    out('Continue with ' + label + ' falls back to this site\'s home page', u.host === 'localhost:8912' && u.pathname === '/');
    await q.ctx.close();
  }
  const ok = await open(good); await ok.waitForSelector('.tabs'); await ok.click('.demo-only button'); await ok.waitForTimeout(400);
  out('a good same-site path is followed', /\/next\/\?demo=done$/.test(ok.url())); await ok.ctx.close();
  const odd = await open({ continueLabel: 'x'.repeat(100), note: 'y'.repeat(500) }); await odd.waitForSelector('.tabs');
  out('an over-long label or note is replaced by the plain defaults', (await odd.locator('.demo-only button:has-text("Continue")').count()) === 1 && /Look around, then continue/.test(await odd.innerText('.demo-only')));
  await odd.ctx.close();

  // ---- pinned on a phone
  p = await open(good); await p.waitForSelector('.tabs'); await p.click('.tab:has-text("Ideas")'); await p.evaluate(() => window.scrollTo(0, 600)); await p.waitForTimeout(100);
  out('the bar stays pinned to the top when scrolled, and nothing is wider than the screen', (await p.evaluate(() => Math.round(document.querySelector('.demo-only').getBoundingClientRect().top))) === 0 && (await p.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)));
  await p.ctx.close();
  out('no console errors', errs.length === 0); if (errs.length) console.log(errs);
  await b.close(); console.log(failed ? failed + ' FAILED' : 'ALL PASSED'); process.exit(failed ? 1 : 0);
})();
