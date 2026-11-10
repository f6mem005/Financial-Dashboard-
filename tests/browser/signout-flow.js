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
    p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => { if (['error', 'warning'].includes(m.type()) && !/\/auth\/(session|logout)/.test((m.location() || {}).url || '')) errs.push(m.text()); });
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
  out('on the first screen Sign out is in the blue top area, near the top (not buried below the facts)', (await p.locator('.landing-hero button:has-text("Sign out")').count()) === 1 && (await p.evaluate(() => { const b = document.querySelector('.landing-hero .session-slot button').getBoundingClientRect(); return b.top < 110; })));
  out('a signed-in person sees Sign out on the first screen (one button)', (await signouts(p)) === 1 && /Sign out\. You are signed in as Ana Lopez/.test(await p.getAttribute('button:has-text("Sign out")', 'aria-label')));
  await p.click('button:has-text("Get started")'); await p.waitForTimeout(250);
  out('...and in the top bar of the questions, next to Home', (await signouts(p)) === 1 && (await p.locator('header.site-banner button:has-text("Home")').count()) === 1 && (await p.locator('header.site-banner button:has-text("Sign out")').count()) === 1);
  await Promise.all([p.waitForNavigation(), p.click('header.site-banner button:has-text("Sign out")')]);
  out('pressing it signs out once (POST to /auth/logout) and goes back to the start address', p.posts.join() === 'POST' && /\/$/.test(p.url().split('?')[0].replace('index.html', ''))); await p.ctx.close();

  p = await open({}, { role: 'person', name: 'Ana Lopez' }, true); await p.waitForSelector('header.site-banner button:has-text("Sign out")');
  out('on the Home screen it is in the top bar', (await p.locator('header.site-banner button:has-text("Sign out")').count()) === 1);
  await p.evaluate(() => window.FD.app.go('settings')); await p.waitForTimeout(250);
  out('Settings has a Signed in card that names the person and warns the numbers stay in this browser', /Signed in/.test(await p.innerText('main')) && /signed in as Ana Lopez/.test(await p.innerText('main')) && /does not remove your numbers/.test(await p.innerText('main')) && (await p.locator('button:has-text("Admin tools")').count()) === 0);
  out('on Settings there are exactly two Sign out buttons: the top bar and the Signed in card', (await signouts(p)) === 2);
  await p.ctx.close();

  // ---- the admin: the card also offers the admin tools
  p = await open({}, { role: 'admin' }, true); await p.waitForSelector('header.site-banner button:has-text("Sign out")'); await p.evaluate(() => window.FD.app.go('settings')); await p.waitForTimeout(250);
  out('the admin sees Sign out and an Admin tools button, and the card says it is the admin', /signed in as the admin/.test(await p.innerText('main')) && (await p.locator('button:has-text("Admin tools")').count()) === 1); await p.ctx.close();

  // ---- the answer arrives late, while you are typing: only the slots change
  p = await open({}, { role: 'person', name: 'Ana' }, true, 900); await p.evaluate(() => window.FD.app.go('settings')); await p.waitForTimeout(150);
  await p.fill('input[aria-label="Current balance"]', '777'); const before = await signouts(p);
  await p.waitForSelector('button:has-text("Sign out")', { timeout: 4000 });
  out('a late answer adds the buttons without wiping what was typed', before === 0 && (await signouts(p)) === 2 && (await p.inputValue('input[aria-label="Current balance"]')) === '777'); await p.ctx.close();

  // ---- a sign-out that fails must not look like it worked, and a double tap sends one request
  for (const [how, handler] of [['the server refuses it (403)', (r) => r.fulfill({ status: 403, contentType: 'application/json', body: '{"error":"Bad request"}' })], ['the network is down', (r) => r.abort()]]) {
    p = await open({}, { role: 'person', name: 'Ana' }, true); await p.unroute('**/auth/logout'); let n = 0; await p.route('**/auth/logout', (r) => { n++; handler(r); });
    await p.waitForSelector('header.site-banner button:has-text("Sign out")'); const startUrl = p.url();
    await p.click('header.site-banner button:has-text("Sign out")'); await p.waitForTimeout(500);
    out('when ' + how + ', you stay where you are and are told it did not work', p.url() === startUrl && /Could not sign out/.test(await p.innerText('#toast')) && (await p.locator('header.site-banner button:has-text("Sign out")').count()) === 1);
    await p.click('header.site-banner button:has-text("Sign out")'); await p.waitForTimeout(400); out('...and you can try again (a second request goes out)', n === 2); await p.ctx.close();
  }
  p = await open({}, { role: 'person', name: 'Ana' }, true); await p.unroute('**/auth/logout'); let slow = 0; await p.route('**/auth/logout', async (r) => { slow++; await new Promise((x) => setTimeout(x, 600)); r.fulfill({ contentType: 'application/json', body: '{"ok":true}' }); });
  await p.waitForSelector('header.site-banner button:has-text("Sign out")'); const so = p.locator('header.site-banner button:has-text("Sign out")');
  await Promise.all([p.waitForNavigation(), (async () => { await so.click(); await so.click({ force: true }).catch(() => {}); await so.click({ force: true }).catch(() => {}); })()]);
  out('tapping Sign out three times quickly sends only one request', slow === 1); await p.ctx.close();

  // ---- coming back from the browser's page cache (Back after signing out) must not leave a dead button
  p = await open({}, { role: 'person', name: 'Ana' }, true); await p.unroute('**/auth/logout'); let hang = 0; await p.route('**/auth/logout', () => { hang++; /* never answers */ });
  await p.waitForSelector('header.site-banner button:has-text("Sign out")'); await p.click('header.site-banner button:has-text("Sign out")'); await p.waitForTimeout(200);
  await p.click('header.site-banner button:has-text("Sign out")', { force: true }); await p.waitForTimeout(200); const stuck = hang;
  await p.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }))); await p.click('header.site-banner button:has-text("Sign out")', { force: true }); await p.waitForTimeout(300);
  out('while a sign-out is in flight a second tap is ignored, and a page restored from the cache can sign out again', stuck === 1 && hang === 2); await p.ctx.close();

  // ---- signing out in the middle of setup keeps what was typed (as Home and Refresh do)
  p = await open({}, { role: 'person', name: 'Ana' }); await p.waitForSelector('button:has-text("Sign out")'); await p.click('button:has-text("Get started")'); await p.click('.option:has-text("Every 2 weeks")'); await p.waitForTimeout(400);
  await p.fill('input[aria-label="Paycheck amount"]', '1234');
  await Promise.all([p.waitForNavigation(), p.click('header.site-banner button:has-text("Sign out")')]);
  out('signing out part-way through setup does not lose the amount that was being typed', (await p.evaluate(() => { const s = JSON.parse(localStorage.getItem('fd.v1') || '{}'); return s.answers && s.answers.pay && s.answers.pay.amount; })) === 1234); await p.ctx.close();

  // ---- the "who is signed in" answer fails once, then the tab comes back into view: the button appears
  { const ctx = await b.newContext({ viewport: { width: 390, height: 800 } }); p = await ctx.newPage(); let calls = 0;
    await p.route('**/auth/session', (r) => { calls++; if (calls === 1) return r.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"Unavailable"}' }); r.fulfill({ contentType: 'application/json', body: '{"role":"person","name":"Ana"}' }); });
    await p.goto(URL); await p.waitForTimeout(400); const first = await signouts(p);
    await p.evaluate(() => window.dispatchEvent(new Event('focus'))); await p.waitForSelector('button:has-text("Sign out")', { timeout: 3000 });
    out('a failed first lookup (503) is retried when you come back to the tab, and the button then appears', first === 0 && calls === 2);
    await p.evaluate(() => window.dispatchEvent(new Event('focus'))); await p.waitForTimeout(300); out('...and it stops asking once it has an answer', calls === 2); await ctx.close(); }
  { const ctx = await b.newContext({ viewport: { width: 390, height: 800 } }); p = await ctx.newPage(); let calls = 0; await p.route('**/auth/session', (r) => { calls++; r.fulfill({ status: 401, contentType: 'application/json', body: '{"error":"Sign in"}' }); });
    await p.goto(URL); await p.waitForTimeout(300); await p.evaluate(() => window.dispatchEvent(new Event('focus'))); await p.waitForTimeout(300); out('a plain "not signed in" (401) is not retried', calls === 1 && (await signouts(p)) === 0); await ctx.close(); }

  // ---- demo mode: the Settings card does not talk about removing numbers that were never saved
  p = await open({}, { role: 'person', name: 'Ana' }); await p.waitForSelector('button:has-text("Sign out")'); await p.click('button:has-text("Look at a demo first")'); await p.waitForTimeout(250); await p.evaluate(() => window.FD.app.go('settings')); await p.waitForTimeout(250);
  out('in the demo the Signed in card does not tell you to delete your data', /Signed in/.test(await p.innerText('main')) && /nothing to remove/.test(await p.innerText('main')) && !/delete your data first/.test(await p.innerText('main'))); await p.ctx.close();

  // ---- the first screen of a small phone (375x667, the size where the three facts stack): Sign out is on screen without scrolling
  for (const [w, h] of [[375, 667], [320, 568], [390, 844]]) {
    p = await open({ viewport: { width: w, height: h }, isMobile: true, hasTouch: true }, { role: 'person', name: 'Ana' }); await p.waitForSelector('.landing-hero button:has-text("Sign out")');
    out(w + 'x' + h + ': the first screen shows Sign out without scrolling', await p.evaluate(() => { const b = document.querySelector('.landing-hero .session-slot button').getBoundingClientRect(); return b.top >= 0 && b.bottom <= window.innerHeight && b.right <= document.documentElement.clientWidth; }));
    await p.ctx.close();
  }

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
