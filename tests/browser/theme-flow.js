/* Browser test: Appearance (Match my device / Light / Dark). Needs Playwright and the app served on 8912 (python3 -m http.server 8912):  node tests/browser/theme-flow.js */
'use strict';
const { chromium } = require('playwright');
const URL = process.env.BASE_URL || 'http://localhost:8912/index.html';
let failed = 0; const out = (k, v) => { if (!v) failed++; console.log((v ? 'PASS ' : 'FAIL ') + k); };
const LIGHT = 'rgb(246, 246, 243)', DARK = 'rgb(18, 18, 17)';   // --bg in each theme
(async () => {
  const b = await chromium.launch(); const errs = [];
  async function open(scheme, init) {
    const ctx = await b.newContext({ viewport: { width: 390, height: 800 }, colorScheme: scheme }); const p = await ctx.newPage();
    p.on('pageerror', (e) => errs.push('pageerror ' + e.message)); p.on('console', (m) => { if (['error', 'warning'].includes(m.type()) && !/\/auth\/session/.test((m.location() || {}).url || '')) errs.push(m.text()); });
    if (init) await p.addInitScript(init);
    await p.goto(URL); p.ctx = ctx; return p;
  }
  const bg = (p) => p.evaluate(() => getComputedStyle(document.body).backgroundColor);
  const attr = (p) => p.evaluate(() => document.documentElement.getAttribute('data-theme'));
  const ls = (p, k) => p.evaluate((k) => localStorage.getItem(k), k);
  const bars = (p) => p.evaluate(() => [...document.querySelectorAll('meta[name="theme-color"]')].map((m) => m.getAttribute('content')));
  const pressed = (p, t) => p.locator('button.chip:text-is("' + t + '")').getAttribute('aria-pressed');
  const toSettings = async (p) => { await p.click('button:has-text("Look at a demo first")'); await p.waitForSelector('.tabs'); await p.click('.tab:has-text("Settings")'); await p.waitForSelector('[aria-label="Appearance"]'); };

  // ---- no choice made: the device decides, exactly as before
  let p = await open('light');
  out('no choice: a light device shows light, with no data-theme attribute and nothing stored', (await bg(p)) === LIGHT && (await attr(p)) === null && (await ls(p, 'fd.theme')) === null);
  await p.ctx.close();
  p = await open('dark');
  out('no choice: a dark device shows dark', (await bg(p)) === DARK && (await attr(p)) === null);
  await p.ctx.close();

  // ---- the choice lives on the first screen and in Settings
  p = await open('light');
  out('the first screen has an Appearance choice with three options, Match my device chosen', (await p.locator('[aria-label="Appearance"] button.chip').count()) === 3 && (await pressed(p, 'Match my device')) === 'true');
  await p.click('button.chip:text-is("Dark")'); await p.waitForTimeout(100);
  out('choosing Dark on the first screen turns it dark on a light device, and says which is chosen', (await bg(p)) === DARK && (await attr(p)) === 'dark' && (await pressed(p, 'Dark')) === 'true' && (await pressed(p, 'Match my device')) === 'false');
  out('...stores one word under its own key, and nothing else', (await ls(p, 'fd.theme')) === 'dark' && (await p.evaluate(() => localStorage.length)) === 1);
  out('...and sets the browser / app top-bar colour to the dark one', JSON.stringify(await bars(p)) === JSON.stringify(['#0f2a55', '#0f2a55']));
  await p.reload(); await p.waitForTimeout(200);
  out('a reload keeps Dark', (await bg(p)) === DARK && (await attr(p)) === 'dark');
  await toSettings(p);
  out('Settings shows the same choice, Dark pressed', (await pressed(p, 'Dark')) === 'true' && (await bg(p)) === DARK);
  await p.click('button.chip:text-is("Light")'); await p.waitForTimeout(100);
  out('Light on a light device: light, attribute light, stored', (await bg(p)) === LIGHT && (await attr(p)) === 'light' && (await ls(p, 'fd.theme')) === 'light');
  await p.click('button.chip:text-is("Match my device")'); await p.waitForTimeout(100);
  out('Match my device removes the choice (no attribute, nothing stored, the two top-bar colours are back to the page defaults)', (await attr(p)) === null && (await ls(p, 'fd.theme')) === null && JSON.stringify(await bars(p)) === JSON.stringify(['#1d4f9f', '#0f2a55']));
  await p.ctx.close();

  // ---- the choice beats the device, both ways
  p = await open('dark', "try { localStorage.setItem('fd.theme', 'light'); } catch (e) {}");
  out('Light chosen on a dark device stays light', (await bg(p)) === LIGHT && (await attr(p)) === 'light');
  out('...with light cards (not left over from the dark set)', (await p.evaluate(() => getComputedStyle(document.querySelector('.card')).backgroundColor)) === 'rgb(255, 255, 255)');
  await p.ctx.close();
  p = await open('light', "try { localStorage.setItem('fd.theme', 'dark'); } catch (e) {}");
  out('Dark chosen on a light device stays dark, cards included', (await bg(p)) === DARK && (await p.evaluate(() => getComputedStyle(document.querySelector('.card')).backgroundColor)) === 'rgb(28, 28, 26)');
  await p.ctx.close();

  // ---- applied before anything is painted (no flash of the other theme)
  p = await open('light', "try { localStorage.setItem('fd.theme', 'dark'); } catch (e) {} window.__early = null; new MutationObserver(() => { if (window.__early === null && document.documentElement && document.documentElement.getAttribute('data-theme')) window.__early = !document.body; }).observe(document, { attributes: true, subtree: true, attributeFilter: ['data-theme'] });");
  out('the saved choice is applied from <head>, before the page body exists', (await p.evaluate(() => window.__early)) === true);
  await p.ctx.close();

  // ---- hostile or broken storage
  p = await open('light', "try { localStorage.setItem('fd.theme', '<img src=x onerror=alert(1)>'); } catch (e) {}");
  out('a stored value that is not light or dark is ignored (the device decides)', (await attr(p)) === null && (await bg(p)) === LIGHT);
  await p.ctx.close();
  p = await open('light', "const s = Storage.prototype.setItem; Storage.prototype.setItem = function (k, v) { if (k === 'fd.theme') throw new Error('blocked'); return s.call(this, k, v); };");
  await p.click('button.chip:text-is("Dark")'); await p.waitForTimeout(100);
  out('when the browser will not store it, Dark still applies for this visit and nothing breaks', (await bg(p)) === DARK && (await pressed(p, 'Dark')) === 'true');
  await p.ctx.close();

  // ---- it is not your data
  p = await open('light', "try { localStorage.setItem('fd.theme', 'dark'); } catch (e) {}");
  await toSettings(p);
  out('the theme is not in the Move / backup text and is not touched by the demo data', (await ls(p, 'fd.v1')) === null && (await ls(p, 'fd.theme')) === 'dark');
  await p.ctx.close();

  // ---- keyboard: focus stays on the chip that was pressed
  p = await open('light'); await p.locator('button.chip:text-is("Dark")').focus(); await p.keyboard.press('Enter'); await p.waitForTimeout(100);
  out('keyboard: Enter on Dark keeps focus on Dark after the card redraws', await p.evaluate(() => document.activeElement && document.activeElement.textContent === 'Dark'));
  await p.ctx.close();

  // ---- phone fit with a chosen theme on the screens that show it
  for (const w of [320, 360, 390, 430]) {
    p = await open('light', "try { localStorage.setItem('fd.theme', 'dark'); } catch (e) {}"); await p.setViewportSize({ width: w, height: 800 });
    const wide1 = await p.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    await toSettings(p); const wide2 = await p.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    out(w + 'px: nothing wider than the screen in dark (first screen and Settings)', !wide1 && !wide2);
    await p.ctx.close();
  }
  out('no console errors', errs.length === 0); if (errs.length) console.log(errs);
  await b.close(); console.log(failed ? failed + ' FAILED' : 'ALL PASSED'); process.exit(failed ? 1 : 0);
})();
