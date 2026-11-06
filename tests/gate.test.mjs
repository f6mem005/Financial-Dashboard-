import test from 'node:test';
import assert from 'node:assert/strict';

// the functions read their secrets from Netlify.env
const env = { SESSION_SECRET: 'a-long-random-session-secret-0123456789', SITE_PASSCODE: 'kqmv-7hxt-rwn4' };
globalThis.Netlify = { env: { get: (k) => env[k] } };
const A = await import('../netlify/shared/auth.mjs');
const { default: login } = await import('../netlify/functions/login.mjs');
const { default: gate, signInPage } = await import('../netlify/edge-functions/gate.ts');

const reqWith = (cookie, url = 'https://site.test/', method = 'GET') => new Request(url, { method, headers: cookie ? { cookie } : {} });
const cookieValue = (setCookie) => setCookie.split(';')[0];
const post = (body, headers = {}, url = 'https://site.test/auth/login') => new Request(url, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: typeof body === 'string' ? body : JSON.stringify(body) });
const next = () => { const c = { calls: 0, next: async () => { c.calls++; return new Response('THE SITE', { status: 200 }); } }; return c; };
const reset = () => { env.SESSION_SECRET = 'a-long-random-session-secret-0123456789'; env.SITE_PASSCODE = 'kqmv-7hxt-rwn4'; };

test('auth: fails closed when a secret is missing or too short', async () => {
  for (const [k, v] of [['SESSION_SECRET', ''], ['SESSION_SECRET', 'short'], ['SITE_PASSCODE', ''], ['SITE_PASSCODE', '1234567'], ['SITE_PASSCODE', '            '], ['SESSION_SECRET', '                    ']]) {
    reset(); env[k] = v;
    assert.equal(A.isConfigured(), false, k + '=' + v);
    assert.equal(await A.checkPasscode('kqmv-7hxt-rwn4'), false);
    reset(); const good = await A.makeCookie(); env[k] = v;
    assert.equal(await A.readSession(reqWith(cookieValue(good))), false);
  }
  reset(); assert.equal(A.isConfigured(), true);
});
test('auth: the right passcode passes, wrong ones (any length, any content) do not', async () => {
  reset();
  assert.equal(await A.checkPasscode('kqmv-7hxt-rwn4'), true);
  for (const bad of ['', 'x', 'kqmv-7hxt-rwn', 'kqmv-7hxt-rwn4 ', 'KQMV-7HXT-RWN4', 'kqmv-7hxt-rwn4'.repeat(50), null, undefined, 42, {}]) assert.equal(await A.checkPasscode(bad), false, String(bad));
});
test('auth: a cookie round-trips, has the safety flags, and carries no secret', async () => {
  reset();
  const set = await A.makeCookie();
  for (const flag of ['HttpOnly', 'Secure', 'SameSite=Lax', 'Path=/', 'Max-Age=1209600']) assert.ok(set.includes(flag), flag);
  assert.ok(!set.includes(env.SITE_PASSCODE) && !set.includes(env.SESSION_SECRET));
  assert.equal(await A.readSession(reqWith(cookieValue(set))), true);
});
test('auth: expired, tampered, swapped and malformed cookies are refused', async () => {
  reset();
  const now = Date.now(), set = await A.makeCookie(now), val = cookieValue(set);
  assert.equal(await A.readSession(reqWith(val), now + 13 * 86400 * 1000), true);
  assert.equal(await A.readSession(reqWith(val), now + 15 * 86400 * 1000), false);                              // expired
  const [name, rest] = [val.split('=')[0], val.split('=').slice(1).join('=')], [ver, exp, sig] = rest.split('.');
  assert.equal(await A.readSession(reqWith(`${name}=${ver}.${Number(exp) + 99999999}.${sig}`)), false);          // longer expiry, same signature
  assert.equal(await A.readSession(reqWith(`${name}=${ver}.${exp}.${sig.slice(0, -2)}AA`)), false);              // changed signature
  assert.equal(await A.readSession(reqWith(`${name}=${ver.split('').reverse().join('')}.${exp}.${sig}`)), false);
  for (const junk of ['', `${name}=`, `${name}=a.b.c`, `${name}=..`, `${name}=${ver}.${exp}`, `${name}=${ver}.-5.${sig}`, `${name}=${ver}.1e9.${sig}`, 'other=' + rest]) assert.equal(await A.readSession(reqWith(junk)), false, junk);
  env.SESSION_SECRET = 'a-different-long-session-secret-9876543210';                                             // forged with another key
  assert.equal(await A.readSession(reqWith(val), now), false);
});
test('auth: changing the passcode signs every session out', async () => {
  reset(); const val = cookieValue(await A.makeCookie());
  assert.equal(await A.readSession(reqWith(val)), true);
  env.SITE_PASSCODE = 'a-brand-new-passcode'; assert.equal(await A.readSession(reqWith(val)), false);
  assert.equal(await A.checkPasscode('kqmv-7hxt-rwn4'), false); assert.equal(await A.checkPasscode('a-brand-new-passcode'), true);
});
test('auth: the cookie is found among other cookies', async () => {
  reset(); const val = cookieValue(await A.makeCookie());
  assert.equal(await A.readSession(reqWith(`a=1; ${val}; b=2`)), true);
});

