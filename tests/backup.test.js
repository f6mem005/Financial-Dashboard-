const test = require('node:test');
const assert = require('node:assert/strict');
['util', 'catalog', 'config', 'engine', 'store', 'sample', 'backup'].forEach((m) => require('../js/' + m + '.js'));
const FD = globalThis.FD, B = FD.backup;
const NOW = new Date(2026, 10, 5);
function real() { const s = FD.sample.build(NOW); s.mode = 'real'; s.onboarded = true; return s; }
const same = (a, b) => assert.deepEqual(JSON.parse(JSON.stringify(a)), JSON.parse(JSON.stringify(b)));

test('plain backup round-trips the whole state', async () => {
  const s = real(), made = await B.make(s, '');
  assert.equal(made.locked, false);
  const got = await B.open(B.inspect(made.text), '');
  same(got, FD.store.sanitize(JSON.parse(JSON.stringify(s))));
  assert.equal(got.transactions.length, s.transactions.length);
});
test('locked backup hides the contents and needs the right passphrase', async () => {
  const s = real(), made = await B.make(s, 'correct horse battery');
  assert.equal(made.locked, true);
  const wrapper = JSON.parse(made.text);
  assert.deepEqual(Object.keys(wrapper).sort(), ['cipher', 'data', 'format', 'kdf', 'version'], 'only the envelope is readable');
  assert.ok(!made.text.includes('Pizza night') && !made.text.includes('"transactions"') && !made.text.includes('"answers"'), 'no readable field names or text');   // (random-looking encrypted text can contain short words by chance, so only long, specific strings are checked)
  const found = B.inspect(made.text); assert.equal(found.locked, true);
  const got = await B.open(found, 'correct horse battery');
  assert.equal(got.transactions.length, s.transactions.length);
  await assert.rejects(B.open(found, 'wrong passphrase'), /Wrong passphrase/);
  await assert.rejects(B.open(found, ''), /Enter the passphrase/);
});
test('two locked backups of the same data differ (fresh salt and iv each time)', async () => {
  const s = real(), a = await B.make(s, 'passphrase one'), b = await B.make(s, 'passphrase one');
  assert.notEqual(JSON.parse(a.text).data, JSON.parse(b.text).data);
  assert.notEqual(JSON.parse(a.text).kdf.salt, JSON.parse(b.text).kdf.salt);
});
test('short passphrase is refused when making a backup', async () => {
  await assert.rejects(B.make(real(), 'short'), /at least 8/);
});
test('a locked file that was changed is rejected, not half-read', async () => {
  const o = JSON.parse((await B.make(real(), 'correct horse battery')).text);
  const bytes = Buffer.from(o.data, 'base64'); bytes[20] ^= 1; o.data = bytes.toString('base64');
  await assert.rejects(B.open(B.inspect(JSON.stringify(o)), 'correct horse battery'), /Wrong passphrase, or the file was changed/);
  const o2 = JSON.parse((await B.make(real(), 'correct horse battery')).text); o2.format = 'finance-sense-backup-locked'; o2.cipher.iv = Buffer.alloc(12).toString('base64');
  await assert.rejects(B.open(B.inspect(JSON.stringify(o2)), 'correct horse battery'), /Wrong passphrase/);
});
test('the format name is bound into the encryption (AAD): the data only opens with it', async () => {
  const o = JSON.parse((await B.make(real(), 'correct horse battery')).text);
  assert.equal(o.kdf.name, 'PBKDF2-SHA256'); assert.equal(o.cipher.name, 'AES-256-GCM'); assert.ok(o.kdf.iterations >= 600000);
  const subtle = globalThis.crypto.subtle, enc = new TextEncoder();
  const base = await subtle.importKey('raw', enc.encode('correct horse battery'), 'PBKDF2', false, ['deriveKey']);
  const key = await subtle.deriveKey({ name: 'PBKDF2', salt: Buffer.from(o.kdf.salt, 'base64'), iterations: o.kdf.iterations, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
  const iv = Buffer.from(o.cipher.iv, 'base64'), data = Buffer.from(o.data, 'base64');
  const ok = await subtle.decrypt({ name: 'AES-GCM', iv, additionalData: enc.encode('finance-sense-backup-locked') }, key, data);
  assert.match(new TextDecoder().decode(ok), /finance-sense-backup/);
  await assert.rejects(subtle.decrypt({ name: 'AES-GCM', iv, additionalData: enc.encode('something-else') }, key, data));
  await assert.rejects(subtle.decrypt({ name: 'AES-GCM', iv }, key, data));
});
test('passphrases that are blank or trivially repetitive are refused', async () => {
  for (const p of ['        ', 'aaaaaaaa', 'abababab', ' a  a  a ']) await assert.rejects(B.make(real(), p), /at least 8/, JSON.stringify(p));
  assert.equal((await B.make(real(), 'abcd efgh')).locked, true);
});
test('a file made with the older 310k iterations still opens', async () => {
  const subtle = globalThis.crypto.subtle, enc = new TextEncoder(), pass = 'correct horse battery';
  const salt = globalThis.crypto.getRandomValues(new Uint8Array(16)), iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const base = await subtle.importKey('raw', enc.encode(pass), 'PBKDF2', false, ['deriveKey']);
  const key = await subtle.deriveKey({ name: 'PBKDF2', salt, iterations: 310000, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt']);
  const inner = JSON.stringify({ format: 'finance-sense-backup', version: 1, exportedAt: 'x', state: real() });
  const data = Buffer.from(await subtle.encrypt({ name: 'AES-GCM', iv, additionalData: enc.encode('finance-sense-backup-locked') }, key, enc.encode(inner)));
  const file = JSON.stringify({ format: 'finance-sense-backup-locked', version: 1, kdf: { name: 'PBKDF2-SHA256', iterations: 310000, salt: Buffer.from(salt).toString('base64') }, cipher: { name: 'AES-256-GCM', iv: Buffer.from(iv).toString('base64') }, data: data.toString('base64') });
  const got = await B.open(B.inspect(file), pass);
  assert.equal(got.mode, 'real'); assert.ok(got.transactions.length > 0);
});
test('passphrase strength counts characters, not UTF-16 pieces', async () => {
  await assert.rejects(B.make(real(), '\u{1F600}\u{1F601}\u{1F602}\u{1F600}\u{1F601}\u{1F602}\u{1F600}\u{1F601}'), /at least 8/);   // 3 different emoji only
  await assert.rejects(B.make(real(), '\uFF41'.repeat(8)), /at least 8/);                                                                  // fullwidth "a" x8 folds to "a" x8
});
test('an untrusted file cannot make us do unbounded work or read garbage', async () => {
  const o = JSON.parse((await B.make(real(), 'correct horse battery')).text);
  [1, 99999, 1e9, '310000', null].forEach((it) => { const c = JSON.parse(JSON.stringify(o)); c.kdf.iterations = it; assert.throws(() => B.inspect(JSON.stringify(c)), /damaged|newer/); });
  const c = JSON.parse(JSON.stringify(o)); c.data = 'not base64!!'; await assert.rejects(B.open(B.inspect(JSON.stringify(c)), 'correct horse battery'), /damaged/);
  const d = JSON.parse(JSON.stringify(o)); d.kdf.salt = Buffer.alloc(3).toString('base64'); await assert.rejects(B.open(B.inspect(JSON.stringify(d)), 'correct horse battery'), /damaged/);
  const e = JSON.parse(JSON.stringify(o)); e.version = 2; assert.throws(() => B.inspect(JSON.stringify(e)), /damaged|newer/);
});
test('inspect refuses things that are not backups', () => {
  ['', '   ', 'hello', '[]', 'null', '{}', '{"format":"other"}', '{"format":"finance-sense-backup","version":1}', '{"format":"finance-sense-backup","version":9,"state":{}}'].forEach((t) => assert.throws(() => B.inspect(t), /empty|not a Finance Sense|newer/, JSON.stringify(t)));
  assert.throws(() => B.inspect('x'.repeat(B.MAX_CHARS + 1)), /too big/);
  assert.throws(() => B.inspect(undefined), /empty/);
});
test('an older plain export (the raw saved data) is still accepted', async () => {
  const got = await B.open(B.inspect(JSON.stringify(real())), '');
  assert.equal(got.mode, 'real');
});
test('demo data and unfinished fresh data are not importable as a setup', async () => {
  const demo = FD.sample.build(NOW);
  const made = await B.make(demo, '');
  await assert.rejects(B.open(B.inspect(made.text), ''), /no saved setup/);
});
test('hostile contents are cleaned field by field on the way in', async () => {
  const bad = { v: 1, mode: 'real', onboarded: true, answers: { bills: [{ id: '__proto__', name: '<img onerror=alert(1)>'.repeat(10), amount: 'abc', due: 99 }, { id: 'constructor', amount: 1e99 }], payFreq: 'nope' },
    settings: { openingBalance: 'NaN', dismissed: ['x', 'ok:1'], savingsBalance: 'zzz' }, transactions: [{ id: 't1', date: 'bad', type: 'expense', amount: -5 }, { id: 't2', date: '2026-10-01', type: 'expense', amount: 12.5, category: 'dining', note: 'ok' }], subs: 'no', billsPaid: { '__proto__:2026-01': true, 'a:2026-01': true } };
  const got = await B.open(B.inspect(JSON.stringify({ format: 'finance-sense-backup', version: 1, state: bad })), '');
  assert.equal(got.transactions.length, 1); assert.deepEqual(got.subs, []); assert.deepEqual(got.settings.dismissed, ['ok:1']);
  assert.ok(got.answers.bills.every((b) => b.id !== '__proto__' && b.id !== 'constructor' && !(b.amount > 1e8)));
  assert.equal(({}).polluted, undefined); assert.equal(Object.getPrototypeOf(got.billsPaid), Object.prototype); assert.equal(got.billsPaid.polluted, undefined);
  assert.equal(got.answers.payFreq, undefined);
});
test('summary describes what is in a backup', () => {
  const s = FD.store.sanitize(JSON.parse(JSON.stringify(real()))), m = B.summary(s);
  assert.equal(m.transactions, s.transactions.length); assert.ok(m.bills > 0 && m.debts > 0 && m.setupDone && m.balanceSet);
  assert.match(m.latest, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(B.summary(FD.store.defaultState()).latest, null);
});
