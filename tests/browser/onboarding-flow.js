/* Browser test: the money questions cannot be skipped; each needs real amounts (0 is fine) or an explicit None / N/A.
   Needs Playwright and the app served on 8912 (python3 -m http.server 8912):  node tests/browser/onboarding-flow.js */
'use strict';
const { chromium } = require('playwright');
const URL = process.env.BASE_URL || 'http://localhost:8912/index.html';
let failed = 0; const out = (k, v) => { if (!v) failed++; console.log((v ? 'PASS ' : 'FAIL ') + k); };
(async () => {
  const b = await chromium.launch(); const errs = [];
  const p = await (await b.newContext({ viewport: { width: 390, height: 800 } })).newPage();
  p.on('pageerror', (e) => errs.push('pageerror ' + e.message)); p.on('console', (m) => { if (['error', 'warning'].includes(m.type()) && !/\/auth\/session/.test((m.location() || {}).url || '')) errs.push(m.text()); /* a plain file server has no sign-in, so its 404 for /auth/session is expected here */ }); p.on('dialog', (d) => d.accept());
  const title = async () => (await p.textContent('h1')).trim(), skip = () => p.locator('.nav-row button:has-text("Skip")').count();
  const next = async () => { await p.click('.nav-row .primary'); await p.waitForTimeout(260); };
  const err = async () => (await p.textContent('#q-error')).trim();
  await p.goto(URL); await p.click('button:has-text("Get started")');

  // ---- how you are paid
  out('"How often do you get paid?" has no Skip', /How often do you get paid/.test(await title()) && (await skip()) === 0);
  await next(); out('Next with nothing chosen says why', /Choose one/.test(await err()) && /How often/.test(await title()));
  await p.click('.option:has-text("Every 2 weeks")'); await p.waitForTimeout(400);
  // ---- pay
  out('pay: no Skip, and an explicit "$0 / N/A" choice', /per paycheck/.test(await title()) && (await skip()) === 0 && (await p.locator('.chip:has-text("$0 / N/A")').count()) === 1);
  // ---- leaving the questions: banner, Home, Save and exit, and picking up at the same question
  out('every question screen carries the Finance Sense banner', /Finance Sense/.test(await p.innerText('header.site-banner')) && (await p.locator('header.site-banner').count()) === 1);
  await p.click('header.site-banner button:has-text("Home")'); await p.waitForTimeout(250);
  out('Home goes back to the landing page', /Know where your money is going/.test(await title()) && (await p.locator('button:has-text("Continue setup")').count()) === 1);
  await p.click('button:has-text("Continue setup")'); await p.waitForTimeout(300);
  out('Continue setup returns to the same question', /per paycheck/.test(await title()));
  await p.click('button:has-text("Save and exit")'); await p.waitForTimeout(250);
  out('Save and exit goes to the landing page and says it saved', /Know where your money is going/.test(await title()) && /Saved/.test(await p.innerText('#toast')));
  await p.reload(); await p.click('button:has-text("Continue setup")'); await p.waitForTimeout(300);
  out('...and still picks up at that question after the page is reloaded', /per paycheck/.test(await title()));
  await next(); out('pay: Next with nothing entered is refused with a plain message', /Enter your pay/.test(await err()));
  await p.click('.chip:has-text("$0 / N/A")');
  out('pay: choosing $0 / N/A hides the amount boxes and says no pay will be counted', (await p.locator('input[aria-label="Paycheck amount"]').count()) === 0 && /No pay will be counted/.test(await p.innerText('main')));
  await p.click('.chip:has-text("$0 / N/A")'); await p.fill('input[aria-label="Paycheck amount"]', '0'); await next();
  out('pay: typing 0 is also an answer and moves on', /other money coming in/.test(await title()));
  await p.click('.nav-row button:has-text("Back")'); await p.waitForTimeout(300);
  out('pay: a typed 0 comes back as the explicit $0 / N/A choice', /No pay will be counted/.test(await p.innerText('main')));
  await next();
  // ---- other income
  out('other income: no Skip; Next with nothing chosen is refused', /other money coming in/.test(await title()) && (await skip()) === 0);
  await next(); out('...and says to pick something or choose None / N/A', /None \/ N\/A/.test(await err()));
  await p.click('.chip:has-text("None / N/A ($0)")'); await next();
  // ---- bills: a chosen bill needs an amount
  out('bills: no Skip', /fixed bills/.test(await title()) && (await skip()) === 0);
  await next(); out('bills: nothing chosen is refused', /None \/ N\/A/.test(await err()));
  await p.click('.chip:has-text("Rent")'); await next();
  out('bills: a bill with no amount is refused by name', /Enter an amount for Rent/.test(await err()));
  out('bills: the box no longer pretends a typical amount will be used', (await p.getAttribute('input[aria-label="Per month"]', 'placeholder')) === '0' && !/used if blank/.test(await p.innerText('main')));
  await p.fill('input[aria-label="Per month"]', '900'); await next();
  // ---- everyday spending: 0 is an answer
  out('spending: no Skip', /rest of your money/.test(await title()) && (await skip()) === 0);
  await p.click('.chip:has-text("Groceries")'); await next(); out('spending: a blank amount is refused', /Enter an amount for Groceries/.test(await err()));
  await p.fill('input[aria-label="Per month"]', '0'); await next();
  // ---- yearly costs, debts
  out('yearly costs: no Skip', /once-or-twice-a-year/.test(await title()) && (await skip()) === 0); await p.click('.chip:has-text("None / N/A ($0)")'); await next();
  out('debts: no Skip', /What do you owe/.test(await title()) && (await skip()) === 0);
  await p.click('.chip:has-text("Credit card")'); await next(); out('debts: a debt with no balance is refused', /what you owe and the smallest payment/.test(await err()));
  await p.fill('input[aria-label="Balance"]', '1000'); await p.fill('input[aria-label="Minimum payment"]', '35'); await next(); out('debts: a debt with no rate is refused', /yearly interest rate/.test(await err()));
  await p.click('.chip:has-text("I don’t know")'); await next();
  // ---- the rest can still be skipped
  out('"What you want" questions can still be skipped', /Which sounds most like you/.test(await title()) && (await skip()) === 1);
  for (let i = 0; i < 6 && !/Your dashboard is ready/.test(await title()); i++) { if (await skip()) await p.click('.nav-row button:has-text("Skip")'); await p.waitForTimeout(260); }
  out('the summary appears, with the banner and a Save and exit', /Your dashboard is ready/.test(await title()) && (await p.locator('header.site-banner').count()) === 1 && (await p.locator('button:has-text("Save and exit")').count()) === 1);
  { const t = await p.innerText('main'); out('no "typical amount" was filled in for pay, bills or spending', !/Paychecks of|Typical spending|Next payday in a week/.test(t)); if (/Paychecks of|Typical spending|Next payday in a week/.test(t)) console.log(t); }
  await p.click('button:has-text("Open my dashboard")'); await p.waitForSelector('.tabs');
  await p.click('.tab:has-text("Ideas")');
  out('with no pay, Ideas asks for it instead of guessing', /We won.t guess your pay/.test(await p.innerText('#app')));
  // ---- editing later
  await p.click('.tab:has-text("Settings")'); await p.click('button[aria-label^="Edit answer: Which fixed bills"]');
  out('the edit screen has the banner but no Home or Save and exit (Cancel and Save do that job)', (await p.locator('header.site-banner').count()) === 1 && (await p.locator('header.site-banner button').count()) === 0 && (await p.locator('button:has-text("Save and exit")').count()) === 0);
  out('editing a money answer later has no "Use defaults" either', (await p.locator('button:has-text("Use defaults")').count()) === 0 && (await p.locator('button:has-text("Save")').count()) === 1);
  await p.click('.chip:has-text("Rent")');
  out('...emptying the list is the same as choosing None / N/A', (await p.getAttribute('.chip:has-text("None / N/A ($0)")', 'aria-pressed')) === 'true');
  await p.click('.chip:has-text("Rent")'); await p.click('button:has-text("Save")');
  out('...Save refuses a bill with no amount', /Enter an amount for Rent/.test(await err()) && (await p.locator('.tabs').count()) === 0);
  await p.click('.chip:has-text("None / N/A ($0)")'); await p.click('button:has-text("Save")'); await p.waitForSelector('.tabs');
  out('...and saves once it is a valid answer', /Settings/.test(await p.textContent('h1')));
  out('the dashboard also carries the banner', (await p.locator('header.site-banner').count()) === 1);
  await p.click('button[aria-label^="Edit answer: What should the home screen show"]');
  out('non-money questions still offer "Use defaults"', (await p.locator('button:has-text("Use defaults")').count()) === 1);
  out('no console errors', errs.length === 0); if (errs.length) console.log(errs);
  await b.close(); console.log(failed ? failed + ' FAILED' : 'ALL PASSED'); process.exit(failed ? 1 : 0);
})();
