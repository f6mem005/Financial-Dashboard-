// Browser test: the real dashboard (demo-only mode) in front of the questions: Start -> /demo/ -> Continue -> question 1.
// Run:  node survey/scripts/sync-demo.mjs (from the repo root, once), python3 -m http.server 8771 (in survey/), then:  node tests/browser/demo-flow.js
'use strict';
const { chromium } = require('playwright');
const BASE = (process.env.BASE_URL || 'http://localhost:8771/index.html').replace(/index\.html$/, '');
let failed = 0; const out = (k, v) => { if (!v) failed++; console.log((v ? 'PASS ' : 'FAIL ') + k); };
(async () => {
  const b = await chromium.launch(); const errs = [], hosts = new Set();
  async function open(vp, init) {
    const ctx = await b.newContext({ viewport: vp || { width: 390, height: 844 } }); const p = await ctx.newPage();
    p.on('pageerror', (e) => errs.push('pageerror ' + e.message));
    p.on('console', (m) => { if (['error', 'warning'].includes(m.type()) && !/\/auth\/session/.test((m.location() || {}).url || '')) errs.push(m.text()); });
    p.on('request', (r) => { try { hosts.add(new URL(r.url()).host); } catch (e) { /* data: urls */ } });
    if (init) await p.addInitScript(init);
    await p.goto(BASE); p.ctx = ctx; return p;
  }
  const h1 = async (p) => (await p.textContent('h1')).replace('Required', '').trim();
  const ls = (p) => p.evaluate(() => { const o = {}; for (let i = 0; i < localStorage.length; i++) o[localStorage.key(i)] = localStorage.getItem(localStorage.key(i)); return o; });

  // ---- the intro and the way in
  let p = await open();
  const intro = await p.innerText('#app');
  out('intro: says there is a demo first, and still gives the number of questions', /There are 18 questions\. First you try a short demo/.test(intro));
  out('intro: the button says it starts with the demo, and there is no five-card quick look any more', (await p.locator('button:has-text("Start with the demo")').count()) === 1 && (await p.locator('button:has-text("quick look")').count()) === 0);
  await p.click('button:has-text("Start with the demo")'); await p.waitForURL('**/demo/'); await p.waitForSelector('.tabs');
  out('Start goes to the demo page', /\/demo\/$/.test(p.url()));
  const bar = p.locator('.demo-only');
  out('the demo shows a pinned bar with "Continue to the questions"', (await bar.count()) === 1 && (await bar.locator('button:has-text("Continue to the questions")').count()) === 1 && /made-up numbers/.test(await bar.innerText()));

  // ---- it is the real dashboard, on sample data, and cannot touch real data
  const tabs = (await p.locator('.tabs .tab').allTextContents()).map((t) => t.trim());
  out('the real tabs are there (Home, Forecast, Plan, Ideas, Activity) and Settings is not', JSON.stringify(tabs) === JSON.stringify(['Home', 'Forecast', 'Plan', 'Ideas', 'Activity']));
  out('no "Use my numbers", "How it works", Install or backup tools are offered', (await p.locator('button:has-text("Use my numbers"), button:has-text("Use my own numbers"), button:has-text("How it works")').count()) === 0);
  out('Home shows the sample dashboard', /safe to spend/i.test(await p.innerText('#app')) && /\$\d/.test(await p.innerText('#app')));
  for (const t of ['Forecast', 'Plan', 'Ideas', 'Activity', 'Home']) { await p.click('.tab:has-text("' + t + '")'); await p.waitForTimeout(150); }
  out('every tab opens and the pinned bar stays', (await bar.count()) === 1);
  out('nothing is written to this browser by the demo (not even after clicking around)', Object.keys(await ls(p)).length === 0);
  await p.click('.tab:has-text("Ideas")'); await p.click('.brand-btn'); await p.waitForTimeout(150);   // the logo is a Home button inside the demo
  out('the logo leads to the demo Home, not out of it', /\/demo\/$/.test(p.url()) && (await p.getAttribute('.tab.on', 'aria-current')) === 'page' && /Home/.test(await p.textContent('.tab.on')));
  await p.click('.tab:has-text("Ideas")'); await p.waitForTimeout(150);
  out('Ideas has no button that would lead to the missing Settings tab', (await p.locator('button:has-text("Update my balance"), button:has-text("Update balance")').count()) === 0);
  await p.click('.tab:has-text("Home")');

  // ---- a demo that fails to load leaves a way on (its own expected load errors are not counted below)
  { const n = errs.length, f = await open(); await f.route('**/demo/app/js/app.js', (r) => r.abort()); await f.goto(BASE + 'demo/'); await f.waitForTimeout(500);
    out('if the demo cannot start, the page still offers "Continue to the questions"', (await f.locator('#app a:has-text("Continue to the questions")').count()) === 1);
    await f.click('#app a'); await f.waitForSelector('.progress'); out('...and it leads to question 1', /1 of 18/.test(await f.innerText('.progress'))); await f.ctx.close(); errs.length = n; }

  // ---- tampered data can not leak in: the demo never reads the app's saved data
  const q = await open(null, "try { localStorage.setItem('fd.v1', '{\"v\":1,\"mode\":\"real\",\"onboarded\":true,\"transactions\":[{\"note\":\"SECRET-REAL-ROW\"}]}'); } catch (e) {}");
  await q.goto(BASE + 'demo/'); await q.waitForSelector('.tabs'); await q.click('.tab:has-text("Activity")'); await q.waitForTimeout(200);
  out('saved app data in the same browser is neither shown nor changed by the demo', !/SECRET-REAL-ROW/.test(await q.innerText('#app')) && /SECRET-REAL-ROW/.test((await ls(q))['fd.v1'] || ''));
  await q.ctx.close();

  // ---- Continue: back to the questions at question 1, and it is remembered
  await p.click('button:has-text("Continue to the questions")'); await p.waitForSelector('.progress');
  out('Continue returns to the survey at question 1 of 18', /1 of 18/.test(await p.innerText('.progress')) && p.url() === BASE);
  out('the ?demo=done address is tidied away', !/demo=done/.test(p.url()));
  out('the demo is remembered in its own key, apart from the answers', (await ls(p))['fs-survey-v1-demo'] === '1');
  await p.reload(); await p.waitForSelector('.progress');
  out('a reload stays on the questions', /of 18/.test(await p.innerText('.progress')));
  await p.click('.nav .ghost'); await p.waitForTimeout(400);
  out('back from question 1 shows the intro, and now it just says Start (the demo was seen)', (await p.locator('button:has-text("Start")').count()) === 1 && (await p.locator('button:has-text("Start with the demo")').count()) === 0);
  await p.click('button:has-text("Start")'); await p.waitForSelector('.progress');
  out('...and Start goes straight to the questions', p.url() === BASE && /1 of 18/.test(await p.innerText('.progress')));
  await p.ctx.close();

  // ---- someone who hand-types the return address, or has the flag but no answers: harmless
  p = await open(); await p.goto(BASE + '?demo=done'); await p.waitForSelector('.progress');
  out('opening /?demo=done directly just starts the questions', /1 of 18/.test(await p.innerText('.progress')));
  await p.ctx.close();

  // ---- a person who is part-way through is not sent to the demo
  p = await open(null, "try { localStorage.setItem('fs-survey-v1', JSON.stringify({ v: 1, t: Date.now(), rid: 'abcd1234abcd1234', started: false, qid: 'q2', seed: 1, answers: { q1: { safe: 5 } } })); } catch (e) {}");
  out('with saved answers the button is "Continue where I left off", not the demo', (await p.locator('button:has-text("Continue where I left off")').count()) === 1);
  await p.ctx.close();

  // ---- phone fit and the pinned bar, at every phone width and on a wide screen
  for (const w of [320, 360, 390, 430, 1000]) {
    const r = await open({ width: w, height: 800 }); await r.goto(BASE + 'demo/'); await r.waitForSelector('.tabs');
    for (const t of ['Home', 'Forecast', 'Plan', 'Ideas', 'Activity']) {
      await r.click('.tab:has-text("' + t + '")'); await r.waitForTimeout(120);
      const m = await r.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
      out(w + 'px ' + t + ': nothing wider than the screen', m.sw <= m.cw);
    }
    await r.evaluate(() => window.scrollTo(0, 400)); await r.waitForTimeout(100);
    const top = await r.evaluate(() => Math.round(document.querySelector('.demo-only').getBoundingClientRect().top));
    out(w + 'px: the Continue bar stays pinned to the top while scrolling', top === 0);
    if (w >= 720) { const t2 = await r.evaluate(() => { const bar = document.querySelector('.demo-only').getBoundingClientRect(), tabs = document.querySelector('.tabs').getBoundingClientRect(); return [Math.round(bar.bottom), Math.round(tabs.top)]; }); out(w + 'px: the tab bar sticks just under the Continue bar', Math.abs(t2[0] - t2[1]) <= 1); }
    await r.ctx.close();
  }

  // ---- the demo only talks to its own site
  out('the demo and the survey only ever contacted this site', [...hosts].every((x) => x === 'localhost:8771'));
  out('no console errors, CSP or Trusted Types violations', errs.length === 0); if (errs.length) console.log(errs);
  await b.close(); console.log(failed ? failed + ' FAILED' : 'ALL PASSED'); process.exit(failed ? 1 : 0);
})();
