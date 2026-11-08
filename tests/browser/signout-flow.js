/* Browser test: everyone who is signed in sees a Sign out button, it signs them out, and nothing shows where there is no sign-in.
   The sign-in service is mocked (this test serves plain files). Needs Playwright and the app served on 8912:  node tests/browser/signout-flow.js */
'use strict';
const { chromium } = require('playwright');
const URL = process.env.BASE_URL || 'http://localhost:8912/index.html';
let failed = 0; const out = (k, v) => { if (!v) failed++; console.log((v ? 'PASS ' : 'FAIL ') + k); };
const done = { v: 1, mode: 'real', onboarded: true, answers: { payFreq: 'biweekly', pay: { amount: 1500, none: false, nextPayday: null }, otherIncome: [], bills: [], variable: [], annual: [], debts: [] },
  settings: { balanceSet: true, openingBalance: 100 }, transactions: [], billsPaid: {}, subs: [] };
const SEED = `if (!sessionStorage.getItem('s')) { localStorage.setItem('fd.v1', ${JSON.stringify(JSON.stringify(done))}); sessionStorage.setItem('s', '1'); }`;
(async () => {
  const b = await chromium.launch();
  async function open(o, session, seed, delay) {
    const ctx = await b.newContext(Object.assign({ viewport: { width: 390, height: 800 } }, o || {})); const p = await ctx.newPage(); const errs = [], posts = [];
    p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => { if (['error', 'warning'].includes(m.type()) && !/404|401|Failed to load resource/.test(m.text())) errs.push(m.text()); });
    if (seed) await p.addInitScript(SEED);
    await p.route('**/auth/session', async (r) => { if (delay) await new Promise((x) => setTimeout(x, delay)); if (session === 'fail') return r.abort(); if (!session) return r.fulfill({ status: 401, contentType: 'application/json', body: '{"error":"Sign in"}' }); r.fulfill({ contentType: 'application/json', body: JSON.stringify(session) }); });
    await p.route('**/auth/logout', (r) => { posts.push(r.request().method()); r.fulfill({ contentType: 'application/json', body: '{"ok":true}' }); });
    await p.goto(URL); p.errs = errs; p.posts = posts; p.ctx = ctx; return p;
  }
  const signouts = (p) => p.locator('button:has-text("Sign out")').count();

  // ---- nobody signed in (or no sign-in service at all): no button
  let p = await open({}, null); await p.waitForTimeout(400);
  out('not signed in (401): no Sign out button anywhere on the first screen', (await signouts(p)) === 0); await p.ctx.close();
  p = await open({}, 'fail'); await p.waitForTimeout(400); out('no answer from the sign-in service: no button, and no errors', (await signouts(p)) === 0 && p.errs.length === 0); await p.ctx.close();

  // ---- a person: the first screen, a question screen, Home, Settings
  p = await open({}, { role: 'person', name: 'Ana Lopez' }); await p.waitForSelector('button:has-text("Sign out")');
  out('a signed-in person sees Sign out on the first screen (one button)', (await signouts(p)) === 1 && /Sign out\. You are signed in as Ana Lopez/.test(await p.getAttribute('button:has-text("Sign out")', 'aria-label')));
  await p.click('button:has-text("Get started")'); await p.waitForTimeout(250);
  out('...and in the top bar of the questions, next to Home', (await signouts(p)) === 1 && (await p.locator('header.site-banner button:has-text("Home")').count()) === 1 && (await p.locator('header.site-banner button:has-text("Sign out")').count()) === 1);
  await Promise.all([p.waitForNavigation(), p.click('header.site-banner button:has-text("Sign out")')]);
  out('pressing it signs out once (POST to /auth/logout) and goes back to the start address', p.posts.join() === 'POST' && /\/$/.test(p.url().split('?')[0].replace('index.html', ''))); await p.ctx.close();

  p = await open({}, { role: 'person', name: 'Ana Lopez' }, true); await p.waitForSelector('header.site-banner button:has-text("Sign out")');
  out('on the Home screen it is in the top bar', (await p.locator('header.site-banner button:has-text("Sign out")').count()) === 1);
  await p.evaluate(() => window.FD.app.go('settings')); await p.waitForTimeout(250);
  out('Settings has a Signed in card that names the person and warns the numbers stay in this browser', /Signed in/.test(await p.innerText('main')) && /signed in as Ana Lopez/.test(await p.innerText('main')) && /does not remove your numbers/.test(await p.innerText('main')) && (await p.locator('button:has-text("Admin tools")').count()) === 0);
  out('only one Sign out button per place (top bar and the Settings card)', (await signouts(p)) === 2);
  await p.ctx.close();

  // ---- the admin: the card also offers the admin tools
  p = await open({}, { role: 'admin' }, true); await p.waitForSelector('header.site-banner button:has-text("Sign out")'); await p.evaluate(() => window.FD.app.go('settings')); await p.waitForTimeout(250);
  out('the admin sees Sign out and an Admin tools button, and the card says it is the admin', /signed in as the admin/.test(await p.innerText('main')) && (await p.locator('button:has-text("Admin tools")').count()) === 1); await p.ctx.close();

  // ---- the answer arrives late, while you are typing: only the slots change
  p = await open({}, { role: 'person', name: 'Ana' }, true, 900); await p.evaluate(() => window.FD.app.go('settings')); await p.waitForTimeout(150);
  await p.fill('input[aria-label="Current balance"]', '777'); const before = await signouts(p);
  await p.waitForSelector('button:has-text("Sign out")', { timeout: 4000 });
  out('a late answer adds the buttons without wiping what was typed', before === 0 && (await signouts(p)) === 2 && (await p.inputValue('input[aria-label="Current balance"]')) === '777'); await p.ctx.close();

  // ---- a hostile name is only ever text
  p = await open({}, { role: 'person', name: '<img src=x onerror=alert(1)> Ana' }, true); await p.waitForSelector('header.site-banner button:has-text("Sign out")'); await p.evaluate(() => window.FD.app.go('settings')); await p.waitForTimeout(250);
  out('a name with markup in it is shown as plain text, never run', (await p.locator('main img').count()) === 0 && /<img src=x/.test(await p.innerText('main')) && p.errs.length === 0); await p.ctx.close();

  // ---- small phones: the top bar must still fit with both buttons
  for (const w of [320, 340, 360, 375, 390, 412, 430]) {
    p = await open({ viewport: { width: w, height: 760 }, isMobile: true, hasTouch: true }, { role: 'person', name: 'Ana' }, true); await p.waitForSelector('header.site-banner button:has-text("Sign out")');
    const fit = async () => p.evaluate(() => { const iw = document.documentElement.clientWidth, bad = []; document.querySelectorAll('.topbar *, .session-slot *').forEach((e) => { const r = e.getBoundingClientRect(); if (r.width && (r.right > iw + 1 || r.left < -1)) bad.push(e.className || e.tagName); }); const bar = document.querySelector('.topbar').getBoundingClientRect(); return { bad: bad.slice(0, 3), h: Math.round(bar.height), btnH: Math.max.apply(null, [...document.querySelectorAll('.banner-actions .btn')].map((e) => Math.round(e.getBoundingClientRect().height))) }; });
    let r = await fit(); const oneRow = w >= 360;   // below 360px the buttons drop to their own row instead of squeezing
    out(w + 'px: the top bar with How it works and Sign out fits on the screen' + (oneRow ? ' on one row' : '') + ' (height ' + r.h + 'px)', r.bad.length === 0 && r.h <= (oneRow ? 66 : 100) && r.btnH <= 48);
    await p.evaluate(() => window.FD.app.go('settings')); await p.waitForTimeout(200); r = await fit(); out(w + 'px: ...and on Settings', r.bad.length === 0);
    await p.evaluate(() => window.FD.app.ui.how = true); await p.evaluate(() => window.FD.app.render(true)); await p.waitForTimeout(150);
    out(w + 'px: the in-app How it works screen has no sideways overflow', await p.evaluate(() => document.body.scrollWidth <= document.documentElement.clientWidth));
    await p.ctx.close();
  }
  await b.close(); console.log(failed ? failed + ' FAILED' : 'ALL PASSED'); process.exit(failed ? 1 : 0);
})();
