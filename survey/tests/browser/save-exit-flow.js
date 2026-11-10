// Browser test: "Save and exit" on every question screen: it keeps the answers on this device, says so, sends nothing, resumes at the same
// question, refuses to pretend when the browser will not save, and sits clear of the pinned Back / Next bar.
// Run:  python3 -m http.server 8771 (in survey/), then:  node tests/browser/save-exit-flow.js
'use strict';
const { chromium } = require('playwright');
const URL = process.env.BASE_URL || 'http://localhost:8771/index.html';
let failed = 0; const out = (k, v) => { if (!v) failed++; console.log((v ? 'PASS ' : 'FAIL ') + k); };
(async () => {
  const b = await chromium.launch(); const errs = [], posts = [];
  async function open(vp, init) {
    const ctx = await b.newContext({ viewport: vp || { width: 390, height: 844 } }); const p = await ctx.newPage();
    await ctx.addInitScript("try { localStorage.setItem('fs-survey-v1-demo', '1'); } catch (e) {}");   // the demo has been seen: these start at question 1
    if (init) await ctx.addInitScript(init);
    p.on('pageerror', (e) => errs.push('pageerror ' + e.message));
    p.on('console', (m) => { if (['error', 'warning'].includes(m.type()) && !/\/auth\/session/.test((m.location() || {}).url || '')) errs.push(m.text()); });
    p.on('request', (r) => { if (r.method() === 'POST') posts.push(r.url()); });
    await p.goto(URL); p.ctx = ctx; return p;
  }
  const h1 = async (p) => (await p.textContent('h1')).replace('Required', '').trim();
  const stored = (p) => p.evaluate(() => localStorage.getItem('fs-survey-v1'));
  const exit = (p) => p.click('button:has-text("Save and exit")');

  // ---- with answers
  let p = await open(); await p.click('button:has-text("Start")'); await p.waitForSelector('.progress');
  const title1 = await h1(p);
  out('every question screen has a Save and exit button', (await p.locator('button:has-text("Save and exit")').count()) === 1);
  await p.locator('.row').first().locator('.rate').nth(3).click(); await p.waitForTimeout(100);
  await p.waitForTimeout(350); await exit(p); await p.waitForTimeout(300);
  const intro = await p.innerText('#app');
  out('it goes back to the first screen', /Help design an easy-to-understand money dashboard/.test(intro) && (await p.locator('.progress').count()) === 0);
  out('...and says the answers are saved on this device, for 7 days, and that nothing was sent yet', /answers are saved on this device/.test(intro) && /within 7 days/.test(intro) && /Nothing has been sent to us yet/.test(intro));
  out('...and tells them to tap Continue where I left off, which is the button that is there', (await p.locator('button:has-text("Continue where I left off")').count()) === 1);
  out('...announced to screen readers and shown in a status region', /saved/i.test(await p.textContent('#live').catch(() => '')) && (await p.locator('.saved-note[role="status"]').count()) === 1);
  out('...with keyboard focus on the heading', await p.evaluate(() => document.activeElement && document.activeElement.id === 'title'));
  out('the progress is in this browser, and nothing was posted anywhere', /"q1":\{"[a-z]+":4\}/.test((await stored(p)) || '') && posts.length === 0);
  await p.reload(); await p.waitForTimeout(200);
  out('the note is shown once: a reload does not repeat it', (await p.locator('.saved-note').count()) === 0);
  await p.click('button:has-text("Continue where I left off")'); await p.waitForSelector('.progress');
  out('Continue returns to the same question with the answer still there', (await h1(p)) === title1 && /Rated 1 of 15/.test(await p.innerText('.counter')));
  await p.ctx.close();

  // ---- with nothing answered yet
  p = await open(); await p.click('button:has-text("Start")'); await p.waitForSelector('.progress'); await p.waitForTimeout(350); await exit(p); await p.waitForTimeout(250);
  out('exiting before answering anything says the place is saved and offers Start', /place is saved on this device/.test(await p.innerText('#app')) && (await p.locator('button:has-text("Start")').count()) === 1 && (await p.locator('button:has-text("Continue where I left off")').count()) === 0);
  await p.click('button:has-text("Start")'); await p.waitForSelector('.progress');
  out('...and Start goes straight back to the questions', /1 of 18/.test(await p.innerText('.progress')));
  await p.ctx.close();

  // ---- a browser that will not save must not be told it did
  p = await open(null, "(() => { const s = Storage.prototype.setItem; Storage.prototype.setItem = function (k, v) { if (k === 'fs-survey-v1') throw new Error('blocked'); return s.call(this, k, v); }; })();");
  await p.click('button:has-text("Start")'); await p.waitForSelector('.progress'); await p.waitForTimeout(350); await exit(p); await p.waitForTimeout(250);
  out('when storage fails it stays on the question and says so, instead of claiming it saved', (await p.locator('.progress').count()) === 1 && /would not save your answers/.test(await p.textContent('.error')) && !/saved on this device/.test(await p.innerText('#app')));
  await p.ctx.close();

  // ---- phone fit: the button is never hidden under the pinned bar, at every phone width
  for (const w of [320, 360, 390, 430]) {
    p = await open({ width: w, height: 700 }); await p.click('button:has-text("Start")'); await p.waitForSelector('.progress');
    await p.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight)); await p.waitForTimeout(150);
    const m = await p.evaluate(() => { const e = document.querySelector('.exit-row .btn').getBoundingClientRect(), n = document.querySelector('.nav').getBoundingClientRect();
      return { exitBottom: Math.round(e.bottom), navTop: Math.round(n.top), h: Math.round(e.height), sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth, left: e.left, right: e.right }; });
    out(w + 'px: Save and exit is fully visible above the pinned bar, tall enough to tap, and nothing is wider than the screen', m.exitBottom <= m.navTop && m.h >= 40 && m.sw <= m.cw && m.left >= 0 && m.right <= m.cw);
    await p.ctx.close();
  }
  out('no console errors', errs.length === 0); if (errs.length) console.log(errs);
  await b.close(); console.log(failed ? failed + ' FAILED' : 'ALL PASSED'); process.exit(failed ? 1 : 0);
})();
