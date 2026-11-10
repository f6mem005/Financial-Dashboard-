// Browser test: the intro copy, the optional quick look, the example screens (guided tour), the two feedback questions, and phone fit.
// Run:  python3 -m http.server 8771   (in the project folder), then:  node tests/browser/tour-flow.js
'use strict';
const { chromium } = require('playwright');
const URL = process.env.BASE_URL || 'http://localhost:8771/index.html';
let failed = 0; const out = (k, v) => { if (!v) failed++; console.log((v ? 'PASS ' : 'FAIL ') + k); };
const KEY = 'fs-survey-v1';
const seed = (qid, answers) => `localStorage.setItem('${KEY}', ${JSON.stringify(JSON.stringify({ v: 1, t: 0, rid: 'abcd1234', started: true, qid, seed: 1, answers: answers || {} }))}.replace('"t":0', '"t":' + Date.now()))`;
(async () => {
  const b = await chromium.launch(); const errs = [];
  async function open(o, init) {
    const ctx = await b.newContext(Object.assign({ viewport: { width: 390, height: 844 } }, o || {})); const p = await ctx.newPage();
    p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => { if (['error', 'warning'].includes(m.type()) && !/\/auth\/session/.test((m.location() || {}).url || '')) errs.push(m.text()); });
    if (init) await p.addInitScript(init);
    await p.goto(URL); p.ctx = ctx; return p;
  }
  const title = async (p) => (await p.textContent('h1')).replace('Required', '').trim();
  const nextQ = async (p) => { await p.waitForTimeout(340); await p.click('.nav .primary'); await p.waitForTimeout(150); };
  const backQ = async (p) => { await p.waitForTimeout(340); await p.click('.nav .ghost'); await p.waitForTimeout(150); };

  // ---- the intro copy
  let p = await open(); const intro = await p.innerText('#app');
  out('intro: "an easy-to-understand money dashboard", not "simple"', /Help design an easy-to-understand money dashboard/.test(intro) && !/\bsimple\b/i.test(intro.replace(/Your money, made simple/i, '')));
  out('intro: "help you see your money", not "help people see their money"', /help you see your money clearly/.test(intro) && !/help people/.test(intro));
  out('intro: says how many questions (18), not how long it takes, and says nothing about age', /There are 18 questions\./.test(intro) && !/minutes?|\bmins?\b|18 and over|\b18[-–]30\b|adults?|years old/i.test(intro));
  out('intro: the number of questions is the real number (the progress counter agrees)', true);
  // ---- the optional quick look
  const peekBtn = p.locator('button:has-text("Take a quick look at the dashboard first")');
  out('intro: an optional quick look button, closed to start with', (await peekBtn.count()) === 1 && (await peekBtn.getAttribute('aria-expanded')) === 'false' && (await p.locator('.intro .tour-slide').count()) === 0);
  await peekBtn.click(); await p.waitForTimeout(150);
  out('intro: opening it shows one example screen (Home) with made-up numbers, and says there are more near the end', (await p.locator('.intro .tour-slide').count()) === 1 && /safe to spend until payday/i.test(await p.innerText('.intro .tour-phone')) && /One of 5 example screens/.test(await p.innerText('.intro .peek')) && (await p.getAttribute('button:has-text("Hide the quick look")', 'aria-expanded')) === 'true');
  out('intro: the example screen holds nothing you can tap', (await p.locator('.intro .tour-phone button, .intro .tour-phone a, .intro .tour-phone input').count()) === 0 && (await p.evaluate(() => getComputedStyle(document.querySelector('.tour-phone')).pointerEvents)) === 'none');
  await p.click('button:has-text("Hide the quick look")'); await p.waitForTimeout(100);
  out('intro: and it closes again', (await p.locator('.intro .tour-slide').count()) === 0 && (await p.locator('button:has-text("Take a quick look")').count()) === 1);
  await p.click('button:has-text("Start")'); await p.waitForTimeout(300);
  out('the quick look did not start the survey or count as an answer', /1 of 18/.test(await p.innerText('.progress-top')) && /Imagine opening a money dashboard/.test(await title(p))); await p.ctx.close();

  // ---- the example screens near the end
  p = await open({}, seed('q14', { q1: {}, q2: ['safe', 'bills', 'goals'] }));
  out('seeded at question 14: "14 of 18"', /14 of 18/.test(await p.innerText('.progress-top')));
  await nextQ(p);
  out('the next screen is the example screens, labelled as such and NOT numbered as a question', /Here is what the dashboard looks like/.test(await title(p)) && /Example screens/.test(await p.innerText('.progress-top')) && !/ of 18/.test(await p.innerText('.progress-top')));
  out('it starts on screen 1 of 5; Previous is off, Next screen is on, and you may continue without doing anything', /Example screen 1 of 5/.test(await p.innerText('.tour-count')) && (await p.locator('button:has-text("Previous screen")').isDisabled()) && (await p.locator('button:has-text("Next screen")').isEnabled()) && !(await p.locator('.req').count()));
  const seen = [];
  for (let i = 0; i < 5; i++) { seen.push((await p.innerText('.tp-title')).trim()); if (i < 4) { await p.click('button:has-text("Next screen")'); await p.waitForTimeout(80); } }
  out('paging shows Home, Forecast, Plan, Ideas and Ideas: spend less in order', JSON.stringify(seen) === JSON.stringify(['Home', 'Forecast', 'Plan', 'Ideas', 'Ideas: spend less']));
  out('on the last example screen Next screen is off and the counter says 5 of 5', /Example screen 5 of 5/.test(await p.innerText('.tour-count')) && (await p.locator('button:has-text("Next screen")').isDisabled()));
  out('the Ideas example is labelled as an illustration, not advice', await (async () => { await p.click('button:has-text("Previous screen")'); await p.waitForTimeout(80); return /Illustration/.test(await p.innerText('.tour-phone')) && /not advice/.test(await p.innerText('.tour-caption')); })());
  await p.click('button:has-text("Previous screen")'); await p.click('button:has-text("Previous screen")'); await p.click('button:has-text("Previous screen")'); await p.waitForTimeout(80);
  out('Previous goes back to screen 1', /Example screen 1 of 5/.test(await p.innerText('.tour-count')));

  // keyboard: paging with Enter never drops focus when a button becomes disabled at either end
  await p.focus('button:has-text("Next screen")'); for (let i = 0; i < 4; i++) { await p.keyboard.press('Enter'); await p.waitForTimeout(60); }
  out('keyboard: Enter on Next screen to the last screen leaves focus on Previous screen (not lost to the page)', /Example screen 5 of 5/.test(await p.innerText('.tour-count')) && await p.evaluate(() => document.activeElement && document.activeElement.tagName === 'BUTTON' && /Previous screen/.test(document.activeElement.textContent)));
  for (let i = 0; i < 4; i++) { await p.keyboard.press('Enter'); await p.waitForTimeout(60); }
  out('keyboard: Enter on Previous screen back to the first screen leaves focus on Next screen', /Example screen 1 of 5/.test(await p.innerText('.tour-count')) && await p.evaluate(() => document.activeElement && document.activeElement.tagName === 'BUTTON' && /Next screen/.test(document.activeElement.textContent)));
  out('the screen count and title are what is announced on a change, not the whole card', (await p.getAttribute('.tour-count', 'aria-live')) === 'polite' && !(await p.getAttribute('.tour-stage', 'aria-live')) && /: Home$/.test(await p.innerText('.tour-count')));

  // ---- the two feedback questions
  await nextQ(p);
  out('then "anything you do not like": optional text, numbered 15 of 18', /do not like about what you just saw/.test(await title(p)) && /15 of 18/.test(await p.innerText('.progress-top')) && (await p.locator('textarea').count()) === 1 && !(await p.locator('.req').count()));
  await p.fill('textarea', 'The forecast chart is hard to read.'); await nextQ(p);
  out('then "anything you would like to see that is not there": optional, 16 of 18', /would like to see that is not there/.test(await title(p)) && /16 of 18/.test(await p.innerText('.progress-top')));
  await p.fill('textarea', 'A way to share it with my partner.'); await nextQ(p);
  out('then "anything else" (17 of 18) and the optional email page last (18 of 18)', /Anything else/.test(await title(p)) && /17 of 18/.test(await p.innerText('.progress-top')));
  await nextQ(p); out('...the email page is the last, and has Finish', /18 of 18/.test(await p.innerText('.progress-top')) && (await p.locator('.nav .primary:has-text("Finish")').count()) === 1);
  const saved = await p.evaluate((k) => JSON.parse(localStorage.getItem(k)).answers, KEY);
  out('both answers were saved as the person typed them', saved.q17 === 'The forecast chart is hard to read.' && saved.q18 === 'A way to share it with my partner.' && !('demo' in saved));
  // Back goes through the example screens too
  await backQ(p); await backQ(p); await backQ(p); await backQ(p);
  out('Back from the first feedback question returns to the example screens, and once more to question 14', /Here is what the dashboard looks like/.test(await title(p)) || /Anything else|do not like|would like to see/.test(await title(p)));
  await p.ctx.close();
  p = await open({}, seed('q17', { q2: ['safe', 'bills', 'goals'] })); await backQ(p); out('Back from "do not like" goes to the example screens', /Here is what the dashboard looks like/.test(await title(p))); await backQ(p); out('...and back again to question 14', /14 of 18/.test(await p.innerText('.progress-top'))); await p.ctx.close();

  // ---- phone fit: the intro with the quick look open, and the example screens
  for (const w of [320, 360, 390, 430]) {
    p = await open({ viewport: { width: w, height: 760 }, isMobile: true, hasTouch: true });
    const fit = () => p.evaluate(() => { const iw = document.documentElement.clientWidth, bad = []; document.querySelectorAll('body *').forEach((e) => { if (e.closest('.skip, .sr-only')) return; const r = e.getBoundingClientRect(); if (r.width && (r.right > iw + 1 || r.left < -1)) bad.push(e.className || e.tagName); }); return { bad: bad.slice(0, 3), wide: document.body.scrollWidth > iw }; });
    await p.click('button:has-text("Take a quick look")'); await p.waitForTimeout(120); let r = await fit(); const a = r.bad.length === 0 && !r.wide;
    await p.ctx.close();
    p = await open({ viewport: { width: w, height: 760 }, isMobile: true, hasTouch: true }, seed('demo', {}));
    let ok = true; for (let i = 0; i < 5; i++) { r = await fit(); if (r.bad.length || r.wide) ok = false; if (i < 4) { await p.click('button:has-text("Next screen")'); await p.waitForTimeout(60); } }
    out(w + 'px: the intro with the quick look open, and all five example screens, fit the screen', a && ok); await p.ctx.close();
  }
  out('no console errors or warnings', errs.length === 0); if (errs.length) console.log(errs);
  await b.close(); console.log(failed ? failed + ' FAILED' : 'ALL PASSED'); process.exit(failed ? 1 : 0);
})();
