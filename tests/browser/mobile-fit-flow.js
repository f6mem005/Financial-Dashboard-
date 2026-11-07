/* Browser test: on a phone nothing may be wider than the screen (that is what lets a page drag sideways and "float"), and the sticky bars must still stick.
   Every screen is checked at 320, 360, 390 and 430px wide with touch emulation. Needs Playwright and the app served on 8912:  node tests/browser/mobile-fit-flow.js */
'use strict';
const { chromium } = require('playwright');
const URL = process.env.BASE_URL || 'http://localhost:8912/index.html';
let failed = 0; const out = (k, v) => { if (!v) failed++; console.log((v ? 'PASS ' : 'FAIL ') + k); };
const done = { v: 1, mode: 'real', onboarded: true, answers: { payFreq: 'biweekly', pay: { amount: 1500, none: false, nextPayday: null }, otherIncome: [{ id: 'side', monthly: 200 }],
  bills: [{ id: 'rent', amount: 900, due: 1 }, { id: 'phone', amount: 45, due: 10 }], variable: [{ id: 'groceries', monthly: 300 }], annual: [], debts: [{ id: 'd-card', type: 'card', balance: 1000, min: 35, apr: 22, aprKnown: true }] },
  settings: { balanceSet: true, openingBalance: 400 }, transactions: [], billsPaid: {}, subs: [] };
