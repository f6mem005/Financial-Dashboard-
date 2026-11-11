'use strict';
// The survey's demo page runs the app's own code (copied in by scripts/sync-demo.mjs). These checks keep the two in step and the page locked down.
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), cp = require('node:child_process');
const survey = path.join(__dirname, '..'), repo = path.join(survey, '..');
const read = (...p) => fs.readFileSync(path.join(...p), 'utf8');
const scripts = (html) => [...html.matchAll(/<script src="([^"]+)"><\/script>/g)].map((m) => m[1]);

test('demo page: runs exactly the app\'s scripts (without the update check), after demo-config.js, with nothing inline', () => {
  const demo = read(survey, 'demo', 'index.html'), app = read(repo, 'index.html');
  const want = scripts(app).filter((s) => !['js/version.js', 'js/update.js', 'js/theme.js'].includes(s)).map((s) => 'app/' + s);
  assert.deepEqual(scripts(demo), ['demo-config.js', ...want]);
  assert.equal(scripts(demo).indexOf('demo-config.js'), 0, 'the setting must be in place before the app starts');
  assert.doesNotMatch(demo, /<script(?![^>]*\bsrc=)/i, 'no inline script'); assert.doesNotMatch(demo, /\son[a-z]+\s*=|javascript:/i, 'no inline handlers');
});
test('demo page: a plain link to the questions sits where the app mounts, so a demo that fails to load never traps anyone (and no inline style, which the policy blocks)', () => {
  const demo = read(survey, 'demo', 'index.html');
  assert.match(demo, /<div id="app"><p><a href="\/\?demo=done">Continue to the questions<\/a><\/p><\/div>/);
  assert.match(demo, /<noscript>[^]*href="\/\?demo=done"[^]*<\/noscript>/); assert.doesNotMatch(demo, /\sstyle\s*=/i);
});
test('demo page: same strict policy as the survey page (own site only, no third parties)', () => {
  const csp = (h) => (h.match(/Content-Security-Policy" content="([^"]+)"/) || [])[1];
  assert.equal(csp(read(survey, 'demo', 'index.html')), csp(read(survey, 'index.html')));
  assert.doesNotMatch(read(survey, 'demo', 'index.html'), /https?:\/\//, 'no outside address anywhere on the page');
});
test('demo config: a same-site path back to the questions, and a short label and note', () => {
  const sandbox = { window: {} }; new Function('window', read(survey, 'demo', 'demo-config.js'))(sandbox.window);
  const c = sandbox.window.FD_DEMO_ONLY;
  assert.match(c.continueUrl, /^\/(?!\/)[A-Za-z0-9_\/.?=&-]{0,100}$/); assert.equal(c.continueUrl, '/?demo=done');
  assert.ok(c.continueLabel.length <= 60 && c.note.length <= 200);
});
test('demo: the app code the page loads is generated, never committed, and the sync refuses a mismatched list', () => {
  assert.match(read(survey, '.gitignore'), /^demo\/app\/$/m);
  let tracked = null; try { tracked = cp.execSync('git ls-files --cached --others --exclude-standard survey/demo', { cwd: repo, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim().split('\n').sort(); } catch (e) { /* not a git checkout (a copy of the files): nothing to compare */ }
  if (tracked) assert.deepEqual(tracked, ['survey/demo/demo-config.js', 'survey/demo/index.html']);
  const sync = read(survey, 'scripts', 'sync-demo.mjs'); assert.match(sync, /process\.exit\(1\)/);
});
test('survey page: the demo is switched on, and the start button leads to it', () => {
  assert.match(read(survey, 'js', 'config.js'), /demo: true/); assert.match(read(survey, 'js', 'survey.js'), /DEMO_PATH = 'demo\/'/);
});