test('login: right passcode sets the cookie; wrong ones do not; nothing leaks in the reply', async () => {
  reset();
  let r = await login(post({ passcode: 'kqmv-7hxt-rwn4' }));
  assert.equal(r.status, 200); assert.match(r.headers.get('set-cookie'), /^fs_gate=.+HttpOnly; Secure; SameSite=Lax/); assert.equal(r.headers.get('cache-control'), 'no-store');
  assert.ok(!(await r.text()).includes('kqmv'));
  for (const body of [{ passcode: 'nope' }, { passcode: '' }, {}, { passcode: 12345 }, { passcode: 'x'.repeat(500) }]) {
    r = await login(post(body)); assert.equal(r.status, 401, JSON.stringify(body).slice(0, 40)); assert.equal(r.headers.get('set-cookie'), null);
  }
});
test('login: other methods, bad bodies, other sites and not-configured are all refused', async () => {
  reset();
  assert.equal((await login(new Request('https://site.test/auth/login', { method: 'GET' }))).status, 405);
  assert.equal((await login(post('not json'))).status, 400);
  assert.equal((await login(post({ passcode: 'kqmv-7hxt-rwn4' }, { origin: 'https://evil.test' }))).status, 403);
  assert.equal((await login(post({ passcode: 'kqmv-7hxt-rwn4' }, { origin: 'https://site.test' }))).status, 200);
  assert.equal((await login(post({ passcode: 'kqmv-7hxt-rwn4' }, { 'content-length': '999999' }))).status, 413);
  env.SESSION_SECRET = ''; const r = await login(post({ passcode: 'kqmv-7hxt-rwn4' })); assert.equal(r.status, 503); assert.equal(r.headers.get('set-cookie'), null);
});
test('login: it is rate limited per IP (the limit is declared)', async () => {
  const { config } = await import('../netlify/functions/login.mjs');
  assert.equal(config.path, '/auth/login'); assert.deepEqual(config.rateLimit, { windowLimit: 10, windowSize: 60, aggregateBy: ['ip', 'domain'] });
});

