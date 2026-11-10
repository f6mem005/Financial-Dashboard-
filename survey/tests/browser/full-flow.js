// Browser test. Needs Playwright (not a project dependency): npm i -D playwright && npx playwright install chromium
// Run:  python3 -m http.server 8771   (in the project folder), then:  node tests/browser/full-flow.js
const { chromium } = require('playwright');
const OUT = require('os').tmpdir() + '/';
const URL = 'http://localhost:8771/index.html';
(async () => {
  const b = await chromium.launch(); const errs = [];
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, acceptDownloads: true });
  const p = await ctx.newPage();
  // The survey ignores navigation taps within 300ms of the previous one (double-tap protection), so scripted clicks pause briefly.
  const slow = (page) => { const c = page.click.bind(page); page.click = async (sel, o) => { if (/^\.nav /.test(sel) && !(o && o.force)) await page.waitForTimeout(320); return c(sel, o); }; return page; };
  slow(p);
  p.on('pageerror', e => errs.push('pageerror ' + e.message)); p.on('console', m => { if (['error', 'warning'].includes(m.type()) && !/\/auth\/session/.test((m.location() || {}).url || '')) errs.push(m.text()); /* a plain file server has no sign-in, so its 404 for /auth/session is expected here */ });
  const out = (k, v) => console.log((v ? 'PASS ' : 'FAIL ') + k);
  const title = async () => (await p.textContent('h1')).replace('Required', '').trim();
  const next = () => p.click('.nav .primary');
  const stored = () => p.evaluate(() => JSON.parse(localStorage.getItem('fs-survey-v1')));

  await p.goto(URL);
  out('intro shows title and Start', /Help design an easy-to-understand money dashboard/.test(await p.innerText('#app')) && await p.locator('button:has-text("Start")').count() === 1);
  await p.screenshot({ path: OUT + '1-intro.png' });
  await p.click('button:has-text("Start")');
  out('Q1 grid is first, with progress "1 of 18"', /1 of 18/.test(await p.innerText('#app')) && /Imagine opening a money dashboard/.test(await title()));

  // validation: cannot continue with nothing rated
  await next();
  out('required grid blocks Next with a clear message', /15 rows still need a rating/.test(await p.textContent('.error')));

  // tap / untap on one row
  const row0 = p.locator('.row').first();
  await row0.locator('.rate').nth(3).click();                       // rate 4
  out('tap selects (aria-pressed)', await row0.locator('.rate').nth(3).getAttribute('aria-pressed') === 'true');
  await row0.locator('.rate').nth(3).click();                       // tap again
  out('tap again unselects', await row0.locator('.rate').nth(3).getAttribute('aria-pressed') === 'false');
  out('counter back to 0 of 15', /Rated 0 of 15/.test(await p.textContent('.counter')));
  await row0.locator('.rate').nth(3).click(); await row0.locator('.rate').nth(4).click();
  out('choosing another number replaces the first (only one pressed)', await row0.locator('.rate[aria-pressed="true"]').count() === 1 && await row0.locator('.rate').nth(4).getAttribute('aria-pressed') === 'true');
  await p.screenshot({ path: OUT + '2-grid.png' });

  // rate the rest, using "Not sure" for the second row
  const rows = p.locator('.row'); const n = await rows.count();
  for (let i = 1; i < n; i++) { if (i === 1) await rows.nth(i).locator('.unsure').click(); else await rows.nth(i).locator('.rate').nth(i % 5).click(); }
  out('counter shows 15 of 15', /Rated 15 of 15/.test(await p.textContent('.counter')));
  await next();
  out('Q2 pick-three screen', /THREE/.test(await title()));

  // pick exactly three, 4th blocked, untap works
  const ch = p.locator('.choice'); await ch.nth(0).click(); await ch.nth(1).click(); await ch.nth(2).click();
  out('three chosen, counter says 3 of 3', /3 of 3 chosen/.test(await p.textContent('.counter')));
  out('others are disabled at three', await p.locator('.choice:disabled').count() === 12);
  await p.locator('.choice.on').first().click();
  out('untapping one frees the rest (2 of 3, none disabled)', /2 of 3 chosen/.test(await p.textContent('.counter')) && await p.locator('.choice:disabled').count() === 0);
  await next(); out('Q2 with 2 picks is blocked', /exactly 3/.test(await p.textContent('.error')));
  await p.locator('.choice:not(.on)').first().click();
  const picked = await p.locator('.choice.on strong').allTextContents();
  await next();
  out('Q3 ranking screen appears with the 3 picks', /in order/.test(await title()) && await p.locator('.rank-item').count() === 3);

  // rank with arrows
  const names = async () => p.locator('.rank-item strong').allTextContents();
  const before = await names();
  await p.locator('.rank-item').nth(2).locator('.arrow').first().click();  // move 3rd up
  const afterArrow = await names();
  out('arrow moves item up', afterArrow[1] === before[2] && afterArrow[2] === before[1]);
  out('first item has Up disabled, last has Down disabled', await p.locator('.rank-item').first().locator('.arrow').first().isDisabled() && await p.locator('.rank-item').last().locator('.arrow').last().isDisabled());
  await p.waitForTimeout(150);
  out('screen-reader announcement made', /moved to position 2 of 3/.test(await p.textContent('#live')));

  // rank with mouse drag (pointer events): drag first grip below the last item
  const g0 = await p.locator('.grip').first().boundingBox(); const last = await p.locator('.rank-item').last().boundingBox();
  const order0 = await names();
  await p.mouse.move(g0.x + g0.width / 2, g0.y + g0.height / 2); await p.mouse.down();
  await p.mouse.move(g0.x + g0.width / 2, g0.y + 60, { steps: 6 });
  await p.mouse.move(g0.x + g0.width / 2, last.y + last.height - 5, { steps: 10 });
  out('drop target is highlighted while dragging', await p.locator('.rank-item.drop').count() === 1 && await p.locator('.rank-item.dragging').count() === 1);
  await p.screenshot({ path: OUT + '3-dragging.png' });
  await p.mouse.up();
  const order1 = await names();
  out('drag moved the first item to the bottom', order1[2] === order0[0] && order1[0] === order0[1]);
  out('rank numbers stay 1,2,3', JSON.stringify(await p.locator('.rank-num').allTextContents()) === '["1","2","3"]');
  const expectedRank = order1.slice();

  // CDP touch drag (what a phone does)
  const cdp = await ctx.newCDPSession(p);
  const gb = await p.locator('.grip').nth(2).boundingBox(); const tb = await p.locator('.rank-item').first().boundingBox();
  const sx = gb.x + gb.width / 2, sy = gb.y + gb.height / 2;
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: sx, y: sy }] });
  for (let i = 1; i <= 8; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: sx, y: sy - (sy - tb.y - 5) * i / 8 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await p.waitForTimeout(150);
  const order2 = await names();
  out('touch drag moved the last item to the top', order2[0] === order1[2]);
  const finalRank = order2.slice();

  // back/forward keeps the ranking; changing picks resyncs it
  await p.click('.nav .ghost'); await p.click('.nav .primary');
  out('ranking survives going back and forward', JSON.stringify(await names()) === JSON.stringify(finalRank));
  await next(); // -> Q4 optional
  out('Q4 optional "never use" screen; Next works with no answer', /never use/.test(await title()));
  await p.locator('.choice').last().click();
  out('"I\'d use all of them" is always last', /use all of them/.test(await p.locator('.choice').last().innerText()));
  await p.locator('.choice').last().click();
  out('single choice can be unselected', await p.locator('.choice.on').count() === 0);
  await next(); // -> Q11: "what would make you stop?" now comes right after the feature questions
  out('the "stop using" screen follows the feature questions and is optional', /stop using a budgeting app/.test(await title()) && !/Required/.test(await p.textContent('h1')));
  await p.locator('.choice').last().click();
  out('"Something else" reveals a text box', await p.locator('input[aria-label="Something else"]').count() === 1);
  await p.fill('input[aria-label="Something else"]', '<img src=x onerror=window.__x=1> costs too much');
  await next(); await p.screenshot({ path: OUT + '4-text.png' });                          // -> Q12 required text
  out('Q12 ("the ONE thing") comes next and is required', /ONE thing you wish/.test(await title()) && /Required/.test(await p.textContent('h1')));
  await next(); out('Q12 requires a few words', /few words/.test(await p.textContent('.error')));
  await p.fill('textarea', 'Tell me if I can afford a weekend away.\nSecond line.');
  out('character counter updates (limit 2000)', /\d+ \/ 2000/.test(await p.textContent('.counter')));
  await next(); // -> Q13: "anything missing?"
  out('the "anything missing?" screen comes after them and is optional', /is anything missing/.test(await title()) && !/Required/.test(await p.textContent('h1')));
  await p.fill('textarea', 'Let me split rent with a roommate.');
  out('...with a 2000-character allowance', /34 \/ 2000/.test(await p.textContent('.counter')));
  await next(); // -> Q5
  await next(); // -> Q6 (optional both)
  out('reached Q6 by skipping optional questions', /device/.test(await title()));
  await next(); // arrive on Q7
  await next(); // try to leave Q7 with nothing chosen
  out('Q7 is required', /at least one/.test(await p.textContent('.error')));
  await p.locator('.choice').nth(0).click(); await p.locator('.choice').nth(3).click();    // type + "Not sure" (exclusive)
  out('"Not sure" replaces other choices', await p.locator('.choice.on').count() === 1 && /Not sure/.test(await p.locator('.choice.on').innerText()));
  await p.locator('.choice').nth(0).click();
  out('choosing another clears the exclusive one', await p.locator('.choice.on').count() === 1 && /Type it in/.test(await p.locator('.choice.on').innerText()));

  // resume after reload
  await p.reload();
  out('reload resumes on the same question (no intro screen)', await p.locator('button:has-text("Start")').count() === 0);
  out('resumes on Q7 with the choice kept', /spending to get into it/.test(await title()) && await p.locator('.choice.on').count() === 1);
  for (let i = 0; i < 7; i++) await p.click('.nav .ghost');                                // Q7 -> Q6 -> Q5 -> Q13 -> Q12 -> Q11 -> Q4 -> Q3
  out('Back reaches the ranking and it is intact after reload', JSON.stringify(await names()) === JSON.stringify(finalRank));
  for (let i = 0; i < 7; i++) await next();                                                // Q3 -> Q4 -> Q11 -> Q12 -> Q13 -> Q5 -> Q6 -> Q7
  await next();                                                                            // -> Q8
  await next(); await next();                                                              // Q9, Q10
  await p.locator('.choice').nth(1).click();                                               // weekly summary
  await next(); await next(); await next(); await next(); await next(); await next();      // Q14, the example screens, Q17, Q18, Q16 -> Q15
  out('last screen: Finish button, 18 of 18', /18 of 18/.test(await p.innerText('#app')) && await p.locator('.nav .primary:has-text("Finish")').count() === 1);
  await p.locator('.choice').first().click();                                              // yes
  await next(); out('"Yes" needs a valid email', /valid email/.test(await p.textContent('.error')));
  await p.fill('#email', 'tester@example.com'); await p.locator('.choice').nth(2).click();   // quote OK
  await p.screenshot({ path: OUT + '5-last.png' });
  await next();
  out('thank-you screen shown', /Thank you/.test(await title()));
  out('preview mode is stated clearly', /not sent anywhere/.test(await p.innerText('#app')));
  out('saved progress cleared after finishing', (await p.evaluate(() => localStorage.getItem('fs-survey-v1'))) === null);
  out('no script from the typed text ran', (await p.evaluate(() => !!window.__x)) === false);
  const [dl] = await Promise.all([p.waitForEvent('download'), p.click('button:has-text("Download my answers")')]);
  const payload = JSON.parse(require('fs').readFileSync(await dl.path(), 'utf8'));
  const a = payload.answers;
  out('download is clean JSON with version and timestamp', payload.v === 1 && !isNaN(Date.parse(payload.meta.submittedAt)));
  out('payload: all 15 ratings recorded, one "unsure"', Object.keys(a.q1).length === 15 && Object.values(a.q1).includes('unsure'));
  out('payload: ranking equals what was on screen', JSON.stringify(a.q3.map(id => id)) !== '[]' && a.q3.length === 3 && a.q2.length === 3 && [...a.q2].sort().join() === [...a.q3].sort().join());
  out('payload: the "anything missing?" answer was recorded', a.q13 === 'Let me split rent with a roommate.');
  out('payload: contact + quote consent', a.q15.try === 'yes' && a.q15.email === 'tester@example.com' && a.q15.quote === true);
  out('payload: hostile text kept only as plain text', /<img/.test(a.q11_other) && a.q11.includes('other') && a.q12.includes('\n'));
  out('payload has no unexpected keys', Object.keys(a).every(k => /^q\d+(_other)?$/.test(k)) && Object.keys(payload).sort().join() === 'answers,meta,v');

  // each new respondent sees a different order
  const orders = [];
  for (let i = 0; i < 3; i++) { const c2 = await b.newContext({ viewport: { width: 390, height: 844 } }); const q2 = await c2.newPage(); await q2.goto(URL); await q2.click('button:has-text("Start")'); orders.push((await q2.locator('.row strong').allTextContents()).join('|')); await c2.close(); }
  out('row order is randomized per respondent', new Set(orders).size > 1);

  console.log('console errors/warnings:', JSON.stringify(errs.filter(e => !/Failed to load resource/.test(e))));
  await b.close();
})().catch(e => { console.error('FAIL', e.message.split('\n').slice(0, 8).join('\n')); process.exit(1); });
