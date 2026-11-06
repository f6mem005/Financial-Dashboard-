/* Browser test for the sign-in gate. Starts its own harness (tests/gate-server.mjs: the real gate + login + site files).
   Needs Playwright:  node tests/browser/gate-flow.js */
'use strict';
const { chromium } = require('playwright');
const { spawn } = require('node:child_process');
const path = require('node:path');
const PORT = 8913, BASE = 'http://localhost:' + PORT + '/', PASS = 'kqmv-7hxt-rwn4';
let failed = 0; const out = (k, v) => { if (!v) failed++; console.log((v ? 'PASS ' : 'FAIL ') + k); };

(async () => {
  const srv = spawn(process.execPath, [path.join(__dirname, '..', 'gate-server.mjs'), String(PORT)], { env: Object.assign({}, process.env, { SESSION_SECRET: 'a-long-random-session-secret-0123456789', SITE_PASSCODE: PASS }), stdio: ['ignore', 'pipe', 'inherit'] });
  await new Promise((res) => srv.stdout.once('data', res));
  const b = await chromium.launch(); const errs = [];
  try {
    const ctx = await b.newContext({ viewport: { width: 390, height: 800 } }); const p = await ctx.newPage();
    p.on('pageerror', (e) => errs.push('pageerror ' + e.message)); p.on('console', (m) => { if (['error', 'warning'].includes(m.type()) && !/401|403|503/.test(m.text())) errs.push(m.text()); });
    await p.goto(BASE);
    out('not signed in: only the sign-in page is shown, with the Finance Sense banner', /Sign in to continue/.test(await p.innerText('body')) && (await p.textContent('.brand-name')) === 'Finance Sense' && (await p.locator('#app').count()) === 0);
    const leak = await p.evaluate(async () => { const r = await fetch('/js/app.js'), t = await r.text(); const h = await (await fetch('/index.html')).text(); return { s1: r.status, js: /FD\.app|function boot/.test(t), html: /Know where your money|id="app"/.test(h) }; });
    out('not signed in: the site\'s code and pages are never sent (even when asked for directly)', leak.s1 === 401 && !leak.js && !leak.html);
    await p.fill('#pc', 'wrong-passcode'); await p.click('#go');
    await p.waitForFunction(() => document.getElementById('err').textContent.length > 0);
    out('a wrong passcode is refused with a plain message and the box is cleared', /not right/.test(await p.textContent('#err')) && (await p.inputValue('#pc')) === '' && !(await ctx.cookies()).some((c) => c.name === 'fs_gate'));
    await p.click('#go');
    out('an empty passcode asks for one', /Enter the passcode/.test(await p.textContent('#err')));
    await p.fill('#pc', PASS); await p.click('#go');
    await p.waitForSelector('#app', { timeout: 8000 });
    out('the right passcode opens the site (the landing page appears)', /Know where your money is going/.test(await p.innerText('#app')));
    const ck = (await ctx.cookies()).find((c) => c.name === 'fs_gate');
    out('the session cookie is HttpOnly, Secure and SameSite=Lax, and script cannot read it', !!ck && ck.httpOnly && ck.secure && ck.sameSite === 'Lax' && !/fs_gate/.test(await p.evaluate(() => document.cookie)));
    await p.reload(); await p.waitForSelector('#app');
    out('reloading stays signed in', /Know where your money is going/.test(await p.innerText('#app')));
    // someone else, no cookie
    const other = await (await b.newContext()).newPage(); await other.goto(BASE);
    out('a different browser (no cookie) is gated', /Sign in to continue/.test(await other.innerText('body')));
    // changing the passcode signs everyone out
    await other.request.post(BASE + '__test/passcode', { data: 'a-brand-new-passcode' });
    await p.reload();
    out('changing the passcode signs the existing session out', /Sign in to continue/.test(await p.innerText('body')));
    await p.fill('#pc', PASS); await p.click('#go'); await p.waitForFunction(() => document.getElementById('err').textContent.length > 0);
    out('and the old passcode no longer works', /not right/.test(await p.textContent('#err')));
    out('no console errors or CSP violations (apart from the expected refusals)', errs.length === 0);
    if (errs.length) console.log(errs);
  } finally { await b.close(); srv.kill(); }
  console.log(failed ? failed + ' FAILED' : 'ALL PASSED'); process.exit(failed ? 1 : 0);
})();
