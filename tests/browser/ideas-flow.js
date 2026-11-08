/* Browser test for: How it works (first screen), Ideas tab, growth illustration, duplicates, check-in, backup and restore.
   Needs Playwright (not a dependency of this project) and the app served on a local port:
     python3 -m http.server 8912        (from the project folder)
     node tests/browser/ideas-flow.js    (BASE_URL=http://localhost:8912/index.html to change the address) */
'use strict';
const { chromium } = require('playwright');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const URL = process.env.BASE_URL || 'http://localhost:8912/index.html';
let failed = 0;
const out = (k, v) => { if (!v) failed++; console.log((v ? 'PASS ' : 'FAIL ') + k); };

(async () => {
  const b = await chromium.launch(); const errs = [];
  const ctx = await b.newContext({ viewport: { width: 390, height: 900 }, acceptDownloads: true });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errs.push('pageerror ' + e.message));
  p.on('console', (m) => { if (['error', 'warning'].includes(m.type()) && !/\/auth\/session/.test((m.location() || {}).url || '')) errs.push(m.text()); /* a plain file server has no sign-in, so its 404 for /auth/session is expected here */ });
  p.on('dialog', (d) => d.accept());
  const txt = () => p.innerText('#app');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fs-test-'));
  const stored = () => p.evaluate(() => JSON.parse(localStorage.getItem('fd.v1')));
  const tab = (name) => p.click('.tab:has-text("' + name + '")');
  async function save(dl, name) { const f = path.join(tmp, name); await dl.saveAs(f); return f; }

  /* ---------- first screen ---------- */
  await p.goto(URL);
  out('first screen is How it works: five steps, no tab bar', (await p.locator('ol.how li').count()) === 5 && (await p.locator('.tabs').count()) === 0 && /How it works/.test(await txt()));
  out('first screen keeps Set up and Demo buttons and the not-advice note', (await p.locator('button:has-text("Get started")').count()) === 1 && (await p.locator('button:has-text("Look at a demo first")').count()) === 1 && /not financial advice/i.test(await txt()));
  out('restore option is on the first screen', (await p.locator('summary:has-text("Restore from a backup")').count()) === 1);

  // landing page first, Start leads to the questions (also for someone who left setup half done)
  out('the Start button is visible without scrolling (phone height)', await p.evaluate(() => { const b = [...document.querySelectorAll('button')].find((x) => x.textContent === 'Get started'); return b.getBoundingClientRect().bottom < innerHeight; }));
  out('banner says Finance Sense, with the logo', (await p.textContent('.landing-hero .brand-name')) === 'Finance Sense' && (await p.locator('.landing-hero svg.logo').count()) === 1);
  out('the intro says the app makes managing your money clearer and easier, and no longer talks about people who have never budgeted', /makes managing your money clearer and easier/.test(await p.textContent('.landing-hero .landing-intro')) && !/never budgeted/.test(await p.textContent('.landing-hero .landing-intro')));
  out('an intro explains what the app is for', /simple money dashboard/.test(await p.textContent('.landing-hero .landing-intro')) && /safe to spend until payday/.test(await p.textContent('.landing-hero .landing-intro')));
  for (let i = 0; i < 6 && !(await p.evaluate(() => document.activeElement && document.activeElement.classList.contains('landing-link'))); i++) await p.keyboard.press('Tab');
  out('the keyboard focus ring on the banner links is white (visible on the blue)', await p.evaluate(() => { const e = document.activeElement; return !!e && e.classList.contains('landing-link') && getComputedStyle(e).outlineColor === 'rgb(255, 255, 255)'; }));
  out('a focused control is never left under the pinned bar (scroll padding)', await p.evaluate(() => parseFloat(getComputedStyle(document.documentElement).scrollPaddingBottom) >= 100));
  out('exactly ONE start button on the page, pinned so it is always in reach', (await p.locator('button:has-text("Get started"), button:has-text("Continue setup")').count()) === 1 && (await p.locator('.cta-bar button').count()) === 1);
  out('benefit list and steps are shown', (await p.locator('ul.benefits li').count()) === 4 && (await p.locator('ol.how li').count()) === 5);
  for (const w of [320, 390, 1000]) { await p.setViewportSize({ width: w, height: 700 }); out('no sideways scrolling on the landing page at ' + w + 'px', await p.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)); }
  await p.setViewportSize({ width: 390, height: 900 });
  await p.click('button:has-text("Get started")');
  out('Get started takes a new visitor to question 1', /1 of 13/.test(await txt()) && /How often do you get paid/.test(await txt()));
  await p.click('button:has-text("Every 2 weeks")');
  await p.reload();
  out('someone with setup half done still lands on How it works first', /How it works/.test(await txt()) && (await p.locator('button:has-text("Continue setup")').count()) === 1 && (await p.locator('summary:has-text("Restore from a backup")').count()) === 1 && !/1 of 13/.test(await txt()) && /earlier answers are saved/.test(await txt()));
  await p.click('button:has-text("Continue setup")');
  out('Continue setup goes to the questions with the saved answer kept', /1 of 13/.test(await txt()) && (await p.locator('.option.on:has-text("Every 2 weeks")').count()) === 1);
  await p.reload(); await p.click('button:has-text("Start over with a blank setup")');
  out('Start over gives a blank first question', /1 of 13/.test(await txt()) && (await p.locator('.option.on').count()) === 0);
  await p.evaluate(() => localStorage.clear());
  // unreadable saved data + restoring an unfinished backup: straight to the questions, no stale "delete unreadable data" notice
  await p.evaluate(() => localStorage.setItem('fd.v1', '{not json'));
  await p.reload();
  out('unreadable data shows its notice on the landing page', /couldn.t read your saved data/.test(await txt()));
  out('the unreadable-data notice sits above the banner, not buried below it', await p.evaluate(() => { const n = document.querySelector('.landing-alert'), h = document.querySelector('.landing-hero'); return !!n && !!h && (n.compareDocumentPosition(h) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0; }));
  const half = await p.evaluate(async () => { const s = FD.store.defaultState(); s.mode = 'real'; s.answers = { payFreq: 'weekly' }; return (await FD.backup.make(s, '')).text; });
  await p.click('summary:has-text("Restore from a backup")');
  await p.setInputFiles('input[aria-label="Choose a Finance Sense backup file"]', { name: 'half.json', mimeType: 'application/json', buffer: Buffer.from(half) });
  await p.waitForSelector('button:has-text("Replace this device"), button:has-text("Use this backup")');
  await p.click('button:has-text("Replace this device"), button:has-text("Use this backup")');
  out('restoring an unfinished backup goes straight to the questions with its answer', /1 of 13/.test(await txt()) && (await p.locator('.option.on:has-text("Every week")').count()) === 1 && !/couldn.t read your saved data/.test(await txt()));
  await p.evaluate(() => localStorage.clear()); await p.reload();

  /* ---------- demo: home teaser and Ideas ---------- */
  await p.click('button:has-text("Look at a demo first")');
  out('six tabs including Ideas', (await p.locator('.tab').count()) === 6 && (await p.locator('.tab:has-text("Ideas")').count()) === 1);
  out('Home shows the Ideas teaser', /Ideas for you/.test(await txt()) && /set aside about \$\d+ a month/.test(await txt()));
  await p.click('button:has-text("See all ideas")');
  let t = await txt();
  out('Ideas has all sections', ['Things that look different', 'How much could you set aside?', 'What could it grow into?', 'Ways to spend less', 'Possible duplicates', 'When something changes'].every((s) => t.includes(s)));
  out('set-aside shows comfortable and stretch amounts and a numbered order', /Comfortable/.test(t) && /Stretch/.test(t) && (await p.locator('ol.steps li').count()) >= 2);
  out('projection table has four generic fund types and no product names', (await p.locator('table.compare tbody tr').count()) === 4 && !/vanguard|fidelity|schwab|spy\b|vti|s&p/i.test(t));
  out('projection and disclaimer wording present', /not a prediction and not advice/.test(t) && /today.s money/.test(t));

  await p.fill('input[aria-label="Amount to put in each month"]', '500');
  out('changing the monthly amount updates the result', /Putting in \$500 a month/.test(await txt()));
  await p.selectOption('select[aria-label="How long"]', '30');
  out('changing the length updates the result', /for 30 years/.test(await txt()));
  await p.click('.chip:has-text("Broad stock index fund")');
  out('picking another fund updates the chart label', (await p.locator('.chart-wrap').last().getAttribute('aria-label')).includes('Broad stock index fund'));
  await p.locator('.chart-wrap').last().focus(); await p.keyboard.press('ArrowRight'); await p.keyboard.press('ArrowRight');
  out('chart is readable by keyboard (year, middle, cautious, hopeful)', /Year 2: about \$[\d,]+ \(cautious \$[\d,]+, hopeful \$[\d,]+\)/.test(await p.locator('.tip').last().innerText()));
  await p.click('summary:has-text("Change the growth assumptions")');
  await p.fill('input[aria-label="Broad stock index fund middle yearly growth percent"]', '2');
  out('editing an assumed rate changes the table', /Assumed yearly growth after inflation and fees: [\d.-]+% cautious, 2% middle/.test(await txt()));

  // small phones: nothing may push the page sideways
  await p.setViewportSize({ width: 360, height: 800 });
  out('no sideways scrolling on the Ideas tab at 360px', await p.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth));
  await p.setViewportSize({ width: 390, height: 900 });
  // keyboard focus survives choosing another fund
  await p.locator('button.chip:has-text("Savings account")').focus(); await p.keyboard.press('Enter');
  out('keyboard focus stays on the fund chip after choosing it', await p.evaluate(() => document.activeElement && document.activeElement.textContent === 'Savings account'));

  /* ---------- duplicates and check-in (demo changes are in memory only) ---------- */
  out('double charge and same-kind services are flagged', /Two \$14\.99 charges for .Pizza night./.test(t) && /2 music services/.test(t));
  const before = (await txt()).match(/Possible duplicates/) ? await p.locator('li.idea').count() : 0;
  await p.click('button:has-text("Remove the second charge")');
  out('removing the second charge clears that item', !/Two \$14\.99 charges/.test(await txt()) && (await p.locator('li.idea').count()) === before - 1);
  await p.click('button[aria-label^="Not a duplicate"]');
  out('"Not a duplicate" hides the item', !/music services/.test(await txt()));
  out('check-in lists what looks different with apply and dismiss', /Gym now costs something different/.test(t) && (await p.locator('button:has-text("Not now")').count()) >= 1);
  const nn = await p.locator('button:has-text("Not now")').count();
  await p.locator('li.idea:has-text("Gym now costs") button:has-text("Not now")').click();
  out('"Not now" removes that suggestion', (await p.locator('button:has-text("Not now")').count()) === nn - 1 && !/Gym now costs something different/.test(await txt()));

  /* ---------- real data: apply, export, wipe, restore ---------- */
  await p.evaluate(() => { const s = FD.sample.build(FD.util.today()); s.mode = 'real'; s.onboarded = true; localStorage.setItem('fd.v1', JSON.stringify(s)); });
  await p.reload();
  await tab('Ideas');
  await p.click('button:has-text("Update the amount")');
  let st = await stored();
  const balanceNudge = /Update your balance/.test(await txt());
  out('the stale-balance nudge is offered first when it applies', balanceNudge && (await p.locator('li.idea strong').first().innerText()) === 'Update your balance');
  out('applying a changed bill updates the answer and saves it', st.answers.bills.some((x) => x.amount === 45));
  out('and the suggestion is gone afterwards', !/Gym now costs something different/.test(await txt()));
  await p.click('button:has-text("Not now") >> nth=0');
  st = await stored();
  out('dismissing is remembered in saved data', st.settings.dismissed.length === 1);
  const txCount = st.transactions.length;

  // confirming the balance clears the nudge (until it goes stale again)
  await tab('Settings');
  await p.fill('input[aria-label="Current balance"]', '5000'); await p.click('button:has-text("Save")');
  await tab('Ideas');
  out('confirming the balance clears the "update your balance" nudge', !/Update your balance/.test(await txt()) && (await stored()).settings.balanceChecked !== null);
  // the savings amount can be cleared again
  await tab('Settings');
  await p.fill('input[aria-label="Savings I already have"]', ''); await p.click('button:has-text("Save")');
  out('savings can be cleared back to "not given"', (await stored()).settings.savingsBalance === null);
  // editing an answer from Ideas returns to Ideas
  await tab('Ideas'); await p.click('button:has-text("My pay changed")'); await p.click('button:has-text("Save")');
  out('changing an answer from Ideas brings you back to Ideas', /Ideas/.test(await p.textContent('h1')));

  await tab('Settings');
  const plainDl = p.waitForEvent('download'); await p.click('button:has-text("Download backup")');
  const plain = await save(await plainDl, 'plain.json');
  let obj = JSON.parse(fs.readFileSync(plain, 'utf8'));
  out('plain backup is the documented format', obj.format === 'finance-sense-backup' && obj.version === 1 && obj.state.transactions.length === txCount);
  await p.fill('input[aria-label="Passphrase (optional)"]', 'short');
  await p.click('button:has-text("Download locked backup")');
  out('a too-short passphrase is refused with a message', /at least 8 characters/.test(await p.locator('p[role=status]').last().innerText()));
  await p.fill('input[aria-label="Passphrase (optional)"]', 'correct horse battery');
  const lockedDl = p.waitForEvent('download'); await p.click('button:has-text("Download locked backup")');
  const locked = await save(await lockedDl, 'locked.json');
  const lockedText = fs.readFileSync(locked, 'utf8');
  out('locked backup is encrypted (no readable names or amounts)', JSON.parse(lockedText).format === 'finance-sense-backup-locked' && !/Pizza night|transactions|Credit card/.test(lockedText));
  out('the passphrase box is cleared after use', (await p.inputValue('input[aria-label="Passphrase (optional)"]')) === '');

  // restoring while data exists: the warning appears, declining the confirm changes nothing
  p.removeAllListeners('dialog'); p.on('dialog', (d) => d.dismiss());
  await p.setInputFiles('input[aria-label="Choose a Finance Sense backup file"]', plain);
  await p.waitForSelector('button:has-text("Replace this device")');
  out('restore shows a summary and a replace warning', /transactions/.test(await txt()) && /replace the numbers saved on this device/.test(await txt()));
  await p.click('button:has-text("Replace this device")');
  out('declining the confirm leaves things as they were', (await stored()).transactions.length === txCount);
  p.removeAllListeners('dialog'); p.on('dialog', (d) => d.accept());

  // a wrong file is refused in plain words
  const junk = path.join(tmp, 'junk.json'); fs.writeFileSync(junk, 'hello');
  await p.setInputFiles('input[aria-label="Choose a Finance Sense backup file"]', junk);
  await p.waitForSelector('p[role=alert]');
  out('a file that is not a backup is refused', /not a Finance Sense backup/.test(await p.locator('p[role=alert]').innerText()));
  const evil = path.join(tmp, 'evil.json'); fs.writeFileSync(evil, JSON.stringify({ format: 'finance-sense-backup', version: 1, state: { v: 1, mode: 'real', onboarded: true, answers: { bills: [{ id: '__proto__', name: '<img src=x onerror=alert(1)>', amount: 'abc', due: 99 }] }, settings: { openingBalance: 'NaN', dismissed: ['x'] }, transactions: [{ id: 't1', date: 'bad', type: 'expense', amount: -5 }], subs: 'no' } }));
  await p.setInputFiles('input[aria-label="Choose a Finance Sense backup file"]', evil);
  await p.waitForSelector('button:has-text("Replace this device")');
  await p.click('button:has-text("Replace this device")');
  st = await stored();
  out('a hostile file is cleaned field by field before it is used', st.transactions.length === 0 && Array.isArray(st.subs) && st.settings.dismissed.length === 0 && st.answers.bills.every((x) => x.id !== '__proto__' && !(x.amount > 1e6)) && ({}).polluted === undefined);

  // wipe, then restore on the first screen (the "new device" path), plain then locked
  await tab('Settings'); await p.click('button:has-text("Delete all my data")');
  out('after deleting, the first screen is back', /How it works/.test(await txt()) && (await p.locator('.tabs').count()) === 0);
  await p.click('summary:has-text("Restore from a backup")');
  await p.setInputFiles('input[aria-label="Choose a Finance Sense backup file"]', plain);
  await p.waitForSelector('button:has-text("Use this backup")');
  await p.click('button:has-text("Use this backup")');
  st = await stored();
  out('plain backup restores on a clean device', st.mode === 'real' && st.onboarded && st.transactions.length === txCount && (await p.locator('.tabs').count()) === 1);

  await tab('Settings'); await p.click('button:has-text("Delete all my data")');
  await p.click('summary:has-text("Restore from a backup")');
  await p.setInputFiles('input[aria-label="Choose a Finance Sense backup file"]', locked);
  await p.waitForSelector('input[aria-label="Passphrase for this backup"]');
  out('a locked file asks for the passphrase', /This backup is locked/.test(await txt()));
  await p.fill('input[aria-label="Passphrase for this backup"]', 'wrong passphrase!');
  await p.click('button:has-text("Unlock")');
  await p.waitForSelector('p[role=alert]');
  out('a wrong passphrase imports nothing and says so', /Wrong passphrase/.test(await p.locator('p[role=alert]').innerText()) && !(await p.evaluate(() => localStorage.getItem('fd.v1'))));
  await p.waitForSelector('input[aria-label="Passphrase for this backup"]');
  await p.fill('input[aria-label="Passphrase for this backup"]', 'correct horse battery');
  await p.click('button:has-text("Unlock")');
  await p.waitForSelector('button:has-text("Use this backup")');
  await p.click('button:has-text("Use this backup")');
  st = await stored();
  out('the right passphrase restores everything', st.transactions.length === txCount && st.settings.dismissed.length === 1);

  /* ---------- How it works from Settings ---------- */
  await tab('Activity');
  out('a How it works button is in the top bar of every screen', (await p.locator('header.topbar button:has-text("How it works")').count()) === 1);
  await p.click('header.topbar button:has-text("How it works")');
  out('How it works opens from the top bar and has a Back button', /How Finance Sense works/.test(await txt()) && (await p.locator('button:has-text("Back")').count()) === 1 && (await p.locator('.tabs').count()) === 0);
  await p.click('button:has-text("Back")');
  out('Back returns to the screen you were on', /Activity/.test(await p.textContent('h1')));
  await tab('Settings');
  out('Settings no longer carries a How it works card', (await p.locator('main button:has-text("How it works")').count()) === 0);

  // "Add as a bill" moves the matching past charges out of everyday spending, and only those
  await p.evaluate(() => {
    const U = FD.util, s = FD.sample.build(U.today()); s.mode = 'real'; s.onboarded = true; s.transactions = []; let n = 0;
    for (let m = 3; m >= 0; m--) { const d = new Date(U.today().getFullYear(), U.today().getMonth() - m, 3); if (d <= U.today()) s.transactions.push({ id: 'la' + (++n), date: U.iso(d), type: 'expense', amount: 12.99, category: 'fun', note: 'Language app' }); }
    s.transactions.push({ id: 'other1', date: U.iso(U.addDays(U.today(), -4)), type: 'expense', amount: 8.5, category: 'fun', note: 'Other place' });
    localStorage.setItem('fd.v1', JSON.stringify(s));
  });
  await p.reload(); await tab('Ideas');
  await p.click('li.idea:has-text("Looks like a monthly bill") button:has-text("Add as a bill")');
  st = await stored();
  const nb = st.answers.bills.filter((x) => x.name === 'Language app')[0];
  out('"Add as a bill" creates the bill', !!nb && nb.amount === 12.99);
  out('and re-tags only its matching charges (no double counting)', st.transactions.filter((t) => t.billId === nb.id && t.category === 'billpay').length >= 3 && st.transactions.filter((t) => t.id === 'other1')[0].category === 'fun' && !st.transactions.filter((t) => t.id === 'other1')[0].billId);
  out('and the suggestion does not come back', !/Looks like a monthly bill/.test(await txt()));

  // someone who skipped everything gets no invented set-aside number
  await p.evaluate(() => { const s = FD.store.defaultState(); s.mode = 'real'; s.onboarded = true; localStorage.setItem('fd.v1', JSON.stringify(s)); });
  await p.reload(); await tab('Ideas');
  t = await txt();
  out('with no pay given, Ideas asks for it instead of guessing', /We won.t guess your pay/.test(t) && !/Comfortable/.test(t) && (await p.locator('button:has-text("Add my pay")').count()) === 1);
  await tab('Home');
  out('and Home shows no Ideas teaser', !/Ideas for you/.test(await txt()));

  out('no console errors, warnings or page errors (includes CSP violations)', errs.length === 0);
  if (errs.length) console.log(errs);
  fs.rmSync(tmp, { recursive: true, force: true });
  await b.close();
  console.log(failed ? failed + ' FAILED' : 'ALL PASSED');
  process.exit(failed ? 1 : 0);
})();
