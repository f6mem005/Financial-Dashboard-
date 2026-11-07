// The installable web app: the manifest, the icons, the page's head tags, the security policy, and the sign-in gate's open paths must all agree.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const root = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const manifest = JSON.parse(read('manifest.webmanifest'));
const html = read('index.html'), headers = read('_headers'), gate = read('netlify/edge-functions/gate.ts');
const png = (f) => { const b = fs.readFileSync(path.join(root, f)); assert.equal(b.slice(1, 4).toString(), 'PNG', f + ' is a PNG'); return [b.readUInt32BE(16), b.readUInt32BE(20)]; };
const openPaths = () => JSON.parse('[' + gate.match(/const OPEN = \[([\s\S]*?)\];/)[1].replace(/\/\/.*$/gm, '').trim().replace(/,\s*$/, '') + ']');

test('pwa: the manifest has what a browser needs to install the site, and starts at the sign-in-protected root', () => {
  assert.equal(manifest.name, 'Finance Sense'); assert.ok(manifest.short_name.length <= 14);
  assert.equal(manifest.start_url, '/'); assert.equal(manifest.scope, '/'); assert.equal(manifest.display, 'standalone');
  assert.match(manifest.theme_color, /^#[0-9a-f]{6}$/i); assert.match(manifest.background_color, /^#[0-9a-f]{6}$/i);
  assert.ok(manifest.icons.some((i) => i.sizes === '192x192' && i.purpose === 'any'), 'a 192 icon');
  assert.ok(manifest.icons.some((i) => i.sizes === '512x512' && i.purpose === 'any'), 'a 512 icon');
  assert.ok(manifest.icons.some((i) => i.purpose === 'maskable'), 'a maskable icon');
});
test('pwa: every icon exists, is a PNG, and is really the size the manifest says', () => {
  for (const i of manifest.icons) { const [w, h] = png(i.src.replace(/^\//, '')); assert.equal(w + 'x' + h, i.sizes, i.src); assert.equal(i.type, 'image/png'); }
  assert.deepEqual(png('icons/apple-touch-icon.png'), [180, 180]);
});
test('pwa: the page links the manifest and icons with relative paths, and has the phone meta tags', () => {
  assert.match(html, /<link rel="manifest" href="manifest\.webmanifest">/);
  assert.match(html, /<link rel="apple-touch-icon" href="icons\/apple-touch-icon\.png">/);
  assert.match(html, /<meta name="theme-color" content="#[0-9a-f]{6}">/i);
  assert.match(html, /<meta name="apple-mobile-web-app-capable" content="yes">/);
  assert.doesNotMatch(html, /serviceWorker|service-worker/, 'no service worker: there is no offline mode');
  assert.ok(!/serviceWorker/.test(read('js/install.js') + read('js/app.js')), 'nothing registers a service worker');
});
test('pwa: the security policy lets the page load its own manifest and nothing else new, in both the page and the headers', () => {
  const meta = html.match(/Content-Security-Policy"\s+content="([^"]+)"/)[1];
  const hdr = headers.match(/Content-Security-Policy: ([^\n]+)/)[1];
  for (const p of [meta, hdr]) { assert.match(p, /manifest-src 'self'(;|$)/); assert.match(p, /default-src 'none'/); assert.doesNotMatch(p, /worker-src|https?:|\*/); }
});
test('pwa: the browser fetches the manifest and icons with no cookie, so every one of them is on the gate\'s open list (and nothing else new is)', () => {
  const open = openPaths();
  for (const p of ['/manifest.webmanifest', ...manifest.icons.map((i) => i.src), '/icons/apple-touch-icon.png']) assert.ok(open.includes(p), p + ' must be reachable signed out');
  assert.deepEqual(open.filter((p) => !p.startsWith('/auth/')).sort(), ['/icons/apple-touch-icon.png', '/icons/icon-192.png', '/icons/icon-512.png', '/icons/icon-maskable-512.png', '/manifest.webmanifest']);
  for (const p of open) assert.ok(!p.endsWith('/') && !p.includes('*'), 'exact paths only: ' + p);
  const m = html.match(/<link rel="icon"[^>]*href="([^"]+)"/)[1]; assert.ok(open.includes('/' + m), 'the favicon is open too: ' + m);
});
test('pwa: the files the manifest names are in the stage list, so a deploy cannot leave the app installable on paper only', () => {
  const readme = read('README.md');
  for (const f of ['manifest.webmanifest', 'icons/', 'js/install.js']) assert.ok(readme.includes(f), f + ' is in README');
});
