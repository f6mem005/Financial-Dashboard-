// Browser test. Needs Playwright (not a project dependency): npm i -D playwright && npx playwright install chromium
// Run:  python3 -m http.server 8771   (in the project folder), then:  node tests/browser/behaviours.js
const { chromium } = require('playwright');
const URL = 'http://localhost:8771/index.html';
(async () => {
  // The survey ignores navigation taps within 300ms of the previous one (double-tap protection), so scripted clicks pause briefly.
  const slow = (page) => { const c = page.click.bind(page); page.click = async (sel, o) => { if (/^\.nav /.test(sel) && !(o && o.force)) await page.waitForTimeout(320); return c(sel, o); }; return page; };
  const b = await chromium.launch(); const errs = [];
  const out = (k, v) => console.log((v ? 'PASS ' : 'FAIL ') + k);
  const mk = async (opts) => { const ctx = await b.newContext(Object.assign({ viewport: { width: 390, height: 844 } }, opts || {})); const p = await ctx.newPage(); slow(p);
    p.on('pageerror', e => errs.push('pageerror ' + e.message)); p.on('console', m => { if (['error', 'warning'].includes(m.type()) && !/\/auth\/session/.test((m.location() || {}).url || '')) errs.push(m.text()); /* a plain file server has no sign-in, so its 404 for /auth/session is expected here */ }); return { ctx, p }; };
  const KEY = 'fs-survey-v1';
  const full = () => { const o = {}; ['safe','where','leaks','bills','forecast','whatif','alerts','goals','debt','subs','yearly','lowmonth','terms','shared','invest'].forEach((id, i) => { o[id] = (i % 5) + 1; }); return o; };
  const seed = (p, over, tOffset) => p.evaluate(([KEY, over, tOffset, full]) => localStorage.setItem(KEY, JSON.stringify(Object.assign({ v: 1, t: Date.now() + tOffset, started: true, qid: 'q5', seed: 7, rid: 'abcdef0123456789abcdef01',
    answers: { q1: full, q2: ['safe', 'bills', 'goals'], q3: ['bills', 'safe', 'goals'], q7: ['type'], q12: 'hello there' } }, over))), [KEY, over || {}, tOffset || 0, full()]);
  const count = async (p) => /(\d+) of 16/.exec(await p.innerText('.progress-top'))[1];

  // ---- double-tap on Next must not skip a screen ----
  let { ctx, p } = await mk(); await p.goto(URL); await seed(p, {}); await p.reload();
  out('resumed on screen 8 (question 5 is now the 8th screen)', await count(p) === '8');
  await p.dblclick('.nav .primary');
  out('double-tap on Next moves only one screen (8 -> 9)', await count(p) === '9');
  await p.waitForTimeout(350);                      // let the navigation lock from the previous move expire
  await p.dblclick('.nav .ghost');
  out('double-tap on Back moves only one screen (9 -> 8)', await count(p) === '8');
  await ctx.close();

  // ---- double-submit: send called once; Finish disabled while sending; id included and stable ----
  ({ ctx, p } = await mk()); await p.goto(URL); await seed(p, { qid: 'q15' }); await p.reload();
  await p.evaluate(() => { window.__sends = []; SV.config.send = (payload) => new Promise((res) => { window.__sends.push(payload); setTimeout(res, 400); }); });
  out('last screen says Finish', await p.locator('.nav .primary:has-text("Finish")').count() === 1);
  await p.dblclick('.nav .primary'); await p.click('.nav .primary', { force: true, timeout: 500 }).catch(() => {});
  await p.waitForTimeout(100);
  out('button shows Sending... and is disabled', await p.locator('.nav .primary:has-text("Sending")').count() === 1 && await p.locator('.nav .primary').isDisabled());
  out('Back is ignored while sending', await (async () => { await p.click('.nav .ghost', { force: true }).catch(() => {}); return /16 of 16/.test(await p.innerText('.progress-top')); })());
  await p.waitForSelector('text=Thank you');
  const sends = await p.evaluate(() => window.__sends);
  out('send was called exactly once', sends.length === 1);
  out('payload has a stable response id and no extra top-level keys', sends[0].meta.id === 'abcdef0123456789abcdef01' && Object.keys(sends[0]).sort().join() === 'answers,meta,v');
  out('thank-you after a real send has no "preview" note', !/Preview mode/.test(await p.innerText('#app')));
  await ctx.close();

  // ---- failing send: error shown, button re-enabled, can retry; no crash if user navigated ----
  ({ ctx, p } = await mk()); await p.goto(URL); await seed(p, { qid: 'q15' }); await p.reload();
  await p.evaluate(() => { window.__n = 0; SV.config.send = () => { window.__n++; return Promise.reject(new Error('down')); }; });
  await p.click('.nav .primary'); await p.waitForSelector('text=did not send');
  out('failed send shows a message and re-enables Finish', await p.locator('.nav .primary').isEnabled() && /Finish/.test(await p.textContent('.nav .primary')));
  await p.click('.nav .primary'); await p.waitForTimeout(150);
  out('retry works (send called again)', await p.evaluate(() => window.__n) === 2);
  await ctx.close();

  // ---- Finish re-validates everything: tampered progress is sent back to the first unmet question ----
  ({ ctx, p } = await mk()); await p.goto(URL);
  await p.evaluate(([KEY]) => localStorage.setItem(KEY, JSON.stringify({ v: 1, t: Date.now(), started: true, qid: 'q15', seed: 1, answers: {} })), [KEY]); await p.reload();
  await p.evaluate(() => { window.__sends = 0; SV.config.send = () => { window.__sends++; return Promise.resolve(); }; });
  await p.click('.nav .primary');
  out('empty response is NOT sent; respondent returned to question 1', await p.evaluate(() => window.__sends) === 0 && /1 of 16/.test(await p.innerText('.progress-top')));
  out('and told what is missing', /rows still need a rating/.test(await p.textContent('.error')));
  await ctx.close();

  // ---- grid: blocked Next marks and focuses the first unrated row ----
  ({ ctx, p } = await mk()); await p.goto(URL); await p.click('button:has-text("Start")');
  await p.locator('.row').first().locator('.rate').nth(2).click();
  await p.click('.nav .primary');
  out('unrated rows are marked', await p.locator('.row.missing').count() === 14);
  out('focus moved to the first unrated row', await p.evaluate(() => document.activeElement.closest('.row') && document.activeElement.closest('.row').classList.contains('missing')));
  await p.locator('.row.missing').first().locator('.rate').nth(1).click();
  out('rating a row clears its marker', await p.locator('.row.missing').count() === 13);
  await ctx.close();

  // ---- email is dropped when "No" is chosen, in state AND in storage ----
  ({ ctx, p } = await mk()); await p.goto(URL); await seed(p, { qid: 'q15' }); await p.reload();
  await p.locator('.choice').first().click(); await p.fill('#email', 'me@example.com');
  out('email is saved while typing (needed to resume)', (await p.evaluate(([KEY]) => JSON.parse(localStorage.getItem(KEY)).answers.q15.email, [KEY])) === 'me@example.com');
  await p.locator('.choice').nth(1).click();                                                  // "No, thanks"
  out('choosing No removes the email from storage', (await p.evaluate(([KEY]) => JSON.stringify(JSON.parse(localStorage.getItem(KEY)).answers.q15), [KEY])) === '{"try":"no"}');
  await p.locator('.choice').first().click();
  out('choosing Yes again shows an empty email box', (await p.inputValue('#email')) === '');
  await ctx.close();

  // ---- progress older than 7 days is forgotten; a day-old one is kept ----
  ({ ctx, p } = await mk()); await p.goto(URL);
  await seed(p, { answers: { q15: { try: 'yes', email: 'old@example.com' } } }, -8 * 24 * 3600 * 1000); await p.reload();
  out('8-day-old progress is discarded (intro shown, storage emptied)', await p.locator('button:has-text("Start")').count() === 1 && (await p.evaluate(([KEY]) => localStorage.getItem(KEY), [KEY])) === null);
  await seed(p, {}, -24 * 3600 * 1000); await p.reload();
  out('1-day-old progress is kept', await count(p) === '8');
  await p.evaluate(([KEY]) => localStorage.setItem(KEY, JSON.stringify({ v: 1, started: true, qid: 'q5', seed: 7, answers: {} })), [KEY]); await p.reload();
  out('progress with no timestamp (old format) is discarded', await p.locator('button:has-text("Start")').count() === 1);
  await ctx.close();

  // ---- a second window must not resurrect an answer set that another window finished ----
  const ctxA = await b.newContext({ viewport: { width: 390, height: 844 } }); const A = await ctxA.newPage(); const B = await ctxA.newPage();
  A.on('pageerror', e => errs.push(e.message)); B.on('pageerror', e => errs.push(e.message));
  await A.goto(URL); await seed(A, { qid: 'q15' }); await A.reload(); await B.goto(URL);
  out('both windows open on the saved progress', /16 of 16/.test(await A.innerText('.progress-top')) && /16 of 16/.test(await B.innerText('.progress-top')));
  await A.click('.nav .primary'); await A.waitForSelector('text=Thank you');
  await B.waitForTimeout(250);
  out('the other window resets itself to the intro', await B.locator('button:has-text("Start")').count() === 1);
  out('and storage stays empty (nothing resurrected)', (await B.evaluate(([KEY]) => localStorage.getItem(KEY), [KEY])) === null);
  await ctxA.close();

  // ---- "Start over" needs a second tap ----
  ({ ctx, p } = await mk()); await p.goto(URL); await seed(p, { started: false }); await p.reload();
  out('intro offers Continue and Start over', await p.locator('button:has-text("Continue where I left off")').count() === 1);
  await p.click('button:has-text("Start over")');
  out('first tap only asks for confirmation (answers still saved)', /Tap again to erase/.test(await p.innerText('#app')) && (await p.evaluate(([KEY]) => !!JSON.parse(localStorage.getItem(KEY)).answers.q12, [KEY])));
  await p.waitForTimeout(700);                      // a deliberate second tap, not a double-tap
  await p.click('button:has-text("Tap again to erase")');
  out('second tap erases and starts at question 1', /1 of 16/.test(await p.innerText('.progress-top')) && (await p.evaluate(([KEY]) => JSON.stringify(JSON.parse(localStorage.getItem(KEY)).answers), [KEY])) === '{}');
  await ctx.close();

  // ---- hostile text ends up clean in the downloaded file ----
  ({ ctx, p } = await mk({ acceptDownloads: true })); await p.goto(URL); await seed(p, { qid: 'q12' }); await p.reload();
  const RLO = String.fromCharCode(0x202E), ZW = String.fromCharCode(0x200B);
  await p.fill('textarea', '=cmd|calc' + RLO + ZW + ' ok');
  for (let i = 0; i < 14 && (await p.locator('.nav .primary:has-text("Finish")').count()) === 0; i++) await p.click('.nav .primary');   // on through the remaining screens to the last one
  await p.click('.nav .primary'); await p.waitForSelector('text=Thank you');
  const [dl] = await Promise.all([p.waitForEvent('download'), p.click('button:has-text("Download my answers")')]);
  const payload = JSON.parse(require('fs').readFileSync(await dl.path(), 'utf8'));
  out('invisible/bidi characters are gone: only plain printable ASCII remains', /^[\x20-\x7e]+$/.test(payload.answers.q12) && payload.answers.q12.startsWith('=cmd|calc') && payload.answers.q12.endsWith('ok'));
  out('response id is in the file', /^[0-9a-f-]{16,40}$/.test(payload.meta.id));
  await ctx.close();


  // ---- two SEPARATE quick taps (not a browser double-click) must not skip a screen either ----
  ({ ctx, p } = await mk()); await p.goto(URL); await seed(p, {}); await p.reload();
  const pc = p.click.bind(p);                                    // bypass the test pause: this is the real, fast behaviour
  const raw = (sel) => p.locator(sel).click();
  await raw('.nav .primary'); await p.waitForTimeout(80); await raw('.nav .primary');
  out('two quick separate taps on Next move only one screen (8 -> 9)', await count(p) === '9');
  await p.waitForTimeout(400); await raw('.nav .primary');
  out('a deliberate tap after the pause moves on (9 -> 10)', await count(p) === '10');
  await ctx.close();

  // ---- Start over: a fast double-tap must NOT erase; a deliberate second tap does; arming expires ----
  ({ ctx, p } = await mk()); await p.goto(URL); await seed(p, { started: false }); await p.reload();
  await p.locator('button:has-text("Start over")').dblclick();
  out('double-tap on Start over only arms it (answers kept)', /Tap again to erase/.test(await p.innerText('#app')) && (await p.evaluate(([KEY]) => !!JSON.parse(localStorage.getItem(KEY)).answers.q12, [KEY])));
  await p.waitForTimeout(100); await p.locator('button:has-text("Tap again to erase")').click();
  out('a second tap 100ms later is still ignored', (await p.evaluate(([KEY]) => !!JSON.parse(localStorage.getItem(KEY)).answers.q12, [KEY])));
  await p.waitForTimeout(700); await p.locator('button:has-text("Tap again to erase")').click();
  out('a deliberate tap after 700ms erases', /1 of 16/.test(await p.innerText('.progress-top')));
  await ctx.close();
  ({ ctx, p } = await mk()); await p.clock.install(); await p.goto(URL); await seed(p, { started: false }); await p.reload();
  await p.locator('button:has-text("Start over")').click(); await p.clock.fastForward(6000);
  out('the "tap again" prompt disarms itself after 5 seconds', await p.locator('button:has-text("Start over")').count() === 1);
  await ctx.close();

  // ---- a send that succeeds AFTER the timeout message still completes; two sends share one id; no double thank-you ----
  ({ ctx, p } = await mk()); await p.clock.install(); await p.goto(URL); await seed(p, { qid: 'q15' }); await p.reload();
  await p.evaluate(() => { window.__calls = []; SV.config.send = (payload) => new Promise((res) => { window.__calls.push({ res, id: payload.meta.id }); }); });
  await p.locator('.nav .primary').click();
  await p.clock.fastForward(16000);
  out('after 15s the timeout message appears and Finish is usable again', /did not send/.test(await p.textContent('.error')) && await p.locator('.nav .primary').isEnabled());
  await p.locator('.nav .primary').click();
  out('retry sends again with the SAME response id', await p.evaluate(() => window.__calls.length) === 2 && await p.evaluate(() => window.__calls[0].id === window.__calls[1].id));
  await p.evaluate(() => window.__calls[0].res());               // the FIRST send finally succeeds
  await p.waitForSelector('text=Thank you');
  out('the late first success completes the survey', await p.locator('h1:has-text("Thank you")').count() === 1);
  await p.evaluate(() => window.__calls[1].res());               // the second one succeeds too
  await p.waitForTimeout(50);
  out('second success changes nothing (still one thank-you screen)', await p.locator('h1:has-text("Thank you")').count() === 1);
  await ctx.close();

  // ---- a send that throws synchronously is handled ----
  ({ ctx, p } = await mk()); await p.goto(URL); await seed(p, { qid: 'q15' }); await p.reload();
  await p.evaluate(() => { SV.config.send = () => { throw new Error('boom'); }; });
  await p.locator('.nav .primary').click(); await p.waitForSelector('text=did not send');
  out('a send that throws shows the error and keeps the answers', await p.locator('.nav .primary').isEnabled() && /16 of 16/.test(await p.innerText('.progress-top')));
  await ctx.close();

  // ---- a wall-clock jump backwards must not lock navigation ----
  ({ ctx, p } = await mk()); await p.clock.install(); await p.goto(URL); await seed(p, {}); await p.reload();
  await p.locator('.nav .primary').click(); await p.clock.fastForward(500);
  await p.clock.setSystemTime(Date.now() - 3600 * 1000);                                   // device clock moves back one hour
  await p.waitForTimeout(50); await p.locator('.nav .primary').click();
  out('navigation still works after the clock jumps back an hour (9 -> 10)', await count(p) === '10');
  await ctx.close();

  // ---- an old response's pending send must not touch a NEW response ----
  ({ ctx, p } = await mk()); await p.clock.install(); await p.goto(URL); await seed(p, { qid: 'q15' }); await p.reload();
  await p.evaluate(() => { window.__calls = []; SV.config.send = () => new Promise((res) => { window.__calls.push(res); }); });
  await p.locator('.nav .primary').click(); await p.clock.fastForward(16000);               // first send times out
  await p.locator('.nav .primary').click();                                                // retry (second send, own timer)
  await p.evaluate(() => window.__calls[0]());                                             // first finally succeeds
  await p.waitForSelector('text=Thank you');
  await p.locator('button:has-text("Start a new response")').click(); await p.locator('button:has-text("Start")').click();
  await p.clock.fastForward(20000);                                                        // the old second timer would fire here
  out('stale timer from the old response leaves the new screen alone', /Next/.test(await p.textContent('.nav .primary')) && (await p.textContent('.error')) === '');
  await ctx.close();

  // ---- branding: banner on every screen, who sent it on the first screen, nothing sideways on small phones ----
  for (const w of [320, 390]) {
    ({ ctx, p } = await mk({ viewport: { width: w, height: 700 } })); await p.goto(URL);
    const t = await p.innerText('#app');
    out('first screen at ' + w + 'px: banner says Finance Sense Questionnaire and who sent it', /Finance Sense/.test(await p.textContent('header.banner.hero .brand-name')) && /Questionnaire/i.test(await p.textContent('header.banner.hero .brand-tag')) && /Sent to you by\s*Manny M/.test(await p.textContent('header.banner.hero .sent')));
    out('first screen at ' + w + 'px: privacy section and a Start button that is on screen', await p.locator('section.privacy h2:has-text("Your privacy")').count() === 1 && await p.evaluate(() => { const b = document.querySelector('.nav .primary'); const r = b.getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight; }));
    out('first screen at ' + w + 'px: no sideways scrolling', await p.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth));
    await p.click('button:has-text("Start")'); await p.waitForSelector('.progress');
    out('question screens keep a slim banner (no sender line) and the question is still the only h1', await p.locator('header.banner:not(.hero) .brand-name').count() === 1 && await p.locator('.sent').count() === 0 && await p.locator('h1').count() === 1);
    await ctx.close();
  }
  console.log('console errors/warnings:', JSON.stringify(errs.filter(e => !/Failed to load resource/.test(e))));
  await b.close();
})().catch(e => { console.error('FAIL', e.message.split('\n').slice(0, 8).join('\n')); process.exit(1); });