test('gate: no cookie means the sign-in page and the site is NEVER fetched', async () => {
  reset();
  for (const [url, method] of [['https://site.test/', 'GET'], ['https://site.test/js/app.js', 'GET'], ['https://site.test/index.html', 'GET'], ['https://site.test/', 'POST'], ['https://site.test/anything/else', 'GET'], ['https://site.test/%2e%2e/js/app.js', 'GET']]) {
    const ctx = next(), r = await gate(reqWith(null, url, method), ctx), t = await r.text();
    assert.equal(r.status, 401, url + ' ' + method); assert.equal(ctx.calls, 0); assert.ok(!t.includes('THE SITE')); assert.match(t, /Passcode/);
    assert.match(r.headers.get('content-security-policy'), /connect-src 'self'/); assert.equal(r.headers.get('cache-control'), 'private, no-store'); assert.equal(r.headers.get('x-frame-options'), 'DENY');
  }
});
test('gate: a bad, expired or old-passcode cookie is the same as no cookie', async () => {
  reset(); const good = cookieValue(await A.makeCookie());
  for (const c of ['fs_gate=a.b.c', good.slice(0, -3) + 'abc', '']) { const ctx = next(); assert.equal((await gate(reqWith(c), ctx)).status, 401); assert.equal(ctx.calls, 0); }
  env.SITE_PASSCODE = 'changed-passcode-now'; const ctx = next(); assert.equal((await gate(reqWith(good), ctx)).status, 401); assert.equal(ctx.calls, 0);
});
test('gate: a good cookie lets the site through (any method)', async () => {
  reset(); const val = cookieValue(await A.makeCookie());
  for (const [url, method] of [['https://site.test/', 'GET'], ['https://site.test/js/app.js', 'GET'], ['https://site.test/', 'POST']]) {
    const ctx = next(), r = await gate(reqWith(val, url, method), ctx); assert.equal(ctx.calls, 1); assert.equal(await r.text(), 'THE SITE');
  }
});
test('gate: the sign-in page files and the login function are reachable without a cookie; nothing else under /auth/ matters', async () => {
  reset(); const ctx = next();
  for (const p of ['/auth/login', '/auth/gate.js', '/auth/gate.css']) await gate(reqWith(null, 'https://site.test' + p), ctx);
  assert.equal(ctx.calls, 3);
  const { config } = await import('../netlify/edge-functions/gate.ts');
  assert.equal(config.path, '/*'); assert.deepEqual(config.excludedPath, ['/auth/login', '/auth/gate.js', '/auth/gate.css']);
});
test('gate: only the three exact sign-in paths are open; encoded or look-alike /auth/ paths are gated', async () => {
  reset();
  for (const p of ['/auth/', '/auth', '/auth/x', '/auth/..%2findex.html', '/auth/%2e%2e%2findex.html', '/auth/%2fx', '/auth/gate.js/', '/auth/gate.jsx', '/auth//login', '/AUTH/login', '/auth/login/', '/.netlify/functions/login']) {
    const ctx = next(), r = await gate(reqWith(null, 'https://site.test' + p), ctx);
    assert.equal(r.status, 401, p); assert.equal(ctx.calls, 0, p);
  }
});
test('gate: the sign-in page carries the full set of security headers', async () => {
  reset(); const r = await gate(reqWith(null), next());
  for (const h of ['strict-transport-security', 'cross-origin-opener-policy', 'cross-origin-resource-policy', 'permissions-policy', 'x-content-type-options', 'referrer-policy']) assert.ok(r.headers.get(h), h);
});
test('auth: a cookie from another site is refused even with the same secrets and passcode', async () => {
  reset(); const other = cookieValue(await A.makeCookie(Date.now(), 'some-other-site'));
  assert.equal(await A.readSession(reqWith(other)), false);
  assert.equal(await A.readSession(reqWith(cookieValue(await A.makeCookie()))), true);
  const ctx = next(); assert.equal((await gate(reqWith(other), ctx)).status, 401); assert.equal(ctx.calls, 0);
});
test('login: the default /.netlify/ route is refused (it would skip the rate limit); the public path works', async () => {
  reset();
  for (const u of ['https://site.test/.netlify/functions/login', 'https://site.test/.netlify/x']) assert.equal((await login(post({ passcode: 'kqmv-7hxt-rwn4' }, {}, u))).status, 404, u);
  assert.equal((await login(post({ passcode: 'kqmv-7hxt-rwn4' }))).status, 200);
  assert.equal((await login(post({ passcode: 'kqmv-7hxt-rwn4' }, {}, 'https://site.test/anything'))).status, 200);   // whatever public URL the platform reports must still sign in
});
test('gate: not configured fails closed, even with a cookie, and says why', async () => {
  reset(); const val = cookieValue(await A.makeCookie()); env.SITE_PASSCODE = '';
  const ctx = next(), r = await gate(reqWith(val), ctx), t = await r.text();
  assert.equal(r.status, 503); assert.equal(ctx.calls, 0); assert.match(t, /not set up yet/); assert.ok(!/<form/.test(t)); assert.ok(!/SESSION_SECRET|SITE_PASSCODE/.test(t), 'the public page does not name the settings');
});
test('gate: HEAD gets headers only; the sign-in page has no inline script or style and no secrets', async () => {
  reset(); const r = await gate(reqWith(null, 'https://site.test/', 'HEAD'), next()); assert.equal(r.status, 401); assert.equal(await r.text(), '');
  const html = signInPage(true);
  assert.ok(!/<script(?![^>]*\ssrc=)/.test(html) && !/style=|onclick=|onsubmit=/.test(html));
  assert.ok(!html.includes(env.SITE_PASSCODE) && !html.includes(env.SESSION_SECRET));
});
