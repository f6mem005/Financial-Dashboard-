/* Browser test: leaving setup (Home, Save and exit, resume), what a Refresh keeps, and the checks that must survive a reload.
   Needs Playwright and the app served on 8912 (python3 -m http.server 8912):  node tests/browser/exit-flow.js */
'use strict';
const { chromium } = require('playwright');
const URL = process.env.BASE_URL || 'http://localhost:8912/index.html';
let failed = 0; const out = (k, v) => { if (!v) failed++; console.log((v ? 'PASS ' : 'FAIL ') + k); };
const seed = (state) => `localStorage.setItem('fd.v1', ${JSON.stringify(JSON.stringify(state))})`;
(async () => {
  const b = await chromium.launch();
  async function page(state) {
    const ctx = await b.newContext({ viewport: { width: 390, height: 800 } }); const p = await ctx.newPage(); const errs = [];
    p.on('pageerror', (e) => errs.push(e.message)); p.on('dialog', (d) => d.accept());
    if (state) await p.addInitScript(`if (!sessionStorage.getItem('seeded')) { ${seed(state)}; sessionStorage.setItem('seeded', '1'); }`);
    await p.goto(URL); p.errs = errs; return p;
  }
  const title = async (p) => (await p.textContent('h1')).trim();
  const next = async (p) => { await p.click('.nav-row .primary'); await p.waitForTimeout(260); };

  // ---- a blank, just-started setup is not "resuming"
  let p = await page();
  await p.click('button:has-text("Get started")'); await p.click('header.site-banner button:has-text("Home")'); await p.waitForTimeout(250);
  let t = await p.innerText('body');
  out('Home before answering anything shows "Get started", not "Continue setup" or "earlier answers"', (await p.locator('button:has-text("Get started")').count()) === 1 && !/Continue setup|earlier answers|Start over/.test(t));
  await p.click('button:has-text("Get started")'); await p.waitForTimeout(250);
  out('...and Get started opens the first question without a "replace saved data" prompt', /How often do you get paid/.test(await title(p)));

  // ---- Refresh from the update bar keeps what was typed
  await p.click('.option:has-text("Every 2 weeks")'); await p.waitForTimeout(400);
  await p.fill('input[aria-label="Paycheck amount"]', '500');
  await p.evaluate(() => window.FD.update.show('new'));
  out('the update bar offers Refresh without promising more than it keeps', /Refresh to get it/.test(await p.innerText('#update-bar')));
  await Promise.all([p.waitForNavigation(), p.click('#update-bar button:has-text("Refresh")')]);
  await p.click('button:has-text("Continue setup")'); await p.waitForTimeout(300);
  out('Refresh did not lose the pay that was typed, and resumes at that question', /per paycheck/.test(await title(p)) && (await p.inputValue('input[aria-label="Paycheck amount"]')) === '500');
  out('no script errors', p.errs.length === 0);

  // ---- an unnamed "Other" row is still refused after a reload (the flag is not stored)
  p = await page({ v: 1, mode: 'real', onboarded: false, setupStep: 2, answers: { payFreq: 'monthly', pay: { amount: 1000, none: false }, otherIncome: [{ id: 'x1', name: '', monthly: 5 }] },
    settings: {}, transactions: [], billsPaid: {}, subs: [] });
  await p.click('button:has-text("Continue setup")'); await p.waitForTimeout(300);
  out('resumes at the saved question', /other money coming in/.test(await title(p)));
  await next(p);
  out('an "Other" row with no name is refused even after a reload', /Name your/.test((await p.textContent('#q-error')).trim()) && /other money coming in/.test(await title(p)));

  // ---- changing how you are paid, later, re-asks for the pay amount
  const done = { v: 1, mode: 'real', onboarded: true, answers: { payFreq: 'biweekly', pay: { amount: 1500, none: false, nextPayday: null }, otherIncome: [], bills: [], variable: [], annual: [], debts: [] },
    settings: { balanceSet: true, openingBalance: 100 }, transactions: [], billsPaid: {}, subs: [] };
  p = await page(done);
  await p.click('.tab:has-text("Settings")'); await p.click('button[aria-label^="Edit answer: How often"]');
  await p.click('.option:has-text("It varies")'); await p.waitForTimeout(300); await p.click('button:has-text("Save")'); await p.waitForTimeout(300);
  out('switching to "it varies" sends you to re-enter your pay instead of guessing', /per paycheck|slow month|how much/i.test(await title(p)) && (await p.locator('input[aria-label="Slow month income"]').count()) === 1);
  await p.close();

  await b.close(); console.log(failed ? failed + ' FAILED' : 'ALL PASSED'); process.exit(failed ? 1 : 0);
})();
