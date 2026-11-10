/* Browser test: everyone who is signed in sees a Sign out button in the survey's banner, it signs them out, and nothing shows where there is no sign-in.
   The sign-in service is mocked (this test serves plain files). Run:  python3 -m http.server 8771   (in the project folder), then:  node tests/browser/signout-flow.js */
'use strict';
const { chromium } = require('playwright');
const URL = process.env.BASE_URL || 'http://localhost:8771/index.html';
let failed = 0; const out = (k, v) => { if (!v) failed++; console.log((v ? 'PASS ' : 'FAIL ') + k); };
(async () => {
  const b = await chromium.launch();
  async function open(o, session, delay) {
    const ctx = await b.newContext(Object.assign({ viewport: { width: 390, height: 844 } }, o || {})); const p = await ctx.newPage(); const errs = [], posts = [];
    p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => { if (['error', 'warning'].includes(m.type()) && !/\/auth\/(session|logout)/.test((m.location() || {}).url || '')) errs.push(m.text()); });
    await p.route('**/auth/session', async (r) => { if (delay) await new Promise((x) => setTimeout(x, delay)); if (session === 'fail') return r.abort(); if (!session) return r.fulfill({ status: 401, contentType: 'application/json', body: '{"error":"Sign in"}' }); r.fulfill({ contentType: 'application/json', body: JSON.stringify(session) }); });
    await p.route('**/auth/logout', (r) => { posts.push(r.request().method()); r.fulfill({ contentType: 'application/json', body: '{"ok":true}' }); });
    await p.goto(URL); p.errs = errs; p.posts = posts; p.ctx = ctx; return p;
  }
  const signouts = (p) => p.locator('button:has-text("Sign out")').count();
  const next = (p) => p.click('.nav .primary').then(() => p.waitForTimeout(360));

  // ---- nobody signed in, or no sign-in service: no button, no errors
  let p = await open({}, null); await p.waitForTimeout(400); out('not signed in (401): no Sign out button', (await signouts(p)) === 0); await p.ctx.close();
  p = await open({}, 'fail'); await p.waitForTimeout(400); out('no answer from the sign-in service: no button, and no errors', (await signouts(p)) === 0 && p.errs.length === 0); await p.ctx.close();

  // ---- a person: the first screen and a question screen
  p = await open({}, { role: 'person', name: 'Ana Lopez' }); await p.waitForSelector('button:has-text("Sign out")');
  out('a signed-in person sees Sign out in the banner on the first screen (one button)', (await signouts(p)) === 1 && (await p.locator('header.banner button:has-text("Sign out")').count()) === 1 && /Sign out\. You are signed in as Ana Lopez/.test(await p.getAttribute('button:has-text("Sign out")', 'aria-label')));
  await p.click('button:has-text("Start")'); await p.waitForTimeout(400);
  out('...and on the question screens too', (await signouts(p)) === 1 && (await p.locator('header.banner button:has-text("Sign out")').count()) === 1);
  await Promise.all([p.waitForNavigation(), p.click('header.banner button:has-text("Sign out")')]);
  out('pressing it signs out once (POST to /auth/logout) and goes back to the start address', p.posts.join() === 'POST'); await p.ctx.close();

  // ---- the admin
  p = await open({}, { role: 'admin' }); await p.waitForSelector('button:has-text("Sign out")'); out('the admin sees it too, labelled for the admin', /signed in as the admin/.test(await p.getAttribute('button:has-text("Sign out")', 'aria-label'))); await p.ctx.close();

  // ---- a failing sign-out says so, can be retried, and a double tap sends one request
  for (const [how, handler] of [['the server refuses it (403)', (r) => r.fulfill({ status: 403, contentType: 'application/json', body: '{"error":"Bad request"}' })], ['the network is down', (r) => r.abort()]]) {
    p = await open({}, { role: 'person', name: 'Ana' }); await p.unroute('**/auth/logout'); let n = 0; await p.route('**/auth/logout', (r) => { n++; handler(r); });
    await p.waitForSelector('button:has-text("Sign out")'); const startUrl = p.url();
    await p.click('button:has-text("Sign out")'); await p.waitForSelector('.so-fail', { timeout: 3000 });
    out('when ' + how + ', you stay where you are and are told it did not work', p.url() === startUrl && /Could not sign out/.test(await p.innerText('.so-fail')) && (await signouts(p)) === 1);
    await p.click('button:has-text("Sign out")'); await p.waitForTimeout(400); out('...and you can try again (a second request goes out)', n === 2); await p.ctx.close();
  }
  p = await open({}, { role: 'person', name: 'Ana' }); await p.unroute('**/auth/logout'); let slow = 0; await p.route('**/auth/logout', async (r) => { slow++; await new Promise((x) => setTimeout(x, 600)); r.fulfill({ contentType: 'application/json', body: '{"ok":true}' }); });
  await p.waitForSelector('button:has-text("Sign out")'); const so = p.locator('button:has-text("Sign out")');
  await Promise.all([p.waitForNavigation(), (async () => { await so.click(); await so.click({ force: true }).catch(() => {}); await so.click({ force: true }).catch(() => {}); })()]);
  out('tapping Sign out three times quickly sends only one request', slow === 1); await p.ctx.close();

  // ---- coming back from the browser's page cache must not leave a dead button
  p = await open({}, { role: 'person', name: 'Ana' }); await p.unroute('**/auth/logout'); let hang = 0; await p.route('**/auth/logout', () => { hang++; /* never answers */ });
  await p.waitForSelector('button:has-text("Sign out")'); await p.click('button:has-text("Sign out")'); await p.waitForTimeout(200); await p.click('button:has-text("Sign out")', { force: true }); await p.waitForTimeout(200); const stuck = hang;
  await p.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }))); await p.click('button:has-text("Sign out")', { force: true }); await p.waitForTimeout(300);
  out('while a sign-out is in flight a second tap is ignored, and a page restored from the cache can sign out again', stuck === 1 && hang === 2); await p.ctx.close();

  // ---- signing out in the middle of the survey keeps what was typed (answers are saved as you type, in this browser)
  p = await open({}, { role: 'person', name: 'Ana' });
  await p.evaluate(() => localStorage.setItem('fs-survey-v1', JSON.stringify({ v: 1, t: Date.now(), rid: 'abcd1234', started: true, qid: 'q12', seed: 1, answers: {} }))); await p.reload(); await p.waitForSelector('textarea');
  await p.fill('textarea', 'a half-typed thought'); await p.waitForSelector('button:has-text("Sign out")');
  await Promise.all([p.waitForNavigation(), p.click('header.banner button:has-text("Sign out")')]);
  out('signing out part-way through keeps the half-typed answer', (await p.evaluate(() => { const s = JSON.parse(localStorage.getItem('fs-survey-v1') || '{}'); return s.answers && s.answers.q12; })) === 'a half-typed thought'); await p.ctx.close();

  // ---- the answer fails once, then the tab comes back: the button appears; a plain 401 is not retried
  { const ctx = await b.newContext({ viewport: { width: 390, height: 844 } }); p = await ctx.newPage(); let calls = 0;
    await p.route('**/auth/session', (r) => { calls++; if (calls === 1) return r.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"Unavailable"}' }); r.fulfill({ contentType: 'application/json', body: '{"role":"person","name":"Ana"}' }); });
    await p.goto(URL); await p.waitForTimeout(400); const first = await signouts(p);
    await p.evaluate(() => window.dispatchEvent(new Event('focus'))); await p.waitForSelector('button:has-text("Sign out")', { timeout: 3000 });
    out('a failed first lookup (503) is retried when you come back to the tab, and the button then appears', first === 0 && calls === 2);
    await p.evaluate(() => window.dispatchEvent(new Event('focus'))); await p.waitForTimeout(300); out('...and it stops asking once it has an answer', calls === 2); await ctx.close(); }
  { const ctx = await b.newContext({ viewport: { width: 390, height: 844 } }); p = await ctx.newPage(); let calls = 0; await p.route('**/auth/session', (r) => { calls++; r.fulfill({ status: 401, contentType: 'application/json', body: '{"error":"Sign in"}' }); });
    await p.goto(URL); await p.waitForTimeout(300); await p.evaluate(() => window.dispatchEvent(new Event('focus'))); await p.waitForTimeout(300); out('a plain "not signed in" (401) is not retried', calls === 1 && (await signouts(p)) === 0); await ctx.close(); }

  // ---- a late answer adds the button without rebuilding the screen
  p = await open({}, { role: 'person', name: 'Ana' }, 900); await p.click('button:has-text("Start")'); await p.waitForTimeout(300); const heading = await p.textContent('h1'); const before = await signouts(p);
  await p.waitForSelector('button:has-text("Sign out")', { timeout: 4000 }); out('a late answer adds the button without changing the screen', before === 0 && (await p.textContent('h1')) === heading); await p.ctx.close();

  // ---- a hostile name is only ever text
  p = await open({}, { role: 'person', name: '<img src=x onerror=alert(1)> Ana' }); await p.waitForSelector('button:has-text("Sign out")');
  out('a name with markup in it is never run as markup', (await p.locator('#app img').count()) === 0 && /<img src=x/.test(await p.getAttribute('button:has-text("Sign out")', 'aria-label')) && p.errs.length === 0); await p.ctx.close();

  // ---- small phones: the banner with its button fits, on the first screen and on a question
  for (const w of [320, 360, 390, 430]) {
    p = await open({ viewport: { width: w, height: 760 }, isMobile: true, hasTouch: true }, { role: 'person', name: 'A person with a rather long name here' }); await p.waitForSelector('button:has-text("Sign out")');
    const fit = () => p.evaluate(() => { const iw = document.documentElement.clientWidth, bad = []; document.querySelectorAll('.banner *').forEach((e) => { const r = e.getBoundingClientRect(); if (r.width && (r.right > iw + 1 || r.left < -1)) bad.push(e.className || e.tagName); }); const btn = document.querySelector('.signout-btn').getBoundingClientRect(); return { bad: bad.slice(0, 3), btnH: Math.round(btn.height), wide: document.body.scrollWidth > iw }; });
    let r = await fit(); out(w + 'px: the first-screen banner with Sign out fits, and the label stays on one line', r.bad.length === 0 && !r.wide && r.btnH <= 48);
    await p.click('button:has-text("Start")'); await p.waitForTimeout(400); r = await fit(); out(w + 'px: ...and on a question screen', r.bad.length === 0 && !r.wide && r.btnH <= 48); await p.ctx.close();
  }
  await b.close(); console.log(failed ? failed + ' FAILED' : 'ALL PASSED'); process.exit(failed ? 1 : 0);
})();