const TABS = ['home', 'forecast', 'plan', 'ideas', 'activity', 'settings'];
/* Anything wider than the page, or text spilling out of its own box (which looks broken even when the page itself does not widen). */
const probe = () => {
  const iw = document.documentElement.clientWidth, bad = [];
  document.querySelectorAll('body *').forEach((e) => {
    if (e.closest('.phone, .sr-only, .skip, .table-scroll')) return;
    const b = e.getBoundingClientRect(), cn = (e.className && e.className.baseVal === undefined ? e.className : e.tagName);
    if (b.width && (b.right > iw + 1 || b.left < -1)) bad.push(e.tagName.toLowerCase() + '.' + cn + ' ' + Math.round(b.left) + '..' + Math.round(b.right));
    else if (e.scrollWidth > e.clientWidth + 1 && getComputedStyle(e).overflowX === 'visible' && e.clientWidth > 0 && e.tagName !== 'svg' && !e.closest('svg')) bad.push(e.tagName.toLowerCase() + '.' + cn + ' content ' + e.scrollWidth + ' > ' + e.clientWidth);
  });
  return { page: document.documentElement.scrollWidth > iw, bad: bad.slice(0, 4) };
};
(async () => {
  const b = await chromium.launch();
  for (const w of [320, 360, 390, 430]) {
    const phone = { viewport: { width: w, height: 760 }, isMobile: true, hasTouch: true };
    const bads = [];
    const check = async (p, label) => { const r = await p.evaluate(probe); if (r.page || r.bad.length) bads.push(label + ': ' + JSON.stringify(r)); };
    // the first screen, the demo (rich data on every tab), the how-it-works screen
    let ctx = await b.newContext(phone), p = await ctx.newPage(); await p.goto(URL); await check(p, 'landing');
    await p.click('button:has-text("Look at a demo first")'); await p.waitForTimeout(250);
    for (const t of TABS) { await p.evaluate((t) => window.FD.app.go(t), t); await p.waitForTimeout(220); await check(p, 'demo ' + t); }
    await p.click('button:has-text("How it works")'); await p.waitForTimeout(200); await check(p, 'how it works'); await ctx.close();
    // a real, finished setup: every tab and every "change my answer" screen
    ctx = await b.newContext(phone); p = await ctx.newPage(); await p.addInitScript(`localStorage.setItem('fd.v1', ${JSON.stringify(JSON.stringify(done))})`); await p.goto(URL);
    for (const t of TABS) { await p.evaluate((t) => window.FD.app.go(t), t); await p.waitForTimeout(220); await check(p, 'real ' + t); }
    for (let i = 0; i < 13; i++) { await p.evaluate((i) => window.FD.app.editQuestion(i), i); await p.waitForTimeout(100); await check(p, 'edit answer ' + i); await p.evaluate(() => { window.FD.app.ui.editing = null; window.FD.app.render(); }); }
    await ctx.close();
    // every setup question and the summary
    ctx = await b.newContext(phone); p = await ctx.newPage(); await p.goto(URL); await p.click('button:has-text("Get started")');
    for (let i = 0; i <= 13; i++) { await p.evaluate((i) => window.FD.app.goStep(i), i); await p.waitForTimeout(100); await check(p, 'setup step ' + (i + 1)); }
    await ctx.close();
    out(w + 'px: no screen is wider than the phone, and no text spills out of its box' + (bads.length ? '  <-- ' + bads.slice(0, 3).join(' | ') : ''), bads.length === 0);
  }

  // ---- the page cannot be dragged sideways, and sticky bars still stick (overflow rules can break sticky)
  let ctx = await b.newContext({ viewport: { width: 390, height: 560 }, isMobile: true, hasTouch: true }); let p = await ctx.newPage(); await p.goto(URL);
  await p.evaluate(() => window.scrollTo(120, 0)); out('a sideways scroll attempt leaves the page where it was', (await p.evaluate(() => window.scrollX)) === 0);
  const cs = await p.evaluate(() => [getComputedStyle(document.documentElement).overflowX, getComputedStyle(document.body).overflowX]);
  out('the page is set not to scroll sideways (html hidden, body clip so sticky still works)', cs[0] === 'hidden' && cs[1] === 'clip');
  await p.click('button:has-text("Get started")'); await p.evaluate(() => window.FD.app.goStep(3)); await p.waitForTimeout(250);
  const tall = await p.evaluate(() => document.documentElement.scrollHeight > window.innerHeight + 50);
  await p.evaluate(() => window.scrollTo(0, 0)); await p.waitForTimeout(100);
  const nav = await p.evaluate(() => { const r = document.querySelector('.nav-row').getBoundingClientRect(); return [r.bottom, window.innerHeight]; });
  out('the Back / Next bar sticks to the bottom of the screen on a long question', tall && Math.abs(nav[0] - nav[1]) <= 1);
  await p.evaluate(() => { window.FD.update.show('new'); window.scrollTo(0, 300); }); await p.waitForTimeout(150);
  out('the "new version" bar sticks to the top while you scroll', Math.round(await p.evaluate(() => document.getElementById('update-bar').getBoundingClientRect().top)) === 0);
  await ctx.close();
  ctx = await b.newContext({ viewport: { width: 390, height: 560 }, isMobile: true, hasTouch: true }); p = await ctx.newPage(); await p.addInitScript(`localStorage.setItem('fd.v1', ${JSON.stringify(JSON.stringify(done))})`); await p.goto(URL);
  const tabs = await p.evaluate(() => { const r = document.querySelector('.tabs').getBoundingClientRect(); return [r.bottom, window.innerHeight, r.width, document.documentElement.clientWidth]; });
  out('the bottom tab bar sits exactly on the bottom edge and spans the screen', Math.abs(tabs[0] - tabs[1]) <= 1 && tabs[2] === tabs[3]);
  const covered = await p.evaluate(() => { window.scrollTo(0, document.documentElement.scrollHeight); const last = [...document.querySelectorAll('main > *, main')].pop(); const d = document.querySelector('.disclaimer').getBoundingClientRect(), t = document.querySelector('.tabs').getBoundingClientRect(); return d.bottom > t.top + 1; });
  out('scrolled to the very bottom, the last line is not hidden behind the tab bar', !covered);
  await ctx.close();
  await b.close(); console.log(failed ? failed + ' FAILED' : 'ALL PASSED'); process.exit(failed ? 1 : 0);
})();
