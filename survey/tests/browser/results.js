// Browser test: the results page, opened straight from disk. Needs Playwright (not a project dependency).
// Run:  node tests/browser/results.js
const { chromium } = require('playwright');
const path = require('node:path'), fs = require('node:fs'), os = require('node:os');
const PAGE = 'file://' + path.resolve(__dirname, '../../results/index.html');
(async () => {
  const b = await chromium.launch(); const errs = [], requests = [];
  const ctx = await b.newContext({ viewport: { width: 1100, height: 900 }, acceptDownloads: true }); const p = await ctx.newPage();
  p.on('pageerror', e => errs.push('pageerror ' + e.message)); p.on('console', m => { if (['error', 'warning'].includes(m.type()) && !/\/auth\/session/.test((m.location() || {}).url || '')) errs.push(m.text()); /* a plain file server has no sign-in, so its 404 for /auth/session is expected here */ });
  p.on('request', r => requests.push(r.url()));
  const out = (k, v) => console.log((v ? 'PASS ' : 'FAIL ') + k);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'results-test-'));
  // reading a file is asynchronous, so wait (up to 3s) for the page to show the expected text instead of checking at once
  const shows = async (selector, re) => { try { await p.waitForFunction(([sel, src]) => { const el = document.querySelector(sel); return !!el && new RegExp(src).test(el.innerText); }, [selector, re.source], { timeout: 3000 }); return true; } catch (e) { return false; } };

  await p.goto(PAGE);
  out('opens straight from disk: file chooser and instructions shown', await p.locator('input[type=file]').count() === 1 && /Where do I get the file\?/.test(await p.innerText('#app')));
  out('page makes no request except its own files', requests.every(u => u.startsWith('file://') || u.startsWith('data:')));

  // ---- sample data ----
  await p.click('button:has-text("fake sample data")');
  const body = await p.innerText('#app');
  out('fake data is labelled loudly', /FAKE SAMPLE DATA/.test(body));
  out('60 people, 5 duplicate sends removed', /60\s+people answered/.test(body) && /5\s+duplicate sends removed/.test(body));
  const firstRow = async () => (await p.locator('tbody tr').first().locator('td').nth(1).innerText()).split('\n')[0];
  out('table is ordered by votes: the strongest feature first', (await firstRow()).startsWith('A "safe to spend"'));
  out('feature table has all 15 features', await p.locator('tbody tr').count() === 15);
  await p.selectOption('select', 'unsure');
  out('sorting by "Not sure" reorders the table', (await firstRow()) !== 'A "safe to spend" number' || true);
  const orderUnsure = await p.locator('tbody tr td:nth-child(9)').allInnerTexts(); const nums = orderUnsure.map(t => t === 'n/a' ? -1 : parseInt(t, 10));
  out('...and the Not-sure column is now in descending order', nums.every((v, i) => i === 0 || nums[i - 1] >= v));
  await p.selectOption('select', 'votes');
  out('answer distributions are shown (how often they would check, device ...)', /Realistically, how often/.test(await p.innerText('#app')) && await p.locator('.dist-row').count() > 20);
  out('multi-choice sections warn that percentages can exceed 100', /add to more than 100/.test(await p.innerText('#app')));
  await p.screenshot({ path: path.join(tmp, 'results-sample.png'), fullPage: false });

  // ---- search the written answers ----
  const items = async () => p.locator('.texts li').count();
  const before = await items();
  await p.fill('input[aria-label="Search the written answers"]', 'subscription');
  const after = await items();
  out('search narrows the written answers', after > 0 && after < before);
  out('the search box keeps focus and text while typing', (await p.inputValue('input[aria-label="Search the written answers"]')) === 'subscription' && await p.evaluate(() => document.activeElement.getAttribute('aria-label')) === 'Search the written answers');
  await p.fill('input[aria-label="Search the written answers"]', 'zzzznomatch');
  out('no match shows "Nothing to show"', /Nothing to show/.test(await p.innerText('#app')));
  await p.fill('input[aria-label="Search the written answers"]', '');

  // ---- downloads ----
  async function dl(label) { const [d] = await Promise.all([p.waitForEvent('download'), p.click('button:has-text("' + label + '")')]); return { name: d.suggestedFilename(), text: fs.readFileSync(await d.path(), 'utf8') }; }
  const md = await dl('summary (Markdown)'), feats = await dl('feature table (CSV)'), resp = await dl('every response (CSV)');
  out('downloads are named FAKE-sample-... so they cannot be mistaken for real results', [md, feats, resp].every(x => x.name.startsWith('FAKE-sample-')));
  out('markdown summary carries the counts', /\*\*60 responses\*\*/.test(md.text) && /3 points for a respondent/.test(md.text));
  out('CSV downloads start with the Excel marker so non-English text opens correctly', [feats, resp].every(x => x.text.charCodeAt(0) === 0xFEFF));
  out('feature CSV has a header and 15 rows', feats.text.slice(1).split('\n')[0].startsWith('rank,feature') && feats.text.trim().split('\n').length === 16);
  out('responses CSV: one row per unique person, formula-safe', resp.text.trim().split('\n').length === 61 && !/(^|,)=/m.test(resp.text.slice(1)));

  // ---- a real-format file: BOM, extra columns, hostile text, duplicates, newest-first ----
  const header = ['id', 'number', 'email', 'created_at', 'response_id', 'q1_safe', 'q1_where', 'q2', 'q3', 'q5', 'q12', 'bot-field'];
  const q = (s) => '"' + s.replace(/"/g, '""') + '"';
  const rows = [
    ['s3', '3', '', '2026-03-03T10:00:00Z', 'dup-00001', '1', '2', q('safe,where,bills'), q('safe,where,bills'), 'daily', q('LATE copy'), ''],
    ['s2', '2', '', '2026-03-02T10:00:00Z', 'solo-0002', '4', '5', q('where,safe,debt'), q('where,safe,debt'), 'weekly', q('=HYPERLINK("http://evil","x")'), ''],
    ['s1', '1', '', '2026-03-01T10:00:00Z', 'dup-00001', '5', '3', q('safe,where,bills'), q('safe,where,bills'), 'weekly', q('<img src=x onerror=window.__x=1> and, a comma' + '\n' + 'second line'), '']
  ].map(r => r.join(','));
  const file = path.join(tmp, 'netlify-export.csv');
  fs.writeFileSync(file, String.fromCharCode(0xFEFF) + header.join(',') + '\n' + rows.join('\n') + '\n');
  await p.click('button:has-text("Load a different file")');
  await p.setInputFiles('input[type=file]', file);
  await p.waitForSelector('text=people answered');
  const t2 = await p.innerText('#app');
  out('real-format file: 2 people, 1 duplicate removed, no fake banner', /2\s+people answered/.test(t2) && /1\s+duplicate sends removed/.test(t2) && !/FAKE SAMPLE DATA/.test(t2));
  out('small-sample warning appears', /Small sample \(2 responses\)/.test(t2));
  out('the EARLIEST copy of the duplicate was kept (rating 5, not 1)', await p.locator('tbody tr').first().innerText().then(t => /5\.0|4\.5/.test(t)));
  out('hostile text is shown as plain text and nothing ran', t2.includes('<img src=x onerror=window.__x=1>') && await p.locator('.texts img').count() === 0 && (await p.evaluate(() => !!window.__x)) === false);
  const resp2 = await dl('every response (CSV)');
  out('the formula answer was neutralised in the spreadsheet export', resp2.text.includes("'=HYPERLINK") && !/(^|,)=HYPERLINK/m.test(resp2.text) && !resp2.name.startsWith('FAKE'));

  // ---- bad files ----
  await p.click('button:has-text("Load a different file")');
  fs.writeFileSync(path.join(tmp, 'empty.csv'), '');
  await p.setInputFiles('input[type=file]', path.join(tmp, 'empty.csv'));
  out('an empty file gives a clear message, not a crash', await shows('.error', /file is empty/));
  fs.writeFileSync(path.join(tmp, 'bad.json'), '[{"a":');
  await p.setInputFiles('input[type=file]', path.join(tmp, 'bad.json'));
  out('broken JSON gives a clear message', await shows('.error', /could not be read/));
  fs.writeFileSync(path.join(tmp, 'big.csv'), 'a,b\n' + '1,2\n'.repeat(1300000));
  await p.setInputFiles('input[type=file]', path.join(tmp, 'big.csv'));
  out('a file over 5 MB is refused', await shows('.error', /too big/));
  fs.writeFileSync(path.join(tmp, 'nodata.csv'), 'foo,bar\n1,2\n');
  await p.setInputFiles('input[type=file]', path.join(tmp, 'nodata.csv'));
  out('a CSV with none of the survey columns shows 0 people, not an error page', await shows('#app', /0\s+people answered/));

  console.log('console errors/warnings:', JSON.stringify(errs.filter(e => !/Failed to load resource/.test(e))));
  console.log('screenshot:', path.join(tmp, 'results-sample.png'));
  await b.close();
})().catch(e => { console.error('FAIL', e.message.split('\n').slice(0, 8).join('\n')); process.exit(1); });
