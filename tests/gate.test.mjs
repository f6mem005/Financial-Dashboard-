import test from 'node:test';
import assert from 'node:assert/strict';
import { fakeStore } from './fake-store.mjs';

// the functions read their secrets from Netlify.env
const env = { SESSION_SECRET: 'a-long-random-session-secret-0123456789', ADMIN_PASSCODE: 'admin-passcode-42' };
globalThis.Netlify = { env: { get: (k) => env[k] } };
const A = await import('../netlify/shared/auth.mjs');
const P = await import('../netlify/shared/people.mjs');
const { default: login, config: loginConfig } = await import('../netlify/functions/login.mjs');
const { default: session } = await import('../netlify/functions/session.mjs');
const { default: logout } = await import('../netlify/functions/logout.mjs');
const { default: admin, config: adminConfig } = await import('../netlify/functions/admin.mjs');
const { default: gate, signInPage, setCacheSeconds, config: gateConfig } = await import('../netlify/edge-functions/gate.ts');
const { SITE: WORDS } = await import('../netlify/shared/site.mjs');

const SITE = 'https://site.test';
const reset = () => { env.SESSION_SECRET = 'a-long-random-session-secret-0123456789'; env.ADMIN_PASSCODE = 'admin-passcode-42'; P.setStore(fakeStore()); setCacheSeconds(0); };   // no remembering in tests unless a test asks
const cookieOf = (setCookie) => setCookie.split(';')[0];
const req = (url, { method = 'GET', cookie, headers = {}, body } = {}) => new Request(SITE + url, { method, headers: { ...(cookie ? { cookie } : {}), ...headers }, body: body === undefined ? undefined : (typeof body === 'string' ? body : JSON.stringify(body)) });
const asAdmin = async () => cookieOf(await A.makeCookie({ kind: 'admin' }));
const origin = { origin: SITE, 'content-type': 'application/json' };
const adminCall = (cookie, body, headers = origin) => admin(req('/auth/admin', { method: 'POST', cookie, headers, body }));
async function signInAs(name, passcode) { const r = await login(req('/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: { name, passcode } })); return { r, cookie: r.headers.get('set-cookie') ? cookieOf(r.headers.get('set-cookie')) : null }; }
const next = () => { const c = { calls: 0, next: async () => { c.calls++; return new Response('THE SITE', { status: 200 }); } }; return c; };

/* ---------------- auth library ---------------- */
test('auth: fails closed when a secret is missing, too short or blank', async () => {
  for (const [k, v] of [['SESSION_SECRET', ''], ['SESSION_SECRET', 'short'], ['SESSION_SECRET', '                    '], ['ADMIN_PASSCODE', ''], ['ADMIN_PASSCODE', '1234567'], ['ADMIN_PASSCODE', '            ']]) {
    reset(); env[k] = v;
    assert.equal(A.isConfigured(), false, k + '=' + v);
    assert.equal(await A.checkAdminPasscode('admin-passcode-42'), false);
  }
  reset(); const good = await A.makeCookie({ kind: 'admin' }); env.SESSION_SECRET = '';
  assert.equal(await A.readSession(req('/', { cookie: cookieOf(good) })), null);
  reset(); assert.equal(A.isConfigured(), true);
});
test('auth: the admin passcode check accepts only the exact value', async () => {
  reset(); assert.equal(await A.checkAdminPasscode('admin-passcode-42'), true);
  for (const bad of ['', 'x', 'admin-passcode-4', 'admin-passcode-42 ', 'ADMIN-PASSCODE-42', 'admin-passcode-42'.repeat(40), null, undefined, 42, {}]) assert.equal(await A.checkAdminPasscode(bad), false, String(bad));
});
test('auth: personal passcodes are hashed, salted, and verified', async () => {
  const a = await A.hashPasscode('rakobu47'), b = await A.hashPasscode('rakobu47');
  assert.notEqual(a.hash, b.hash); assert.notEqual(a.salt, b.salt); assert.ok(!JSON.stringify(a).includes('rakobu47'));
  assert.equal(await A.verifyPasscode('rakobu47', a), true); assert.equal(await A.verifyPasscode('rakobu48', a), false);
  assert.equal(await A.verifyPasscode('x', A.DUMMY), false); assert.equal(await A.verifyPasscode(null, a), false); assert.equal(await A.verifyPasscode('x', null), false);
});
test('auth: admin and person cookies round-trip, carry the safety flags, and hold no secret', async () => {
  reset();
  const a = await A.makeCookie({ kind: 'admin' }), p = await A.makeCookie({ kind: 'person', id: 'abc123def', ver: 'ver123456' });
  for (const set of [a, p]) { for (const f of ['HttpOnly', 'Secure', 'SameSite=Lax', 'Path=/']) assert.ok(set.includes(f), f); assert.ok(!set.includes(env.ADMIN_PASSCODE) && !set.includes(env.SESSION_SECRET)); }
  assert.ok(a.includes('Max-Age=43200') && p.includes('Max-Age=1209600'), 'admin 12 hours, a person 14 days');
  assert.ok(a.startsWith('__Host-fs_gate=') && !/Domain=/i.test(a), 'the __Host- prefix needs Secure, Path=/ and no Domain');
  assert.deepEqual(await A.readSession(req('/', { cookie: cookieOf(a) })), { kind: 'admin' });
  assert.deepEqual(await A.readSession(req('/', { cookie: cookieOf(p) })), { kind: 'person', id: 'abc123def', ver: 'ver123456' });
});
test('auth: expired, tampered, kind-swapped, cross-site and malformed cookies are refused', async () => {
  reset();
  const now = Date.now(), p = cookieOf(await A.makeCookie({ kind: 'person', id: 'abc123def', ver: 'ver123456' }, now));
  assert.ok(await A.readSession(req('/', { cookie: p }), now + 13 * 86400e3));
  assert.equal(await A.readSession(req('/', { cookie: p }), now + 15 * 86400e3), null);
  const [name, rest] = [p.split('=')[0], p.split('=').slice(1).join('=')], [who, exp, sig] = rest.split('.');
  assert.equal(await A.readSession(req('/', { cookie: `${name}=${who}.${Number(exp) + 99999999}.${sig}` })), null);          // longer expiry
  assert.equal(await A.readSession(req('/', { cookie: `${name}=${who.replace('abc123def', 'zzz123def')}.${exp}.${sig}` })), null); // someone else's id
  assert.equal(await A.readSession(req('/', { cookie: `${name}=${who.replace('p:', 'a:')}.${exp}.${sig}` })), null);          // person turned admin
  assert.equal(await A.readSession(req('/', { cookie: `${name}=${who}.${exp}.${sig.slice(0, -2)}AA` })), null);
  for (const junk of ['', `${name}=`, `${name}=a.b.c`, `${name}=..`, `${name}=${who}.${exp}`, `${name}=${who}.-5.${sig}`, `${name}=${who}.1e9.${sig}`, `${name}=a::.${exp}.${sig}`, 'other=' + rest]) assert.equal(await A.readSession(req('/', { cookie: junk })), null, junk);
  const other = cookieOf(await A.makeCookie({ kind: 'admin' }, now, 'some-other-site')); assert.equal(await A.readSession(req('/', { cookie: other })), null);
  env.SESSION_SECRET = 'a-different-long-session-secret-9876543210'; assert.equal(await A.readSession(req('/', { cookie: p }), now), null);
});
test('auth: changing the admin passcode signs admin sessions out', async () => {
  reset(); const c = await asAdmin(); assert.deepEqual(await A.readSession(req('/', { cookie: c })), { kind: 'admin' });
  env.ADMIN_PASSCODE = 'a-brand-new-admin-code'; assert.equal(await A.readSession(req('/', { cookie: c })), null);
});

/* ---------------- people store ---------------- */
test('people: create, find by name (any case), unique names, reset, remove', async () => {
  reset();
  const rec = await P.createPerson('  Ana   Lopez ', 'rakobu47');
  assert.equal(rec.name, 'Ana Lopez'); assert.ok(rec.hash && rec.salt && rec.ver && !JSON.stringify(rec).includes('rakobu47'));
  assert.equal((await P.findByName('ANA LOPEZ')).id, rec.id);
  assert.match((await P.createPerson('ana lopez', 'another-code')).error, /already/);
  for (const bad of ['', '   ', 'x'.repeat(41), 'bad\u0007name']) assert.ok((await P.createPerson(bad, 'rakobu47')).error, JSON.stringify(bad));
  const reset1 = await P.resetPasscode(rec.id, 'newcode99'); assert.notEqual(reset1.ver, rec.ver); assert.notEqual(reset1.hash, rec.hash);
  assert.equal(await P.resetPasscode('nope-nope-1', 'newcode99'), null);
  assert.equal(await P.removePerson(rec.id), true); assert.equal(await P.findByName('Ana Lopez'), null); assert.equal(await P.getPerson(rec.id), null); assert.equal(await P.removePerson(rec.id), false);
  assert.ok(!(await P.createPerson('Ana Lopez', 'rakobu47')).error);   // the name is free again
});
test('people: the public view never has a hash or salt, and ids are validated', async () => {
  reset(); const rec = await P.createPerson('Bo', 'rakobu47'), v = P.publicView(rec);
  assert.deepEqual(Object.keys(v).sort(), ['created', 'id', 'name', 'updatedAt']);
  for (const id of ['', '../x', 'a b', 'x'.repeat(50), null, undefined, {}]) assert.equal(await P.getPerson(id), null);
});

/* ---------------- login ---------------- */
test('login: blank name + admin passcode signs in the admin; a person signs in with name + their passcode', async () => {
  reset(); await P.createPerson('Ana Lopez', 'rakobu47');
  let { r } = await signInAs('', 'admin-passcode-42');
  assert.equal(r.status, 200); assert.equal((await r.json()).role, 'admin'); assert.match(r.headers.get('set-cookie'), /^__Host-fs_gate=.+HttpOnly; Secure; SameSite=Lax/); assert.equal(r.headers.get('cache-control'), 'no-store');
  ({ r } = await signInAs('ana lopez', 'rakobu47')); assert.equal(r.status, 200); assert.deepEqual(await r.json(), { role: 'person', name: 'Ana Lopez' });
});
test('login: wrong name, wrong passcode, a person using the admin passcode, and empty values all get the same refusal', async () => {
  reset(); await P.createPerson('Ana Lopez', 'rakobu47');
  const bodies = [await signInAs('Ana Lopez', 'wrong-code'), await signInAs('Nobody', 'rakobu47'), await signInAs('Ana Lopez', 'admin-passcode-42'), await signInAs('', 'rakobu47'), await signInAs('Ana Lopez', ''), await signInAs('', ''), await signInAs('', 'x'.repeat(500))];
  const texts = [];
  for (const { r, cookie } of bodies) { assert.equal(r.status, 401); assert.equal(cookie, null); texts.push(await r.text()); }
  assert.equal(new Set(texts).size, 1, 'the reply does not reveal which part was wrong');
});
test('login: other methods, bad bodies, other sites, the default route, a storage failure and not-configured', async () => {
  reset();
  const ok = { 'content-type': 'application/json' }, body = { name: '', passcode: 'admin-passcode-42' };
  assert.equal((await login(req('/auth/login'))).status, 405);
  assert.equal((await login(req('/auth/login', { method: 'POST', body: 'not json' }))).status, 400);
  assert.equal((await login(req('/auth/login', { method: 'POST', headers: { ...ok, origin: 'https://evil.test' }, body }))).status, 403);
  assert.equal((await login(req('/auth/login', { method: 'POST', headers: { ...ok, origin: SITE }, body }))).status, 200);
  assert.equal((await login(req('/auth/login', { method: 'POST', headers: ok, body: { name: '', passcode: 'x'.repeat(5000) } }))).status, 413);
  assert.equal((await login(req('/.netlify/functions/login', { method: 'POST', headers: ok, body }))).status, 404);
  assert.equal((await login(req('/anything', { method: 'POST', headers: ok, body }))).status, 200);
  P.setStore({ get() { throw new Error('down'); }, list() { throw new Error('down'); } });
  assert.equal((await login(req('/auth/login', { method: 'POST', headers: ok, body: { name: 'Ana', passcode: 'rakobu47' } }))).status, 503);
  assert.equal((await login(req('/auth/login', { method: 'POST', headers: ok, body }))).status, 200);   // the admin does not need storage
  reset(); env.SESSION_SECRET = ''; const r = await login(req('/auth/login', { method: 'POST', headers: ok, body })); assert.equal(r.status, 503); assert.equal(r.headers.get('set-cookie'), null);
});
test('login: it is rate limited per IP (the limit is declared)', () => {
  assert.equal(loginConfig.path, '/auth/login'); assert.deepEqual(loginConfig.rateLimit, { windowLimit: 10, windowSize: 60, aggregateBy: ['ip', 'domain'] });
});

/* ---------------- session check, logout ---------------- */
test('session: valid for the admin and for a person; invalid after a reset or removal; no cookie is refused', async () => {
  reset(); const rec = await P.createPerson('Ana', 'rakobu47');
  const { cookie } = await signInAs('Ana', 'rakobu47'), adminCookie = await asAdmin();
  assert.equal((await session(req('/auth/session', { cookie: adminCookie }))).status, 200);
  let r = await session(req('/auth/session', { cookie })); assert.equal(r.status, 200); assert.deepEqual(await r.json(), { role: 'person', name: 'Ana' });
  assert.equal((await session(req('/auth/session'))).status, 401);
  await P.resetPasscode(rec.id, 'newcode99'); r = await session(req('/auth/session', { cookie })); assert.equal(r.status, 401); assert.match(r.headers.get('set-cookie'), /Max-Age=0/);
  const again = (await signInAs('Ana', 'newcode99')).cookie; assert.equal((await session(req('/auth/session', { cookie: again }))).status, 200);
  await P.removePerson(rec.id); assert.equal((await session(req('/auth/session', { cookie: again }))).status, 401);
  assert.equal((await session(req('/auth/session', { method: 'POST', cookie: adminCookie }))).status, 405);
  assert.equal((await session(req('/.netlify/functions/session', { cookie: adminCookie }))).status, 404);
  env.ADMIN_PASSCODE = ''; assert.equal((await session(req('/auth/session', { cookie: adminCookie }))).status, 503);
});
test('logout: clears the cookie, from this site only', async () => {
  reset();
  let r = await logout(req('/auth/logout', { method: 'POST', headers: { origin: SITE } })); assert.equal(r.status, 200); assert.match(r.headers.get('set-cookie'), /__Host-fs_gate=; .*Max-Age=0/);
  assert.equal((await logout(req('/auth/logout', { method: 'POST', headers: { origin: 'https://evil.test' } }))).status, 403);
  assert.equal((await logout(req('/auth/logout', { method: 'POST' }))).status, 403);
  assert.equal((await logout(req('/auth/logout'))).status, 405);
});

/* ---------------- admin API ---------------- */
test('admin: refused without a cookie, for a person, and without a same-site Origin', async () => {
  reset(); await P.createPerson('Ana', 'rakobu47'); const personCookie = (await signInAs('Ana', 'rakobu47')).cookie, adminCookie = await asAdmin();
  assert.equal((await adminCall(null, { action: 'list' })).status, 401);
  assert.equal((await adminCall(personCookie, { action: 'list' })).status, 403);
  assert.equal((await adminCall(adminCookie, { action: 'list' }, { 'content-type': 'application/json' })).status, 403);                        // no Origin
  assert.equal((await adminCall(adminCookie, { action: 'list' }, { origin: 'https://evil.test', 'content-type': 'application/json' })).status, 403);
  assert.equal((await admin(req('/auth/admin', { cookie: adminCookie }))).status, 405);
  assert.equal((await admin(req('/.netlify/functions/admin', { method: 'POST', cookie: adminCookie, headers: origin, body: { action: 'list' } }))).status, 404);
  assert.equal((await adminCall(adminCookie, { action: 'list' })).status, 200);
  assert.equal(adminConfig.path, '/auth/admin');
});
test('admin: add, list, new passcode, remove, and the effect on that person\'s sign-in', async () => {
  reset(); const c = await asAdmin();
  let r = await adminCall(c, { action: 'create', name: 'Ana Lopez', passcode: 'rakobu47' }); assert.equal(r.status, 201);
  const id = (await r.json()).person.id;
  r = await adminCall(c, { action: 'list' }); const text = await r.text(); const list = JSON.parse(text).people;
  assert.equal(list.length, 1); assert.equal(list[0].name, 'Ana Lopez'); assert.ok(!/hash|salt|rakobu47|"ver"/.test(text), 'the list never contains a hash, salt, version or passcode');
  const first = await signInAs('Ana Lopez', 'rakobu47'); assert.equal(first.r.status, 200);
  assert.equal((await adminCall(c, { action: 'create', name: 'ana lopez', passcode: 'another-code' })).status, 409);
  assert.equal((await adminCall(c, { action: 'reset', id, passcode: 'newcode99' })).status, 200);
  assert.equal((await signInAs('Ana Lopez', 'rakobu47')).r.status, 401);                                                                    // the old passcode is dead
  assert.equal((await session(req('/auth/session', { cookie: first.cookie }))).status, 401);                                                 // and so is her old session
  assert.equal((await signInAs('Ana Lopez', 'newcode99')).r.status, 200);
  assert.equal((await adminCall(c, { action: 'remove', id })).status, 200);
  assert.equal((await signInAs('Ana Lopez', 'newcode99')).r.status, 401);
  assert.equal((await adminCall(c, { action: 'remove', id })).status, 404); assert.equal((await adminCall(c, { action: 'reset', id, passcode: 'newcode99' })).status, 404);
});
test('admin: bad input is refused in plain words, and nothing odd gets stored', async () => {
  reset(); const c = await asAdmin();
  for (const [b, status] of [[{ action: 'create', name: 'Bo', passcode: 'short' }, 400], [{ action: 'create', name: 'Bo', passcode: ' spaced-code ' }, 400], [{ action: 'create', name: 'Bo', passcode: 'x'.repeat(65) }, 400], [{ action: 'create', name: '', passcode: 'rakobu47' }, 400], [{ action: 'create', name: 'x'.repeat(41), passcode: 'rakobu47' }, 400], [{ action: 'create', name: 'Bo' }, 400], [{ action: 'create', name: 'Bo', passcode: 12345678 }, 400], [{ action: 'reset', id: 'abcdef123', passcode: 'short' }, 400], [{ action: 'nope' }, 400], [{}, 400], [null, 400]]) {
    const r = await adminCall(c, b); assert.equal(r.status, status, JSON.stringify(b));
  }
  assert.equal((await adminCall(c, 'not json')).status, 400);
  assert.equal((await adminCall(c, { action: 'list', pad: 'x'.repeat(9000) })).status, 413);
  assert.equal((await P.listPeople()).length, 0);
});
test('admin: a storage failure is reported, not a crash', async () => {
  reset(); const c = await asAdmin(); P.setStore({ get() { throw new Error('down'); }, list() { throw new Error('down'); }, set() { throw new Error('down'); } });
  assert.equal((await adminCall(c, { action: 'list' })).status, 503);
});

/* ---------------- the gate ---------------- */
const withSessionCheck = (impl) => { const calls = []; globalThis.fetch = async (url, init) => { calls.push({ url: String(url), cookie: init?.headers?.cookie }); return impl(url, init); }; return calls; };
const viaSessionFn = async (url, init) => session(new Request(String(url), { headers: init?.headers || {} }));
test('gate: no cookie means the sign-in page and the site is NEVER fetched', async () => {
  reset();
  for (const [url, method] of [['/', 'GET'], ['/js/app.js', 'GET'], ['/index.html', 'GET'], ['/', 'POST'], ['/anything/else', 'GET'], ['/%2e%2e/js/app.js', 'GET'], ['/admin/', 'GET'], ['/admin/admin.js', 'GET']]) {
    const ctx = next(), r = await gate(req(url, { method }), ctx), t = await r.text();
    assert.equal(r.status, 401, url + ' ' + method); assert.equal(ctx.calls, 0); assert.ok(!t.includes('THE SITE')); assert.match(t, /Passcode/); assert.ok(t.includes(WORDS.nameLabel));
    assert.match(r.headers.get('content-security-policy'), /connect-src 'self'/); assert.equal(r.headers.get('cache-control'), 'private, no-store');
    for (const h of ['strict-transport-security', 'cross-origin-opener-policy', 'cross-origin-resource-policy', 'permissions-policy', 'x-frame-options']) assert.ok(r.headers.get(h), h);
  }
});
test('gate: only the exact open paths pass without a cookie; look-alikes are gated', async () => {
  reset(); const ctx = next();
  for (const p of ['/auth/login', '/auth/logout', '/auth/session', '/auth/admin', '/auth/gate.js', '/auth/gate.css', '/manifest.webmanifest', '/icons/icon-192.png', '/icons/icon-512.png', '/icons/icon-maskable-512.png', '/icons/apple-touch-icon.png']) await gate(req(p), ctx);
  assert.equal(ctx.calls, 11);
  for (const p of ['/manifest.webmanifest/', '/manifest.webmanifest.bak', '/icons/', '/icons/icon-192.png/', '/icons/icon-192.png%2f..%2findex.html', '/icons/..%2findex.html', '/icons/x.png', '/ICONS/icon-192.png', '/auth/', '/auth', '/auth/x', '/auth/..%2findex.html', '/auth/%2e%2e%2findex.html', '/auth/%2fx', '/auth/gate.js/', '/auth/gate.jsx', '/auth//login', '/AUTH/login', '/auth/login/', '/auth/admin/', '/auth/admin/people', '/.netlify/functions/login', '/.netlify/functions/admin']) {
    const c2 = next(), r = await gate(req(p), c2); assert.equal(r.status, 401, p); assert.equal(c2.calls, 0, p);
  }
  assert.equal(gateConfig.path, '/*'); assert.deepEqual(gateConfig.excludedPath, ['/auth/login', '/auth/logout', '/auth/session', '/auth/admin', '/auth/gate.js', '/auth/gate.css', '/manifest.webmanifest', '/icons/icon-192.png', '/icons/icon-512.png', '/icons/icon-maskable-512.png', '/icons/apple-touch-icon.png']);
});
test('gate: a person with a good code is let in; every request is checked against the stored record', async () => {
  reset(); await P.createPerson('Ana', 'rakobu47'); const { cookie } = await signInAs('Ana', 'rakobu47'); const calls = withSessionCheck(viaSessionFn);
  let ctx = next(), r = await gate(req('/', { cookie, headers: { accept: 'text/html' } }), ctx);
  assert.equal(ctx.calls, 1); assert.equal(await r.text(), 'THE SITE'); assert.equal(calls.length, 1); assert.match(calls[0].url, /\/auth\/session$/); assert.equal(calls[0].cookie, cookie);
  ctx = next(); await gate(req('/js/app.js', { cookie, headers: { accept: '*/*' } }), ctx);              // a script file is checked too
  assert.equal(ctx.calls, 1); assert.equal(calls.length, 2);
  ctx = next(); await gate(req('/', { method: 'POST', cookie }), ctx);                                   // a post is checked
  assert.equal(ctx.calls, 1); assert.equal(calls.length, 3);
});
test('gate: removing or resetting a person locks them out of the next page load and post at once', async () => {
  reset(); const rec = await P.createPerson('Ana', 'rakobu47'); const { cookie } = await signInAs('Ana', 'rakobu47'); withSessionCheck(viaSessionFn);
  await P.resetPasscode(rec.id, 'newcode99');
  let ctx = next(), r = await gate(req('/', { cookie, headers: { accept: 'text/html' } }), ctx); assert.equal(r.status, 401); assert.equal(ctx.calls, 0); assert.match(await r.text(), /Passcode/);
  ctx = next(); assert.equal((await gate(req('/', { method: 'POST', cookie }), ctx)).status, 401); assert.equal(ctx.calls, 0);
  const fresh = (await signInAs('Ana', 'newcode99')).cookie; ctx = next(); await gate(req('/', { cookie: fresh, headers: { accept: 'text/html' } }), ctx); assert.equal(ctx.calls, 1);
  await P.removePerson(rec.id); ctx = next(); assert.equal((await gate(req('/', { cookie: fresh, headers: { 'sec-fetch-mode': 'navigate' } }), ctx)).status, 401); assert.equal(ctx.calls, 0);
});
test('gate: if the check cannot be made, a person is not let in (fails closed); the admin never needs it', async () => {
  reset(); await P.createPerson('Ana', 'rakobu47'); const { cookie } = await signInAs('Ana', 'rakobu47');
  globalThis.fetch = async () => { throw new Error('network'); };
  let ctx = next(); assert.equal((await gate(req('/', { cookie, headers: { accept: 'text/html' } }), ctx)).status, 401); assert.equal(ctx.calls, 0);
  const a = await asAdmin(); ctx = next(); await gate(req('/', { cookie: a, headers: { accept: 'text/html' } }), ctx); assert.equal(ctx.calls, 1);
});
test('gate: the /admin area is for the admin only, however the path is written', async () => {
  reset(); await P.createPerson('Ana', 'rakobu47'); const { cookie } = await signInAs('Ana', 'rakobu47'); withSessionCheck(viaSessionFn); const a = await asAdmin();
  for (const p of ['/admin/', '/admin', '/admin/index.html', '/admin/admin.js', '/Admin/', '/%61dmin/', '/%41dmin/index.html', '/x/..%2fadmin/', '//admin/', '/ADMIN/admin.js']) {
    let ctx = next(), r = await gate(req(p, { cookie, headers: { accept: 'text/html' } }), ctx); assert.equal(r.status, 403, p); assert.equal(ctx.calls, 0, p); const body403 = await r.text(); assert.match(body403, /Admins only/); assert.match(body403, /class="band"[\s\S]*Finance Sense/, 'the Finance Sense banner is on the admins-only page');
    ctx = next(); await gate(req(p, { cookie: a, headers: { accept: 'text/html' } }), ctx); assert.equal(ctx.calls, 1, p);
  }
});
test('gate: a bad, expired or old-passcode admin cookie is the same as no cookie; not configured fails closed even with a cookie', async () => {
  reset(); const good = await asAdmin();
  for (const c of ['__Host-fs_gate=a.b.c', good.slice(0, -3) + 'abc', '']) { const ctx = next(); assert.equal((await gate(req('/', { cookie: c }), ctx)).status, 401); assert.equal(ctx.calls, 0); }
  env.ADMIN_PASSCODE = 'changed-admin-code'; let ctx = next(); assert.equal((await gate(req('/', { cookie: good }), ctx)).status, 401); assert.equal(ctx.calls, 0);
  reset(); const c2 = await asAdmin(); env.ADMIN_PASSCODE = ''; ctx = next(); const r = await gate(req('/', { cookie: c2 }), ctx), t = await r.text();
  assert.equal(r.status, 503); assert.equal(ctx.calls, 0); assert.match(t, /not set up yet/); assert.ok(!/<form/.test(t)); assert.ok(!/SESSION_SECRET|ADMIN_PASSCODE/.test(t), 'the public page does not name the settings');
});
test('gate: HEAD gets headers only; the sign-in page has no inline script or style and no secrets', async () => {
  reset(); const r = await gate(req('/', { method: 'HEAD' }), next()); assert.equal(r.status, 401); assert.equal(await r.text(), '');
  const html = signInPage(true);
  assert.ok(!/<script(?![^>]*\ssrc=)/.test(html) && !/style=|onclick=|onsubmit=/.test(html));
  assert.ok(!html.includes(env.ADMIN_PASSCODE) && !html.includes(env.SESSION_SECRET));
});

test('gate: every page the gate itself serves declares the home-screen icon, manifest and theme colour, all on the open list, and its policy allows them', async () => {
  reset(); const open = gateConfig.excludedPath;
  const r = await gate(req('/some/deep/address', { headers: { accept: 'text/html' } }), next()); assert.equal(r.status, 401); const pages = [['sign-in', await r.text()]];
  await P.createPerson('Ana', 'rakobu47'); const { cookie } = await signInAs('Ana', 'rakobu47'); withSessionCheck(viaSessionFn);
  const r2 = await gate(req('/admin/', { cookie, headers: { accept: 'text/html' } }), next()); assert.equal(r2.status, 403); pages.push(['admins-only', await r2.text()]);
  for (const [name, html] of pages) {
    assert.match(html, /<link rel="apple-touch-icon" href="\/icons\/apple-touch-icon\.png">/, name + ' page: the iPhone home-screen icon (without it iOS shows a plain letter tile)');
    assert.match(html, /<link rel="manifest" href="\/manifest\.webmanifest">/, name); assert.match(html, /<meta name="theme-color" content="#[0-9a-f]{6}">/i, name);
    const hrefs = [...html.matchAll(/<link rel="(?:icon|apple-touch-icon|manifest)"[^>]*href="([^"]+)"/g)].map((m) => m[1]); assert.ok(hrefs.length >= 3, name);
    for (const h of hrefs) { assert.ok(h.startsWith('/'), name + ': absolute path, because this page is served at any address: ' + h); assert.ok(open.includes(h), name + ': ' + h + ' must be reachable without a cookie'); }
  }
  const csp = r.headers.get('content-security-policy'); assert.match(csp, /manifest-src 'self'(;|$)/); assert.match(csp, /img-src 'self'/); assert.doesNotMatch(csp, /https?:|\*/);
});

/* ---------------- fixes from review ---------------- */
test('gate: a removed or reset person gets nothing, whatever headers the request carries (curl-style Accept, no Accept, any method)', async () => {
  reset(); const rec = await P.createPerson('Ana', 'rakobu47'); const { cookie } = await signInAs('Ana', 'rakobu47'); withSessionCheck(viaSessionFn);
  await P.removePerson(rec.id);
  for (const [url, headers, method] of [['/', { accept: '*/*' }, 'GET'], ['/index.html', { accept: '*/*' }, 'GET'], ['/js/app.js', {}, 'GET'], ['/css/styles.css', { accept: 'text/css' }, 'GET'], ['/', { accept: 'text/html' }, 'GET'], ['/', {}, 'HEAD'], ['/', {}, 'POST']]) {
    const ctx = next(), r = await gate(req(url, { cookie, headers, method }), ctx); assert.equal(r.status, 401, `${method} ${url} ${JSON.stringify(headers)}`); assert.equal(ctx.calls, 0);
  }
});
test('gate: a good answer is remembered for a few seconds per cookie, a bad one never is, and the memory expires', async () => {
  reset(); const rec = await P.createPerson('Ana', 'rakobu47'); const { cookie } = await signInAs('Ana', 'rakobu47'); const calls = withSessionCheck(viaSessionFn); setCacheSeconds(10);
  const t0 = Date.now(); const realNow = Date.now; Date.now = () => t0;
  try {
    await gate(req('/', { cookie }), next()); await gate(req('/js/app.js', { cookie }), next()); await gate(req('/css/styles.css', { cookie }), next());
    assert.equal(calls.length, 1, 'one check for a page and its files');
    Date.now = () => t0 + 9000; await gate(req('/', { cookie }), next()); assert.equal(calls.length, 1);
    Date.now = () => t0 + 11000; await gate(req('/', { cookie }), next()); assert.equal(calls.length, 2, 'checked again after 10 seconds');
    await P.removePerson(rec.id); Date.now = () => t0 + 22000;
    const ctx = next(); assert.equal((await gate(req('/', { cookie }), ctx)).status, 401); assert.equal(ctx.calls, 0);
    Date.now = () => t0 + 22500; assert.equal((await gate(req('/', { cookie }), next())).status, 401); assert.equal(calls.length, 4, 'a refusal is never remembered');
  } finally { Date.now = realNow; }
});
test('gate: a path that will not decode is treated as the admin area (people refused, the admin let through); admin pages are never cached by the browser', async () => {
  reset(); await P.createPerson('Ana', 'rakobu47'); const { cookie } = await signInAs('Ana', 'rakobu47'); withSessionCheck(viaSessionFn); const a = await asAdmin();
  let ctx = next(), r = await gate(req('/%zz/%61dmin/', { cookie }), ctx); assert.equal(r.status, 403); assert.equal(ctx.calls, 0);
  ctx = next(); r = await gate(req('/%zz/%61dmin/', { cookie: a }), ctx); assert.equal(ctx.calls, 1);
  ctx = next(); r = await gate(req('/admin/', { cookie: a }), ctx); assert.equal(r.headers.get('cache-control'), 'no-store');
  ctx = next(); r = await gate(req('/', { cookie: a }), ctx); assert.equal(r.headers.get('cache-control'), null, 'ordinary pages keep the site\'s own caching');
});
test('auth: a PERSON cookie made for another site is refused (the site binding is tested on its own)', async () => {
  reset(); const other = cookieOf(await A.makeCookie({ kind: 'person', id: 'abc123def', ver: 'ver123456' }, Date.now(), 'some-other-site'));
  assert.equal(await A.readSession(req('/', { cookie: other })), null);
  assert.ok(await A.readSession(req('/', { cookie: cookieOf(await A.makeCookie({ kind: 'person', id: 'abc123def', ver: 'ver123456' })) })));
});
test('auth: an admin session is 12 hours', async () => {
  reset(); const now = Date.now(), c = cookieOf(await A.makeCookie({ kind: 'admin' }, now));
  assert.ok(await A.readSession(req('/', { cookie: c }), now + 11 * 3600e3)); assert.equal(await A.readSession(req('/', { cookie: c }), now + 13 * 3600e3), null);
});
test('people: a failed add does not leave the name blocked, and the name can be used again', async () => {
  reset(); const store = fakeStore(), realSetJSON = store.setJSON; P.setStore(store); let fail = true;
  store.setJSON = async (...a) => { if (fail) { fail = false; throw new Error('storage hiccup'); } return realSetJSON(...a); };
  await assert.rejects(P.createPerson('Ana', 'rakobu47'), /hiccup/);
  assert.ok(![...store.m.keys()].some((k) => k.startsWith('n/')), 'the name was released');
  assert.ok(!(await P.createPerson('Ana', 'rakobu47')).error);
});
test('people: a failed remove never blocks a name: step one failing changes nothing, step two failing leaves a listed person who cannot sign in and can be removed', async () => {
  reset(); const store = fakeStore(); P.setStore(store); const realDelete = store.delete;
  const bo = await P.createPerson('Bo', 'rakobu47');
  store.delete = async (k) => { if (k.startsWith('n/')) throw new Error('hiccup'); return realDelete(k); };      // the name delete fails: nothing was removed
  await assert.rejects(P.removePerson(bo.id), /hiccup/); store.delete = realDelete;
  assert.equal((await P.findByName('Bo')).id, bo.id, 'still fully there');
  store.delete = async (k) => { if (k.startsWith('p/')) throw new Error('hiccup'); return realDelete(k); };      // the record delete fails after the name went
  await assert.rejects(P.removePerson(bo.id), /hiccup/); store.delete = realDelete;
  assert.equal(await P.findByName('Bo'), null, 'cannot sign in');
  assert.equal((await P.listPeople()).length, 1, 'still listed, so the admin can finish the job');
  assert.equal(await P.removePerson(bo.id), true); assert.equal((await P.listPeople()).length, 0);
  assert.ok(!(await P.createPerson('Bo', 'rakobu47')).error, 'and the name was never blocked');
});
test('people: removing never deletes someone else\'s name, and a reset cannot bring back a removed person', async () => {
  reset(); const store = fakeStore(); P.setStore(store);
  const a = await P.createPerson('Erin', 'rakobu47'); const ghost = { ...JSON.parse(store.m.get(`p/${a.id}`)) };
  await P.removePerson(a.id); const b = await P.createPerson('Erin', 'newcode99');
  store.m.set(`p/${a.id}`, JSON.stringify(ghost));                                                     // a late write puts the old record back
  assert.equal(await P.resetPasscode(a.id, 'zzzzzzzz9'), null, 'a leftover record is not reset');
  assert.equal(await P.removePerson(a.id), true);                                                      // removing the ghost...
  assert.equal((await P.findByName('Erin')).id, b.id, '...leaves the real Erin and her name alone');
});
test('login: unknown and known names cost the same reads; the body size is the real size; the origin must match in full', async () => {
  reset(); await P.createPerson('Ana', 'rakobu47'); const store = fakeStore(); const inner = (await import('./fake-store.mjs')).fakeStore();
  let reads = 0; const spy = { ...inner, async get(...a) { reads++; return inner.get(...a); } }; P.setStore(spy); await P.createPerson('Ana', 'rakobu47');
  const readsFor = async (name) => { reads = 0; await signInAs(name, 'whatever-code'); return reads; };
  assert.equal(await readsFor('Ana'), await readsFor('Nobody'), 'the same number of storage reads either way');
  const big = JSON.stringify({ name: 'a'.repeat(3000), passcode: 'x' });
  assert.equal((await login(req('/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: big }))).status, 413);   // no content-length needed
  assert.equal((await login(req('/auth/login', { method: 'POST', headers: { origin: 'http://site.test', 'content-type': 'application/json' }, body: { name: '', passcode: 'admin-passcode-42' } }))).status, 403, 'the scheme must match too');
  const c = await asAdmin();
  assert.equal((await adminCall(c, { action: 'create', name: 'a'.repeat(5000), passcode: 'rakobu47' })).status, 413);
});
test('every page may reach only its own site (connect-src \'self\', no other host), in both the page and the headers', async () => {
  const fs = await import('node:fs'), url = await import('node:url'), path = await import('node:path');
  const root = path.join(path.dirname(url.fileURLToPath(import.meta.url)), '..');
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8'), headers = fs.readFileSync(path.join(root, '_headers'), 'utf8');
  const meta = html.match(/Content-Security-Policy"\s+content="([^"]+)"/)[1];
  assert.match(headers, /connect-src 'self'/);
  assert.match(meta, /connect-src 'self'(;|$)/, 'the page may reach its own site only (the version check, sign-in and admin tools), never another host');
  assert.match(headers, /connect-src 'self'(;|\s|$)/);
});

test('people: two creates of the same name at the same moment give exactly one person', async () => {
  reset(); const results = await Promise.all([P.createPerson('Ana', 'rakobu47'), P.createPerson('ana', 'zapofe83'), P.createPerson('ANA', 'tamuki29')]);
  assert.equal(results.filter((r) => !r.error).length, 1, 'exactly one wins');
  assert.equal((await P.listPeople()).length, 1, 'and exactly one record is left');
  const winner = results.find((r) => !r.error); assert.equal((await P.findByName('Ana')).id, winner.id);
  assert.equal(await P.resetPasscode(winner.id, 'newcode99') !== null, true, 'the winner can be managed normally');
});
test('origin: the page must be the same host and on HTTPS (or localhost); the scheme the platform reports for the request is not relied on', async () => {
  reset(); const c = await asAdmin(), body = { action: 'list' };
  const call = (url, originHeader) => admin(new Request(url, { method: 'POST', headers: { cookie: c, 'content-type': 'application/json', ...(originHeader ? { origin: originHeader } : {}) }, body: JSON.stringify(body) }));
  assert.equal((await call('https://site.test/auth/admin', 'https://site.test')).status, 200);
  assert.equal((await call('http://site.test/auth/admin', 'https://site.test')).status, 200, 'behind a proxy the function may see http while the browser is on https');
  assert.equal((await call('https://site.test/auth/admin', 'http://site.test')).status, 403, 'a plain-http page is not trusted');
  assert.equal((await call('https://site.test/auth/admin', 'https://other.test')).status, 403);
  assert.equal((await call('https://site.test/auth/admin', 'https://site.test:8443')).status, 403, 'another port');
  assert.equal((await call('https://site.test/auth/admin', 'https://evilsite.test')).status, 403);
  assert.equal((await call('https://site.test/auth/admin', 'null')).status, 403);
  assert.equal((await call('https://site.test/auth/admin', undefined)).status, 403);
  assert.equal((await call('http://localhost:8913/auth/admin', 'http://localhost:8913')).status, 200, 'local testing');
});

test('people: a create held between its two writes cannot be mistaken for a leftover (deterministic race)', async () => {
  reset(); const store = fakeStore(); P.setStore(store); const realSetJSON = store.setJSON; let release, first = true;
  const hold = new Promise((r) => { release = r; });
  store.setJSON = async (...a) => { if (first && String(a[0]).startsWith('p/')) { first = false; await hold; } return realSetJSON(...a); };   // the first create is held mid-way
  const pA = P.createPerson('Ana', 'rakobu47');
  await new Promise((r) => setTimeout(r, 400));                                                          // A has hashed and is waiting at its first write
  const rB = await P.createPerson('ana', 'zapofe83');                                                    // B runs to the end meanwhile
  release(); const rA = await pA;
  assert.ok(!rB.error, 'B finished first and holds the name'); assert.match(rA.error, /already/, 'A, arriving late, is told the name is taken');
  assert.equal((await P.listPeople()).length, 1, 'one record, not two'); assert.equal((await P.findByName('Ana')).id, rB.id);
});
