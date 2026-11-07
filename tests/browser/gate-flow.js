/* Browser test for the sign-in gate and the admin tools. Starts its own harness (tests/gate-server.mjs: the real gate, the real
   functions, an in-memory store and the site files). Needs Playwright:  node tests/browser/gate-flow.js */
'use strict';
const { chromium } = require('playwright');
const { spawn } = require('node:child_process');
const path = require('node:path');
let SITE; const PORT = 8913, BASE = 'http://localhost:' + PORT + '/', ADMIN = 'admin-passcode-42';
let failed = 0; const out = (k, v) => { if (!v) failed++; console.log((v ? 'PASS ' : 'FAIL ') + k); };
const CODE = /^([bdfghkmnprstvz][aeiou]){3}[2-9]{2}$/;

(async () => {
  ({ SITE } = await import('../../netlify/shared/site.mjs'));
  const SIGNIN = new RegExp(SITE.heading);
  const srv = spawn(process.execPath, ['--no-warnings', path.join(__dirname, '..', 'gate-server.mjs'), String(PORT)], { env: Object.assign({}, process.env, { SESSION_SECRET: 'a-long-random-session-secret-0123456789', ADMIN_PASSCODE: ADMIN }), stdio: ['ignore', 'pipe', 'inherit'] });
  await new Promise((res) => srv.stdout.once('data', res));
  const b = await chromium.launch(); const errs = [];
  const watch = (p) => { p.on('pageerror', (e) => errs.push('pageerror ' + e.message)); p.on('console', (m) => { if (['error', 'warning'].includes(m.type()) && !/40[0139]|503|ERR_INTERNET_DISCONNECTED/.test(m.text())) errs.push(m.text()); }); p.on('dialog', (d) => d.accept()); return p; };
  const signIn = async (p, name, code) => { await p.fill('#nm', name); await p.fill('#pc', code); await p.click('#go'); };
  const personPage = async () => { const ctx = await b.newContext({ viewport: { width: 390, height: 800 } }); return { ctx, p: watch(await ctx.newPage()) }; };
  try {
    const actx = await b.newContext({ viewport: { width: 390, height: 900 }, permissions: ['clipboard-read', 'clipboard-write'] }), a = watch(await actx.newPage());
    await a.goto(BASE);
    out('not signed in: only the sign-in page, with the banner, a name box and a passcode box', SIGNIN.test(await a.innerText('body')) && (await a.textContent('.brand-name')) === 'Finance Sense' && (await a.locator('#nm').count()) === 1 && (await a.locator('#app').count()) === 0);
    out('the sign-in page starts in the name box, and the hint is tied to it', (await a.evaluate(() => document.activeElement && document.activeElement.id)) === 'nm' && (await a.getAttribute('#nm', 'aria-describedby')) === 'nm-hint');
    const leak = await a.evaluate(async () => { const r = await fetch('/js/app.js'), t = await r.text(), h = await (await fetch('/index.html')).text(), ad = await fetch('/admin/admin.js'); return { s: r.status, js: /FD\.app|function boot/.test(t), html: /Know where your money|id="app"/.test(h), admin: ad.status }; });
    const icon = await a.evaluate(async () => { const l = document.querySelector('link[rel="apple-touch-icon"]'); if (!l) return null; const r = await fetch(l.href, { credentials: 'omit' }); return [r.status, r.headers.get('content-type'), l.getAttribute('href'), !!document.querySelector('link[rel="manifest"]')]; });
    out('the sign-in page declares the home-screen icon and manifest, and the icon loads with no cookie (so adding it to a phone home screen gets the real icon)', !!icon && icon[0] === 200 && /image\/png/.test(icon[1]) && icon[2] === '/icons/apple-touch-icon.png' && icon[3]);
    const cdp = await actx.newCDPSession(a); await cdp.send('Page.enable'); const mf = await cdp.send('Page.getAppManifest');
    out('the sign-in page\'s manifest is read by the browser with no errors', (mf.errors || []).length === 0 && /manifest\.webmanifest$/.test(mf.url));
    out('not signed in: the site\'s code, pages and the admin files are never sent', leak.s === 401 && !leak.js && !leak.html && leak.admin === 401);
    await signIn(a, '', 'wrong-passcode'); await a.waitForFunction(() => document.getElementById('err').textContent.length > 0);
    out('a wrong admin passcode is refused with a plain message and the box is cleared', /not right/.test(await a.textContent('#err')) && (await a.inputValue('#pc')) === '' && !(await actx.cookies()).some((c) => c.name === '__Host-fs_gate'));
    await a.click('#go'); out('an empty passcode asks for one', /Enter the passcode/.test(await a.textContent('#err')));
    await signIn(a, '', ADMIN); await a.waitForURL('**/admin/', { timeout: 8000 });
    out('the admin (blank name + admin passcode) lands on the admin page', /Add a person/.test(await a.innerText('#app')) || (await a.waitForSelector('#generate'), true));
    const ck = (await actx.cookies()).find((c) => c.name === '__Host-fs_gate');
    out('the session cookie is HttpOnly, Secure and SameSite=Lax, and script cannot read it', !!ck && ck.httpOnly && ck.secure && ck.sameSite === 'Lax' && !/fs_gate/.test(await a.evaluate(() => document.cookie)));

    // ---- the Generate button ----
    await a.click('#generate'); const g1 = await a.inputValue('#new-code'); await a.click('#generate'); const g2 = await a.inputValue('#new-code');
    out('Generate fills in an easy 8-character code (like rakobu47), and a new one each time', CODE.test(g1) && CODE.test(g2) && g1 !== g2);
    // ---- add a person ----
    await a.fill('#new-name', 'Ana Lopez'); await a.click('#generate'); const code1 = await a.inputValue('#new-code'); await a.click('#add');
    await a.waitForSelector('#revealed-code');
    out('adding shows the passcode once, with a Copy button, and lists the person', (await a.textContent('#revealed-code')) === code1 && (await a.locator('#people .person-name:has-text("Ana Lopez")').count()) === 1 && (await a.locator('#copy').count()) === 1);
    await a.click('#copy'); out('Copy copies the passcode', (await a.evaluate(() => navigator.clipboard.readText())) === code1);
    await a.click('#done'); out('after Done the passcode is no longer on the page', (await a.locator('#revealed-code').count()) === 0 && !(await a.innerText('#app')).includes(code1));
    await a.fill('#new-name', 'Bo'); await a.fill('#new-code', 'short'); await a.click('#add'); await a.waitForFunction(() => /8 to 64/.test(document.getElementById('msg').textContent));
    out('a too-short passcode is refused with a plain message, and what was typed is kept', /8 to 64 characters/.test(await a.textContent('#msg')) && (await a.inputValue('#new-name')) === 'Bo' && (await a.inputValue('#new-code')) === 'short');
    out('after a refusal focus moves to the message', (await a.evaluate(() => document.activeElement && document.activeElement.id)) === 'msg');
    await a.fill('#new-name', 'ana lopez'); await a.fill('#new-code', 'another-code-1'); await a.click('#add'); await a.waitForFunction(() => /already/.test(document.getElementById('msg').textContent));
    out('the same name twice is refused', /already in the list/.test(await a.textContent('#msg')));
    // the passcode shown is the one that was stored, even if the boxes are changed while the request runs
    await a.fill('#new-name', 'Dee Ford'); await a.fill('#new-code', 'firstcode1');
    await a.route('**/auth/admin', async (route) => { const post = route.request().postData() || ''; if (/"action":"create"/.test(post)) await new Promise((r) => setTimeout(r, 600)); await route.continue(); });
    await a.click('#add'); await a.fill('#new-code', 'secondcode2');           // edited while the request is in flight
    await a.waitForSelector('#revealed-code');
    const shown = await a.textContent('#revealed-code'); await a.unroute('**/auth/admin');
    out('the revealed passcode is the one that was stored (not what the box says now)', shown === 'firstcode1' && (await a.inputValue('#new-code')) === 'secondcode2');
    out('after a successful add, focus lands on the new passcode panel', (await a.evaluate(() => document.activeElement && document.activeElement.id)) === 'reveal');
    await a.click('#done'); await a.fill('#new-code', '');
    const ddx = await personPage(); await ddx.p.goto(BASE); await signIn(ddx.p, 'Dee Ford', 'firstcode1'); await ddx.p.waitForSelector('#app', { timeout: 8000 });
    out('and that passcode really signs her in', (await ddx.p.locator('#app').count()) === 1); await ddx.ctx.close();
    await a.click('button[aria-label="Remove Dee Ford"]'); await a.waitForFunction(() => /was removed/.test(document.getElementById('msg').textContent));
    out('after removing, focus lands on the message', (await a.evaluate(() => document.activeElement && document.activeElement.id)) === 'msg');
    // the page keeps working when the network drops, and Enter submits the form
    await a.fill('#new-name', 'Cy Dunn'); await a.click('#generate'); await actx.setOffline(true); await a.click('#add');
    await a.waitForFunction(() => /Could not reach the server/.test(document.getElementById('msg').textContent));
    out('offline: a plain message appears, nothing typed is lost, and the button is usable again', (await a.inputValue('#new-name')) === 'Cy Dunn' && !(await a.isDisabled('#add')));
    await actx.setOffline(false); await a.focus('#new-name'); await a.keyboard.press('Enter');
    await a.waitForSelector('#revealed-code');
    out('back online, pressing Enter in the form adds the person', (await a.locator('#people .person-name:has-text("Cy Dunn")').count()) === 1);
    await a.click('#done'); await a.click('button[aria-label="Remove Cy Dunn"]'); await a.waitForFunction(() => /was removed/.test(document.getElementById('msg').textContent));
    const apiText = await a.evaluate(async () => (await (await fetch('/auth/admin', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'list' }) })).text()));
    out('the list from the server never contains a hash, salt or passcode', !/hash|salt|"ver"/.test(apiText) && !apiText.includes(code1));

    // ---- the person signs in ----
    const { ctx: pctx, p } = await personPage(); await p.goto(BASE);
    await signIn(p, 'ANA LOPEZ', code1); await p.waitForSelector('#app', { timeout: 8000 });
    out('the person signs in with their name (any case) and passcode, and the site opens', (await p.locator('#app').count()) === 1 && !/Admins only/.test(await p.innerText('body')));
    const adminTry = await p.goto(BASE + 'admin/');
    out('a person cannot open the admin area', adminTry.status() === 403 && /Admins only/.test(await p.innerText('body')));
    const apiTry = await p.evaluate(async () => (await fetch('/auth/admin', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'list' }) })).status);
    out('a person cannot use the admin tools', apiTry === 403);
    await p.goto(BASE); await p.waitForSelector('#app');
    const { ctx: wctx, p: w } = await personPage(); await w.goto(BASE); await signIn(w, 'Ana Lopez', 'wrong-code-1'); await w.waitForFunction(() => document.getElementById('err').textContent.length > 0);
    const w2 = await (async () => { await w.fill('#nm', 'Nobody'); await w.fill('#pc', code1); await w.click('#go'); await w.waitForFunction(() => document.getElementById('err').textContent.length > 0); return await w.textContent('#err'); })();
    out('a wrong code and an unknown name get the same message', /name or passcode is not right/.test(w2) && /name or passcode is not right/.test(await w.textContent('#err')));
    await wctx.close();

    // ---- a new passcode ends the old one at once ----
    await a.click('button[aria-label="New passcode for Ana Lopez"]'); await a.waitForSelector('#revealed-code');
    const code2 = await a.textContent('#revealed-code');
    out('"New passcode" generates a fresh easy code and shows it once', CODE.test(code2) && code2 !== code1);
    await p.reload();
    out('her existing session ends at once (her next page load shows the sign-in page)', SIGNIN.test(await p.innerText('body')));
    await signIn(p, 'Ana Lopez', code1); await p.waitForFunction(() => document.getElementById('err').textContent.length > 0);
    out('and the old passcode no longer works', /not right/.test(await p.textContent('#err')));
    await signIn(p, 'Ana Lopez', code2); await p.waitForSelector('#app', { timeout: 8000 });
    out('the new passcode works', (await p.locator('#app').count()) === 1);

    // ---- removing someone ends their access at once ----
    await a.click('#done'); await a.click('button[aria-label="Remove Ana Lopez"]'); await a.waitForFunction(() => /was removed/.test(document.getElementById('msg').textContent));
    out('Remove takes her off the list', (await a.locator('#people .person-name').count()) === 0);
    await p.reload();
    out('her next page load shows the sign-in page', SIGNIN.test(await p.innerText('body')));
    await signIn(p, 'Ana Lopez', code2); await p.waitForFunction(() => document.getElementById('err').textContent.length > 0);
    out('and she cannot sign in again', /not right/.test(await p.textContent('#err')));

    // ---- changing the admin passcode, signing out ----
    await a.click('#signout'); await a.waitForURL(BASE);
    out('Sign out returns to the sign-in page and the admin area is gated again', SIGNIN.test(await a.innerText('body')) && (await (await a.goto(BASE + 'admin/')).status()) === 401);
    await signIn(a, '', ADMIN); await a.waitForURL('**/admin/'); await a.waitForSelector('#generate');   // let the admin page finish loading first
    await a.request.post(BASE + '__test/admin-passcode', { data: 'a-brand-new-admin-code' }); await a.reload();
    out('changing the admin passcode signs the admin out', SIGNIN.test(await a.innerText('body')));
    out('no console errors or CSP violations (apart from the expected refusals)', errs.length === 0);
    if (errs.length) console.log(errs);
    await pctx.close();
  } finally { await b.close(); srv.kill(); }
  console.log(failed ? failed + ' FAILED' : 'ALL PASSED'); process.exit(failed ? 1 : 0);
})();
