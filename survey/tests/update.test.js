const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), { execFileSync } = require('node:child_process');
require('../js/version.js'); require('../js/update.js');
const SV = globalThis.SV, U = SV.update;

const byUrl = (map) => async (url) => (map[url] || map['*'])(url);
const reply = (status, body) => async () => ({ status, ok: status >= 200 && status < 300, json: async () => { if (body === undefined) throw new Error('not json'); return body; } });

test('update: the same build means nothing to show; a different build means "new"', async () => {
  assert.equal(await U.check(reply(200, { build: 'b1' }), 'b1'), 'same');
  assert.equal(await U.check(reply(200, { build: 'b2' }), 'b1'), 'new');
});
test('update: a 401 is only called "signed out" if the session check agrees (a storage hiccup also makes the gate say 401)', async () => {
  assert.equal(await U.check(byUrl({ '/version.json': reply(401), '/auth/session': reply(401) }), 'b1'), 'signin');
  assert.equal(await U.check(byUrl({ '/version.json': reply(401), '/auth/session': reply(503) }), 'b1'), 'unknown', 'storage down: not a sign-out');
  assert.equal(await U.check(byUrl({ '/version.json': reply(401), '/auth/session': reply(200, { role: 'person' }) }), 'b1'), 'unknown');
  assert.equal(await U.check(byUrl({ '/version.json': reply(401), '/auth/session': async () => { throw new Error('offline'); } }), 'b1'), 'unknown');
});
test('update: anything unclear shows nothing', async () => {
  for (const r of [reply(404), reply(500), reply(503), reply(200), reply(200, {}), reply(200, { build: 5 }), reply(200, { build: '' }), reply(200, { build: '<script>' }), reply(200, { build: 'x'.repeat(100) }), reply(200, null), reply(200, 'text')]) assert.equal(await U.check(r, 'b1'), 'unknown');
  assert.equal(await U.check(async () => { throw new Error('offline'); }, 'b1'), 'unknown');
  assert.equal(await U.check(() => { throw new Error('sync'); }, 'b1'), 'unknown');
});
test('update: a page with no real build id (local, or before the first stamped deploy) never shows anything and does not even ask', async () => {
  let asked = 0; const f = async () => { asked++; return reply(200, { build: 'zzz' })(); };
  for (const b of ['dev', '', undefined, null]) assert.equal(await U.check(f, b), 'unknown');
  assert.equal(asked, 0);
  assert.equal(SV.build, 'dev');
});
test('update: it asks for the live file without using the cache', async () => {
  let seen; await U.check(async (url, opts) => { seen = { url, opts }; return reply(200, { build: 'b1' })(); }, 'b1');
  assert.equal(seen.url, '/version.json'); assert.equal(seen.opts.cache, 'no-store'); assert.equal(seen.opts.credentials, 'same-origin');
  assert.equal(U.INTERVAL_MS, 5 * 60 * 1000);
});
test('stamp: writes the same build id into js/version.js and version.json, and refuses a folder that was already stamped', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'stamp-')); fs.mkdirSync(path.join(dir, 'js')); fs.copyFileSync(path.join(__dirname, '..', 'js', 'version.js'), path.join(dir, 'js', 'version.js')); fs.copyFileSync(path.join(__dirname, '..', 'index.html'), path.join(dir, 'index.html'));
  const run = () => execFileSync(process.execPath, [path.join(__dirname, '..', 'scripts', 'stamp-version.mjs'), dir, 'abc123'], { stdio: 'pipe' });
  run();
  const js = fs.readFileSync(path.join(dir, 'js', 'version.js'), 'utf8'), json = JSON.parse(fs.readFileSync(path.join(dir, 'version.json'), 'utf8'));
  assert.match(json.build, /^\d{14}-abc123$/); assert.ok(js.includes(`.build = '${json.build}'`)); assert.ok(!js.includes("'dev'"));
  assert.ok(fs.readFileSync(path.join(dir, 'index.html'), 'utf8').includes(`<meta name="build" content="${json.build}">`), 'the page carries its own build too');
  assert.throws(run, /placeholder/);
  assert.equal(fs.readFileSync(path.join(__dirname, '..', 'js', 'version.js'), 'utf8').includes("'dev'"), true, 'the repo copy keeps its placeholder');
  fs.rmSync(dir, { recursive: true, force: true });
});
test('stamp: refuses the repo itself (a folder with tests or .git) and a folder with no placeholder', () => {
  const run = (dir) => execFileSync(process.execPath, [path.join(__dirname, '..', 'scripts', 'stamp-version.mjs'), dir, 'x'], { stdio: 'pipe' });
  const repoLike = fs.mkdtempSync(path.join(os.tmpdir(), 'repo-')); fs.mkdirSync(path.join(repoLike, 'js')); fs.mkdirSync(path.join(repoLike, 'tests'));
  assert.throws(() => run(repoLike), /repo, not a staging folder/);
  const noMeta = fs.mkdtempSync(path.join(os.tmpdir(), 'nometa-')); fs.mkdirSync(path.join(noMeta, 'js')); fs.writeFileSync(path.join(noMeta, 'index.html'), '<html></html>'); fs.copyFileSync(path.join(__dirname, '..', 'js', 'version.js'), path.join(noMeta, 'js', 'version.js'));
  assert.throws(() => run(noMeta), /placeholder build meta/);
  assert.equal(fs.existsSync(path.join(repoLike, 'version.json')), false);
  fs.rmSync(repoLike, { recursive: true, force: true }); fs.rmSync(noMeta, { recursive: true, force: true });
});
test('update: index.html loads the version file first and the checker after the survey, and the page may reach its own site (for /version.json)', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const order = [...html.matchAll(/<script src="js\/([a-z-]+)\.js">/g)].map((m) => m[1]);
  assert.ok(order.indexOf('version') >= 0 && order.indexOf('version') < order.indexOf('config')); assert.equal(order[order.length - 1], 'update');
  assert.match(html, /connect-src 'self'/);
});
