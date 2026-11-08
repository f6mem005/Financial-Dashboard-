/* Browser test: the landing page is informational (nothing looks or acts clickable except the real buttons), and the install card works.
   Needs Playwright and the app served on 8912 (python3 -m http.server 8912):  node tests/browser/landing-install-flow.js */
'use strict';
const { chromium } = require('playwright');
const URL = process.env.BASE_URL || 'http://localhost:8912/index.html';
const SHOTS = process.env.SHOTS || '';
let failed = 0; const out = (k, v) => { if (!v) failed++; console.log((v ? 'PASS ' : 'FAIL ') + k); };
const done = { v: 1, mode: 'real', onboarded: true, answers: { payFreq: 'biweekly', pay: { amount: 1500, none: false, nextPayday: null }, otherIncome: [], bills: [], variable: [], annual: [], debts: [] },
  settings: { balanceSet: true, openingBalance: 100 }, transactions: [], billsPaid: {}, subs: [] };
(async () => {
  const b = await chromium.launch();
  async function open(o, init) {
    const ctx = await b.newContext(Object.assign({ viewport: { width: 390, height: 800 } }, o || {})); const p = await ctx.newPage(); const errs = [];
    p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => { if (['error', 'warning'].includes(m.type()) && !/\/auth\/session/.test((m.location() || {}).url || '')) errs.push(m.text()); /* a plain file server has no sign-in, so its 404 for /auth/session is expected here */ });
    if (init) await p.addInitScript(init);
    await p.goto(URL); p.errs = errs; p.ctx = ctx; return p;
  }
  const noScroll = (p) => p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);

  // ---- landing: phone
  let p = await open();
  out('landing: the plain list has the four benefits', (await p.locator('ul.benefits li').count()) === 4 && (await p.locator('.features, .feature').count()) === 0);
  const look = await p.evaluate(() => { const li = document.querySelector('.benefit'), cs = getComputedStyle(li); return { border: cs.borderTopWidth, shadow: cs.boxShadow, bg: cs.backgroundColor, cursor: cs.cursor }; });
  out('landing: list items have no border, shadow, fill or pointer cursor (nothing implies a click)', look.border === '0px' && look.shadow === 'none' && look.bg === 'rgba(0, 0, 0, 0)' && look.cursor !== 'pointer');
  out('landing: exactly one Get started button, none of the list or facts are buttons', (await p.locator('button:has-text("Get started")').count()) === 1 && (await p.locator('.benefits button, .benefits a, .landing-stats button, .landing-stats a').count()) === 0);
  out('landing: key facts are plain text', (await p.locator('.landing-stats li').count()) === 3 && /About 3 min/.test(await p.innerText('.landing-stats')));
  out('landing: the phone preview is hidden from screen readers and holds nothing interactive', (await p.getAttribute('.phone', 'aria-hidden')) === 'true' && (await p.locator('.phone button, .phone a, .phone input, .phone [tabindex], .phone [onclick]').count()) === 0);
  out('landing: the phone ignores the pointer and the caption says the numbers are an example', (await p.evaluate(() => getComputedStyle(document.querySelector('.phone')).pointerEvents)) === 'none' && /example numbers/i.test(await p.innerText('.landing-caption')));
  await p.evaluate(() => document.querySelector('.phone').scrollIntoView({ block: 'center' })); await p.waitForTimeout(150);
  const bx = await p.locator('.phone').boundingBox(); await p.mouse.click(bx.x + bx.width / 2, bx.y + bx.height / 2); await p.waitForTimeout(200);
  out('landing: tapping the phone does nothing (still the landing page)', /Know where your money is going/.test(await p.textContent('h1')));
  out('landing: no sideways scrolling on a phone', await noScroll(p));
  if (SHOTS) await p.screenshot({ path: SHOTS + '/landing-phone.png', fullPage: true });
  out('landing: no console errors', p.errs.length === 0); if (p.errs.length) console.log(p.errs);
  await p.ctx.close();

  p = await open({ viewport: { width: 320, height: 700 } }); out('landing: no sideways scrolling at 320px', await noScroll(p)); await p.ctx.close();
  p = await open({ viewport: { width: 1200, height: 800 } });
  const t = await p.locator('.landing-title').boundingBox(), ph = await p.locator('.phone').boundingBox();
  out('landing: on a wide screen the phone sits beside the text, not under it', ph.x > t.x + t.width - 10 && ph.y < t.y + 500 && (await noScroll(p)));
  if (SHOTS) await p.screenshot({ path: SHOTS + '/landing-desktop.png', fullPage: true });
  await p.ctx.close();
  p = await open({ colorScheme: 'dark' }); if (SHOTS) await p.screenshot({ path: SHOTS + '/landing-dark.png', fullPage: true }); out('landing (dark): no sideways scrolling', await noScroll(p)); await p.ctx.close();

  // ---- the manifest as the browser sees it
  p = await open(); const cdp = await p.ctx.newCDPSession(p); await cdp.send('Page.enable');
  const m = await cdp.send('Page.getAppManifest');
  out('manifest: Chromium parses it with no errors', (m.errors || []).length === 0 && /manifest\.webmanifest$/.test(m.url)); if ((m.errors || []).length) console.log(m.errors);
  const inst = await cdp.send('Page.getInstallabilityErrors').catch(() => ({ installabilityErrors: [] }));
  console.log('INFO installability notes:', JSON.stringify(inst.installabilityErrors.map((e) => e.errorId)));
  out('manifest: nothing is wrong with the manifest or icons themselves', !inst.installabilityErrors.some((e) => /manifest|icon|start-url|display|scope|name/i.test(e.errorId) && !/service-worker|fetch-handler/i.test(e.errorId)));
  await p.ctx.close();

  // ---- the Install card in Settings
  const seed = `if (!sessionStorage.getItem('s')) { localStorage.setItem('fd.v1', ${JSON.stringify(JSON.stringify(done))}); sessionStorage.setItem('s', '1'); }`;
  p = await open({}, seed); await p.click('.tab:has-text("Settings")');
  out('install: Settings has the card, with steps for iPhone, Android and a computer, and the storage warning', /Install on your phone/.test(await p.innerText('main')) && (await p.locator('.install-steps li').count()) === 3 && /keeps its own storage/.test(await p.innerText('main')) && /no offline mode/i.test(await p.innerText('main')));
  for (let i = 0; i < 4; i++) { await p.click('.tab:has-text("Home")'); await p.click('.tab:has-text("Settings")'); }
  out('install: going back to Settings again and again does not pile up old cards', (await p.evaluate(() => window.FD.install.slotCount())) === 1);
  await p.evaluate(() => { window.__prompted = 0; const e = new Event('beforeinstallprompt', { cancelable: true }); e.prompt = () => { window.__prompted++; return Promise.resolve(); }; e.userChoice = Promise.resolve({ outcome: 'accepted' }); window.dispatchEvent(e); });
  await p.waitForTimeout(250);
  out('install: when the browser offers it, the card shows an Install button instead of the steps', (await p.locator('button:has-text("Install Finance Sense")').count()) === 1 && (await p.locator('.install-steps').count()) === 0);
  await p.click('button:has-text("Install Finance Sense")'); await p.waitForTimeout(250);
  out('install: after pressing Install, keyboard focus stays on the card instead of falling to the top of the page', await p.evaluate(() => document.activeElement && document.activeElement.classList.contains('install-slot')));
  out('install: pressing it opens the browser prompt once, and once accepted the card says it is installed (not "install it" again)', (await p.evaluate(() => window.__prompted)) === 1 && (await p.locator('button:has-text("Install Finance Sense")').count()) === 0 && /Installed\./.test(await p.innerText('.install-slot')) && (await p.locator('.install-steps').count()) === 0);
  await p.fill('input[aria-label="Current balance"]', '321');
  await p.evaluate(() => { const e = new Event('beforeinstallprompt', { cancelable: true }); e.prompt = () => Promise.resolve(); e.userChoice = Promise.resolve({}); window.dispatchEvent(e); });
  await p.waitForTimeout(250);
  out('install: an offer that arrives while you are typing does not wipe what you typed', (await p.inputValue('input[aria-label="Current balance"]')) === '321');
  // a backup being restored (file chosen, preview showing) must survive the browser's offer arriving, even when nothing is focused
  const backup = JSON.stringify({ format: 'finance-sense-backup', version: 1, exportedAt: new Date().toISOString(), state: done });
  await p.setInputFiles('input[type=file]', { name: 'b.json', mimeType: 'application/json', buffer: Buffer.from(backup) }); await p.waitForTimeout(500);
  const previewBefore = await p.locator('.summary-line').count();
  await p.evaluate(() => { document.activeElement && document.activeElement.blur(); const e = new Event('beforeinstallprompt', { cancelable: true }); e.prompt = () => Promise.resolve(); e.userChoice = new Promise(() => {}); window.dispatchEvent(e); });
  await p.waitForTimeout(300);
  out('install: an offer arriving does not wipe a backup that is open for restoring, or the typed balance', previewBefore === 1 && (await p.locator('.summary-line').count()) === 1 && (await p.inputValue('input[aria-label="Current balance"]')) === '321' && (await p.locator('button:has-text("Install Finance Sense")').count()) === 1);
  await p.evaluate(() => window.dispatchEvent(new Event('appinstalled'))); await p.waitForTimeout(200);
  out('install: once the browser says it was installed, the card says so and the restore preview is still there', /Installed\./.test(await p.innerText('.install-slot')) && (await p.locator('.summary-line').count()) === 1);
  out('install: no console errors', p.errs.length === 0); if (p.errs.length) console.log(p.errs);
  await p.ctx.close();
  // a prompt() that fails must not leave an uncaught error in the console
  p = await open({}, seed); await p.click('.tab:has-text("Settings")');
  await p.evaluate(() => { const e = new Event('beforeinstallprompt', { cancelable: true }); e.prompt = () => Promise.reject(new Error('declined')); Object.defineProperty(e, 'userChoice', { get() { return Promise.reject(new Error('declined')); } }); window.dispatchEvent(e); });
  await p.waitForTimeout(200); await p.click('button:has-text("Install Finance Sense")'); await p.waitForTimeout(300);
  out('install: a prompt the browser refuses leaves a clean console and the card still shows the steps', p.errs.length === 0 && (await p.locator('.install-steps').count()) === 1); if (p.errs.length) console.log(p.errs);
  await p.ctx.close();
  // the in-app "How it works" screen has no phone, so it must keep the normal single-column hero
  p = await open({ viewport: { width: 1200, height: 800 } }, seed); await p.click('button:has-text("How it works")'); await p.waitForTimeout(250);
  out('how it works (in the app): wide screens keep the normal hero, no empty second column', (await p.locator('.phone').count()) === 0 && (await p.evaluate(() => getComputedStyle(document.querySelector('.landing-in')).display)) !== 'grid');
  await p.ctx.close();
  p = await open({ viewport: { width: 1200, height: 800 } });
  const hx = await p.evaluate(() => [document.querySelector('.landing-title').getBoundingClientRect().left, document.querySelector('.welcome .section-title').getBoundingClientRect().left]);
  const dl = await p.evaluate(() => document.querySelector('.disclaimer').getBoundingClientRect().left);
  out('landing: on a wide screen the hero text, the sections and the disclaimer start at the same left edge', Math.abs(hx[0] - hx[1]) <= 2 && Math.abs(hx[0] - dl) <= 2);
  await p.ctx.close();
  p = await open({ viewport: { width: 820, height: 800 } });
  const e2 = await p.evaluate(() => [document.querySelector('.landing-title').getBoundingClientRect().left, document.querySelector('.disclaimer').getBoundingClientRect().left]);
  out('landing: at 820px too, the disclaimer lines up with the title', Math.abs(e2[0] - e2[1]) <= 2);
  await p.ctx.close();
  p = await open({ viewport: { width: 360, height: 700 } });
  out('landing: at 360px the three key facts stack or fit without a stray divider', await p.evaluate(() => { const l = [...document.querySelectorAll('.landing-stats li')]; const tops = new Set(l.map((x) => Math.round(x.getBoundingClientRect().top))); return tops.size === 1 || l.every((x) => getComputedStyle(x).borderLeftWidth === '0px'); }));
  await p.ctx.close();
  p = await open({}, seed + `Object.defineProperty(navigator, 'standalone', { value: true });`); await p.click('.tab:has-text("Settings")');
  out('install: already installed, the card just says so', /using the installed app/.test(await p.innerText('main')) && (await p.locator('.install-steps').count()) === 0);
  await p.ctx.close();

  await b.close(); console.log(failed ? failed + ' FAILED' : 'ALL PASSED'); process.exit(failed ? 1 : 0);
})();
