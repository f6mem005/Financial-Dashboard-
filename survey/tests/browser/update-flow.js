/* Browser test: people are told to refresh when a newer version is live. Needs Playwright and the survey served on 8771
   (python3 -m http.server 8771 from the project folder):  node tests/browser/update-flow.js
   The server's version file and the page's own version are simulated with routes. */
'use strict';
const { chromium } = require('playwright');
const URL = process.env.BASE_URL || 'http://localhost:8771/index.html';
let failed = 0; const out = (k, v) => { if (!v) failed++; console.log((v ? 'PASS ' : 'FAIL ') + k); };
(async () => {
  const b = await chromium.launch(); const errs = [];
  const ctx = await b.newContext({ viewport: { width: 390, height: 800 } }); const p = await ctx.newPage();
  p.on('pageerror', (e) => errs.push('pageerror ' + e.message)); p.on('console', (m) => { if (['error', 'warning'].includes(m.type()) && !/40[14]|50[03]/.test(m.text())) errs.push(m.text()); });
  let live = { status: 200, body: '{"build":"20261106100000-aaaaaaa"}' }, asked = 0;
  await ctx.route('**/js/version.js', (r) => r.fulfill({ contentType: 'text/javascript', body: "(window.SV = window.SV || {}).build = '20261106100000-aaaaaaa';" }));
  await ctx.route('**/version.json', (r) => { asked++; r.fulfill({ status: live.status, contentType: 'application/json', body: live.body }); });
  await p.clock.install(); await p.goto(URL);
  const bar = () => p.locator('#update-bar').count();
  await p.waitForSelector('#app');
  out('same version: no bar', (await bar()) === 0);
  // a mixed load: the page's HTML carries a different build than its script (a deploy landed mid-load)
  const mixed = await ctx.newPage(); await mixed.route('**/index.html', async (r) => { const res = await r.fetch(); r.fulfill({ response: res, body: (await res.text()).replace('<meta name="build" content="dev">', '<meta name="build" content="20250101000000-old">') }); });
  await mixed.route('**/js/version.js', (r) => r.fulfill({ contentType: 'text/javascript', body: "(window.SV = window.SV || {}).build = '20261106100000-aaaaaaa';" })); await mixed.route('**/version.json', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{"build":"20261106100000-aaaaaaa"}' }));
  await mixed.goto(URL); await mixed.waitForSelector('#update-bar', { timeout: 5000 });
  out('a page whose HTML and script come from different builds is told to refresh at once', /questionnaire was updated/.test(await mixed.textContent('#update-bar'))); await mixed.close();
  await p.evaluate(() => window.dispatchEvent(new Event('focus'))); await p.waitForTimeout(200);
  out('coming back to the window checks, and the same version still shows nothing', asked >= 1 && (await bar()) === 0);

  live = { status: 200, body: '{"build":"20261106120000-bbbbbbb"}' };                       // a new deploy goes live
  await p.evaluate(() => window.dispatchEvent(new Event('focus'))); await p.waitForSelector('#update-bar');
  const t = await p.textContent('#update-bar');
  out('a new version: a bar says so, mentions the numbers are saved, and has a Refresh button', /questionnaire was updated/.test(t) && /answers so far are saved/.test(t) && (await p.locator('#update-bar button:has-text("Refresh")').count()) === 1);
  out('the bar sits at the top of the page, in the flow, right AFTER the skip link (which stays first in the tab order)', await p.evaluate(() => { const bar = document.getElementById('update-bar'); return bar.previousElementSibling && bar.previousElementSibling.classList.contains('skip') && getComputedStyle(bar).position === 'sticky'; }));
  out('it is announced as an alert, and a focused skip link is not hidden under it', (await p.getAttribute('#update-bar', 'role')) === 'alert' && await p.evaluate(() => { const s = document.querySelector('.skip'); s.focus(); const r = s.getBoundingClientRect(); const el = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return el === s; }));
  out('focused controls are kept clear of the bar (scroll padding)', await p.evaluate(() => parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop) >= 100));
  await p.click('button:has-text("Start")');
  out('the bar stays while the survey moves to its next screen', (await bar()) === 1);
  await p.evaluate(() => window.dispatchEvent(new Event('focus'))); await p.waitForTimeout(200);
  out('it is not added twice', (await bar()) === 1);
  const typed = await p.evaluate(() => { const i = document.createElement('input'); i.id = 'probe'; i.value = 'half typed'; document.querySelector('main').appendChild(i); return i.value; });
  await p.evaluate(() => window.dispatchEvent(new Event('focus'))); await p.waitForTimeout(100);
  out('it never reloads by itself (what someone is typing is safe)', (await p.inputValue('#probe')) === typed);
  await Promise.all([p.waitForNavigation(), p.click('#update-bar button')]);
  out('Refresh reloads the page', await p.evaluate(() => !!document.getElementById('app')));

  // the timer, with the clock
  await p.waitForSelector('#app'); await p.evaluate(() => { const b = document.getElementById('update-bar'); if (b) b.remove(); });
  const before = asked; await p.clock.fastForward(5 * 60 * 1000 + 1000); await p.waitForTimeout(300);
  out('it also checks by itself every 5 minutes', asked > before);

  let session = 401; await ctx.route('**/auth/session', (r) => r.fulfill({ status: session, contentType: 'application/json', body: '{}' }));
  live = { status: 401, body: '<html>sign in</html>' };                                    // the gate says 401 ... but is it really a sign-out?
  session = 503; await p.evaluate(() => { const b = document.getElementById('update-bar'); if (b) b.remove(); }); await p.evaluate(() => window.dispatchEvent(new Event('focus'))); await p.waitForTimeout(300);
  out('a 401 while the session check says storage is down is NOT shown as signed out', (await bar()) === 0);
  session = 401                                                                            // the sign-in really ended
  await p.evaluate(() => { const b = document.getElementById('update-bar'); if (b) b.remove(); }); await p.evaluate(() => window.dispatchEvent(new Event('focus'))); await p.waitForSelector('#update-bar');
  out('signed out: the bar says so and offers Refresh', /signed out/.test(await p.textContent('#update-bar')) && (await p.locator('#update-bar button').count()) === 1);
  live = { status: 200, body: '{"build":"20261106100000-aaaaaaa"}' }; await p.evaluate(() => window.dispatchEvent(new Event('focus'))); await p.waitForTimeout(300);
  out('a signed-out bar disappears once things are fine again (the same version is live)', (await bar()) === 0);
  await p.evaluate(() => document.dispatchEvent(new Event('visibilitychange'))); await p.waitForTimeout(200);
  live = { status: 200, body: '{"build":"20261106130000-ccccccc"}' }; await p.evaluate(() => document.dispatchEvent(new Event('visibilitychange'))); await p.waitForSelector('#update-bar');
  out('coming back to the tab (visibility) also checks', /questionnaire was updated/.test(await p.textContent('#update-bar')));
  await p.evaluate(() => { const b = document.getElementById('update-bar'); if (b) b.remove(); });
  live = { status: 401, body: '<html>sign in</html>' };
  for (const bad of [{ status: 404, body: 'x' }, { status: 500, body: 'x' }, { status: 200, body: 'not json' }, { status: 200, body: '{"build":42}' }]) {
    live = bad; await p.evaluate(() => { const b = document.getElementById('update-bar'); if (b) b.remove(); }); await p.evaluate(() => window.dispatchEvent(new Event('focus'))); await p.waitForTimeout(250);
    out('an unclear answer (' + bad.status + ' ' + bad.body.slice(0, 8) + ') shows nothing', (await bar()) === 0);
  }
  out('no console errors', errs.length === 0); if (errs.length) console.log(errs);
  await b.close(); console.log(failed ? failed + ' FAILED' : 'ALL PASSED'); process.exit(failed ? 1 : 0);
})();
