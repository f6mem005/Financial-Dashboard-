// Browser test: the network side of finishing the survey. Needs Playwright (not a project dependency).
// Run:  python3 -m http.server 8771   (in the project folder), then:  node tests/browser/send.js
const { chromium } = require('playwright');
const URL = 'http://localhost:8771/index.html', KEY = 'fs-survey-v1';
(async () => {
  const b = await chromium.launch(); const errs = [];
  const out = (k, v) => console.log((v ? 'PASS ' : 'FAIL ') + k);
  const full = () => { const o = {}; ['safe','where','leaks','bills','forecast','whatif','alerts','goals','debt','subs','yearly','lowmonth','terms','shared','invest'].forEach((id, i) => { o[id] = (i % 5) + 1; }); return o; };
  async function open(contact, behave) {
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 } }); const p = await ctx.newPage(); const posts = [], others = [];
    p.on('pageerror', e => errs.push('pageerror ' + e.message)); p.on('console', m => { if (['error', 'warning'].includes(m.type()) && !/Failed to load resource/.test(m.text())) errs.push(m.text()); });
    await ctx.route('**/*', async (route) => {
      const r = route.request();
      if (r.method() === 'POST') { posts.push({ ct: r.headers()['content-type'], referer: r.headers()['referer'], body: new globalThis.URLSearchParams(r.postData()) }); return route.fulfill(behave ? behave(posts.length) : { status: 200, contentType: 'text/html', body: 'ok' }); }
      others.push(r.url()); return route.continue();
    });
    await p.goto(URL);
    await p.evaluate(([KEY, full, contact]) => localStorage.setItem(KEY, JSON.stringify({ v: 1, t: Date.now(), started: true, qid: 'q15', seed: 3, rid: 'feedfacefeedface0123',
      answers: { q1: full, q2: ['safe', 'bills', 'goals'], q3: ['bills', 'safe', 'goals'], q7: ['type'], q12: 'show me my safe number', q15: contact } })), [KEY, full(), contact]);
    await p.reload();
    return { ctx, p, posts, others };
  }
  const useNetwork = (p) => p.evaluate(() => { SV.config.send = SV.config.netlifySend; });

  // 1. opened over plain http (like a local test): preview mode, nothing is posted
  let t = await open({ try: 'yes', email: 'me@example.com', quote: true });
  out('over http the survey stays in preview mode (no send hook)', await t.p.evaluate(() => typeof SV.config.send) === 'undefined');
  await t.p.click('.nav .primary'); await t.p.waitForSelector('text=Thank you');
  out('preview finish posts nothing', t.posts.length === 0 && /Preview mode/.test(await t.p.innerText('#app')));
  out('page only ever requested its own static files', t.others.every(u => /^http:\/\/localhost:8771\/(index\.html|css\/survey\.css|js\/[a-z]+\.js)?$/.test(u)));
  await t.ctx.close();

  // 2. real send: two separate posts, answers anonymous, email on its own
  t = await open({ try: 'yes', email: 'me@example.com', quote: true }); await useNetwork(t.p);
  await t.p.click('.nav .primary'); await t.p.waitForSelector('text=Thank you');
  out('two posts were made (answers, then email)', t.posts.length === 2);
  out('posts are URL-encoded forms', t.posts.every(x => /application\/x-www-form-urlencoded/.test(x.ct)));
  const [main, contact] = t.posts.map(x => x.body);
  out('every post carries a referrer to this same site (a post with none is hidden as spam by the form service)', t.posts.length === 2 && t.posts.every((q) => /^http:\/\/localhost:8771\//.test(q.referer || '')));
  out('answers post: right form, response id, flat fields', main.get('form-name') === 'survey' && main.get('response_id') === 'feedfacefeedface0123' && main.get('q2') === 'safe,bills,goals' && main.get('q3') === 'bills,safe,goals' && main.get('q1_safe') === '1');
  out('answers post has no email anywhere', !t.posts[0].body.toString().includes('example.com'));
  out('answers post keeps the "try early version" and quote consent flags', main.get('q15_try') === 'yes' && main.get('q15_quote') === 'yes');
  out('contact post: only the email, empty honeypot, no response id', contact.get('form-name') === 'survey-contact' && contact.get('email') === 'me@example.com' && contact.get('bot-field') === '' && contact.get('response_id') === null);
  out('thank-you screen has no "preview" note after a real send', !/Preview mode/.test(await t.p.innerText('#app')));
  await t.ctx.close();

  // 3. no email -> one post
  t = await open({ try: 'no' }); await useNetwork(t.p);
  await t.p.click('.nav .primary'); await t.p.waitForSelector('text=Thank you');
  out('"No, thanks" sends only the answers post', t.posts.length === 1 && t.posts[0].body.get('form-name') === 'survey' && !t.posts[0].body.toString().includes('@'));
  await t.ctx.close();

  // 4. the server says no (e.g. form not registered): error shown, button back, nothing marked as sent, retry works with the same id
  let failFirst = true;
  t = await open({ try: 'no' }, () => { if (failFirst) { failFirst = false; return { status: 404, body: 'nope' }; } return { status: 200, body: 'ok' }; }); await useNetwork(t.p);
  await t.p.click('.nav .primary'); await t.p.waitForSelector('text=did not send');
  out('a 404 is shown as a failure, not a thank-you', await t.p.locator('.nav .primary').isEnabled() && await t.p.locator('h1:has-text("Thank you")').count() === 0);
  await t.p.waitForTimeout(400);                                   // a person needs a moment to read the message (taps within 0.3s are ignored)
  await t.p.click('.nav .primary'); await t.p.waitForSelector('text=Thank you');
  out('retry succeeds and re-sends with the SAME response id', t.posts.length === 2 && t.posts[0].body.get('response_id') === t.posts[1].body.get('response_id'));
  await t.ctx.close();

  // 5. answers saved but the email post fails: say so plainly (nobody should believe they signed up), lock Back, offer to finish without the email
  t = await open({ try: 'yes', email: 'me@example.com' }, (n) => (n === 2 ? { status: 500, body: 'x' } : { status: 200, body: 'ok' })); await useNetwork(t.p);
  await t.p.click('.nav .primary'); await t.p.waitForSelector('text=answers were saved, but we could not save your email');
  out('a failed email post is reported, not shown as a success', await t.p.locator('h1:has-text("Thank you")').count() === 0 && t.posts.length === 2 && t.posts[0].body.get('form-name') === 'survey' && t.posts[1].body.get('form-name') === 'survey-contact');
  out('"Finish without my email" is offered', await t.p.locator('button.skip-email').count() === 1);
  out('consent choices are frozen once the answers arrived (Yes, No and quote)', await t.p.locator('.choice:disabled').count() === 3);
  await t.p.waitForTimeout(400);   // taps within 0.3 s of the last one are ignored on purpose (double-tap protection)
  await t.p.click('.nav .ghost:has-text("Back")');
  out('Back is locked once the answers arrived, with a message', /already saved/.test(await t.p.textContent('.error')) && /q15/.test(await t.p.evaluate(() => JSON.parse(localStorage.getItem('fs-survey-v1')).qid)));
  await t.p.waitForTimeout(400);
  await t.p.click('.nav .primary'); await t.p.waitForSelector('text=Thank you');
  out('retry re-sends ONLY the email, never the answers again', t.posts.length === 3 && t.posts[2].body.get('form-name') === 'survey-contact');
  await t.ctx.close();

  // 5b. nothing can be edited while a send is running, so a late change can never be silently dropped
  t = await open({ try: 'yes', email: 'me@example.com' }, () => ({ status: 200, body: 'ok' })); await useNetwork(t.p);
  await t.p.evaluate(() => { const real = SV.config.send; SV.config.send = (pl, sig) => new Promise((res, rej) => setTimeout(() => real(pl, sig).then(res, rej), 800)); });
  await t.p.click('.nav .primary'); await t.p.waitForTimeout(200);
  out('while sending, choices, email and Back are disabled', await t.p.locator('.choice:not(:disabled)').count() === 0 && await t.p.locator('input#email').isDisabled() && await t.p.locator('.nav .ghost').isDisabled());
  await t.p.waitForSelector('text=Thank you');
  out('what was sent is what the person saw (email arrived once)', t.posts.length === 2 && t.posts[1].body.get('email') === 'me@example.com');
  await t.ctx.close();

  // 6. same failure, but the person chooses to finish without the email: nothing more is sent, and no email is kept
  t = await open({ try: 'yes', email: 'me@example.com' }, (n) => (n === 2 ? { status: 500, body: 'x' } : { status: 200, body: 'ok' })); await useNetwork(t.p);
  await t.p.click('.nav .primary'); await t.p.waitForSelector('button.skip-email');
  await t.p.click('button.skip-email'); await t.p.waitForSelector('text=Thank you');
  out('finishing without the email sends nothing more', t.posts.length === 2 && !(await t.p.evaluate((K) => localStorage.getItem(K), KEY)));
  await t.ctx.close();

  console.log('console errors/warnings:', JSON.stringify(errs));
  await b.close();
})().catch(e => { console.error('FAIL', e.message.split('\n').slice(0, 8).join('\n')); process.exit(1); });
