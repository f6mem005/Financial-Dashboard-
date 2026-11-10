const test = require('node:test');
const assert = require('node:assert/strict');
require('../js/logic.js'); require('../js/questions.js');
const SV = globalThis.SV, L = SV.logic, Q = SV.questions, F = SV.features;
const q = (id) => Q.find((x) => x.id === id);
const C = (...codes) => String.fromCharCode(...codes);   // hostile characters built from numeric codes, never typed raw
const RLO = C(0x202E), ZWSP = C(0x200B), ZWJ = C(0x200D);

test('content: 18 questions, in the intended order, unique ids, ids used by rules exist', () => {
  assert.equal(Q.length, 18); assert.equal(new Set(Q.map((x) => x.id)).size, 18);
  // "anything missing?" (q13) sits right after the feature questions; the two demo feedback questions (q17, q18) come after the others;
  // the open "anything else" (q16) is last before the email page (q15)
  assert.deepEqual(Q.map((x) => x.id), ['q1', 'q2', 'q3', 'q4', 'q11', 'q12', 'q13', 'q5', 'q6', 'q7', 'q8', 'q9', 'q10', 'q14', 'q17', 'q18', 'q16', 'q15']);
  Q.filter((x) => x.type === 'text').forEach((x) => assert.equal(x.max, 2000, x.id));
  assert.equal(q('q16').required, false); assert.equal(q('q13').required, false); assert.equal(q('q12').required, true);
  assert.equal(q('q3').from, 'q2'); assert.equal(q('q2').exact, 3); assert.equal(F.length, 15);
  Q.forEach((x) => { if (x.items) assert.equal(new Set(x.items.map((i) => i.id)).size, x.items.length, x.id + ' has duplicate item ids'); });
});
test('order: stable for a seed, differs between seeds, fixed-last item stays last, nothing lost', () => {
  const a = L.orderFor(q('q1'), 123), b = L.orderFor(q('q1'), 123), c = L.orderFor(q('q1'), 456);
  assert.deepEqual(a, b); assert.notDeepEqual(a, c); assert.deepEqual([...a].sort(), F.map((f) => f.id).sort());
  for (let s = 1; s < 50; s++) assert.equal(L.orderFor(q('q4'), s).slice(-1)[0], 'all');
  assert.notDeepEqual(L.orderFor(q('q1'), 123), L.orderFor(q('q2'), 123)); // each question shuffles independently
});
test('tap and untap: single, pick (max 3), multi with exclusive options', () => {
  assert.equal(L.toggleSingle(null, 'a'), 'a'); assert.equal(L.toggleSingle('a', 'a'), null); assert.equal(L.toggleSingle('a', 'b'), 'b');
  let p = []; ['a', 'b', 'c', 'd'].forEach((id) => { p = L.togglePick(p, id, 3); });
  assert.deepEqual(p, ['a', 'b', 'c']);                       // 4th tap ignored
  assert.deepEqual(L.togglePick(p, 'b', 3), ['a', 'c']);      // tap again = unchoose
  assert.deepEqual(L.togglePick(['a', 'c'], 'd', 3), ['a', 'c', 'd']);
  assert.deepEqual(L.toggleMulti(['bill'], 'none', ['none']), ['none']);          // exclusive replaces
  assert.deepEqual(L.toggleMulti(['none'], 'weekly', ['none']), ['weekly']);      // choosing another clears exclusive
  assert.deepEqual(L.toggleMulti(['bill', 'weekly'], 'bill', ['none']), ['weekly']);
});
test('reorder and rank sync', () => {
  assert.deepEqual(L.reorder(['a', 'b', 'c'], 0, 2), ['b', 'c', 'a']); assert.deepEqual(L.reorder(['a', 'b', 'c'], 2, 0), ['c', 'a', 'b']);
  assert.deepEqual(L.reorder(['a', 'b', 'c'], 1, 1), ['a', 'b', 'c']); assert.deepEqual(L.reorder(['a', 'b'], 0, 5), ['a', 'b']);
  assert.deepEqual(L.syncRank(['b', 'a', 'c'], ['a', 'c', 'd']), ['a', 'c', 'd']);       // b dropped, d appended
  assert.deepEqual(L.syncRank(['c', 'a'], ['a', 'b', 'c']), ['c', 'a', 'b']);           // keeps the order they set
  assert.deepEqual(L.syncRank(undefined, ['x', 'y']), ['x', 'y']);
});
test('ranking screen appears only after exactly three picks', () => {
  assert.ok(!L.visibleIds(Q, { q2: ['safe', 'bills'] }).includes('q3'));
  assert.ok(!L.visibleIds(Q, {}).includes('q3'));
  assert.ok(L.visibleIds(Q, { q2: ['safe', 'bills', 'goals'] }).includes('q3'));
  assert.equal(L.visibleIds(Q, {}).length, 17);   // 18 screens, minus the ranking screen that is not shown yet
  // progress counts the ranking screen from the start, so "x of 18" never changes mid-survey
  assert.equal(L.position(Q, {}, 'q1').total, 18);
  assert.equal(L.position(Q, { q2: ['safe', 'bills', 'goals'] }, 'q3').total, 18);
  assert.equal(L.position(Q, { q2: ['safe', 'bills', 'goals'] }, 'q3').index, 2);
});
test('validation: required vs optional', () => {
  const ids = F.map((f) => f.id);
  assert.equal(L.validate(q('q1'), {}).ok, false);
  const partial = {}; ids.slice(0, 13).forEach((id) => { partial[id] = 3; });
  assert.match(L.validate(q('q1'), { q1: partial }).msg, /2 rows/);
  const full = {}; ids.forEach((id, i) => { full[id] = i === 0 ? 'unsure' : 5; });
  assert.equal(L.validate(q('q1'), { q1: full }).ok, true);                   // "Not sure" counts as answered
  assert.equal(L.validate(q('q2'), { q2: ['safe', 'bills'] }).ok, false);
  assert.match(L.validate(q('q2'), { q2: ['safe'] }).msg, /exactly 3/);
  assert.equal(L.validate(q('q2'), { q2: ['safe', 'bills', 'goals'] }).ok, true);
  assert.equal(L.validate(q('q4'), {}).ok, true);                              // optional
  assert.equal(L.validate(q('q7'), {}).ok, false); assert.equal(L.validate(q('q7'), { q7: ['type'] }).ok, true);
  assert.equal(L.validate(q('q12'), { q12: '  ' }).ok, false); assert.equal(L.validate(q('q12'), { q12: 'tell me' }).ok, true);
  assert.equal(L.validate(q('q13'), {}).ok, true);
  assert.equal(L.validate(q('q15'), { q15: { try: 'yes', email: 'nope' } }).ok, false);
  assert.equal(L.validate(q('q15'), { q15: { try: 'yes', email: 'a@b.co' } }).ok, true);
  assert.equal(L.validate(q('q15'), { q15: { try: 'no' } }).ok, true);
});
test('sanitize: unknown ids, bad ratings, junk types and oversized text are dropped or cleaned', () => {
  const dirty = {
    q1: { safe: 5, where: 9, leaks: 0, bills: 'unsure', forecast: 2.5, __proto__: 5, constructor: 4, hack: 3 },
    q2: ['safe', 'safe', 'bills', 'goals', 'debt', '<img>'], q3: ['goals', 'safe', 'bills'], q4: 'nope', q5: 'weekly',
    q7: ['type', 'x', 'type'], q11: ['other', 'typing'], q11_other: 'a' + RLO + 'b<script>', q12: 'x'.repeat(5000),
    q15: { try: 'yes', email: ' me@example.com ', quote: true, extra: 'x' }, notAQuestion: 'x'
  };
  const out = L.sanitizeAnswers(Q, dirty);
  assert.deepEqual(out.q1, { safe: 5, bills: 'unsure' });
  assert.deepEqual(out.q2, ['safe', 'bills', 'goals']); assert.deepEqual(out.q3, ['goals', 'safe', 'bills']);
  assert.equal(out.q4, undefined); assert.equal(out.q5, 'weekly'); assert.deepEqual(out.q7, ['type']);
  assert.equal(out.q12.length, 2000); assert.equal(out.q11_other, 'ab<script>');      // stored as plain text only; rendered with textContent
  assert.deepEqual(out.q15, { try: 'yes', email: 'me@example.com', quote: true });
  assert.equal(out.notAQuestion, undefined); assert.equal(({}).polluted, undefined);
  assert.equal(Object.prototype.hasOwnProperty.call(out.q1, 'constructor'), false);
});
test('sanitize: a ranking that is not a reordering of the three picks is dropped', () => {
  const ok = L.sanitizeAnswers(Q, { q2: ['safe', 'bills', 'goals'], q3: ['bills', 'goals', 'safe'] });
  assert.deepEqual(ok.q3, ['bills', 'goals', 'safe']);
  assert.equal(L.sanitizeAnswers(Q, { q2: ['safe', 'bills', 'goals'], q3: ['bills', 'goals', 'debt'] }).q3, undefined);
  assert.equal(L.sanitizeAnswers(Q, { q2: ['safe', 'bills', 'goals'], q3: ['bills', 'goals'] }).q3, undefined);
});
test('text cleaning keeps line breaks, removes hostile characters, enforces limits', () => {
  assert.equal(L.cleanText('a\nb'), 'a\nb'); assert.equal(L.cleanText('a' + RLO + 'b' + ZWSP + 'c'), 'abc'); assert.equal(L.cleanText(null), '');
  assert.equal(L.cleanText('  hi  '), 'hi'); assert.equal(L.cleanText('x'.repeat(50), 10).length, 10);
  assert.equal(L.cleanText(ZWJ + ZWJ), '');                                   // a lone joiner pair is not text
  assert.ok(L.validEmail('a.b+c@example.co.uk')); assert.ok(!L.validEmail('a@b')); assert.ok(!L.validEmail('<a>@b.co')); assert.ok(!L.validEmail('a b@c.co')); assert.ok(!L.validEmail('x'.repeat(300) + '@b.co'));
});
test('email check: adversarial inputs under the length cap are fast (the regex really runs)', () => {
  const t0 = Date.now(), inputs = ['a@' + 'a-'.repeat(120) + 'b.co', 'a@' + 'a.'.repeat(120) + 'co', 'a@' + 'a'.repeat(63) + '.' + 'a'.repeat(63) + '.' + 'a'.repeat(63) + '.' + 'a'.repeat(30) + '!',
    'a'.repeat(64) + '@' + '-'.repeat(180), 'a@' + 'a-'.repeat(124) + '.'.repeat(4)];
  for (let i = 0; i < 2000; i++) inputs.forEach((x) => L.validEmail(x));
  assert.ok(Date.now() - t0 < 1000, 'took ' + (Date.now() - t0) + 'ms');
  ["o'neil@x.com", 'a@b.xn--p1ai'].forEach((e) => assert.ok(L.validEmail(e), e));
});
test('no ReDoS: hostile strings are handled quickly', () => {
  const t0 = Date.now();
  L.validEmail('a'.repeat(100000) + '@' + 'b'.repeat(100000)); L.validEmail('@'.repeat(100000)); L.cleanText(ZWSP.repeat(500000), 1000); L.cleanText('\n'.repeat(500000));
  assert.ok(Date.now() - t0 < 500, 'took ' + (Date.now() - t0) + 'ms');
});

/* ---------- review-round tests ---------- */
const CP = (...codes) => String.fromCodePoint(...codes);
test('email: strict ASCII check rejects hostile and malformed addresses', () => {
  ['a.b+c@example.co.uk', 'me@x.io', 'first_last@sub.domain.com', 'a1@b2.co'].forEach((e) => assert.ok(L.validEmail(e), e));
  ['a@b', 'a@b..co', 'a..b@c.co', 'a.@c.co', 'a@-.co', 'a@b-.co', '=1+1@x.co', '-2@x.co', '+3@x.co', '.a@b.co',
    'x' + C(0x202E) + '@x.co', 'a' + C(0) + '@x.co', 'a' + ZWSP + '@x.co', 'a' + CP(0xE0041) + '@x.co', 'a b@c.co', '<a>@b.co', 'a@b@c.co',
    'a@b.c', 'x'.repeat(65) + '@b.co', 'a@' + 'b'.repeat(64) + '.co', '', null, undefined, 5, {}, ['a@b.co']].forEach((e) => assert.ok(!L.validEmail(e), String(e)));
});
test('email: odd types in a saved contact answer never throw', () => {
  [{ try: 'yes', email: { a: 1 } }, { try: 'yes', email: 5 }, { try: 'yes', email: ['a@b.co'] }, { try: 'yes' }].forEach((c) => {
    assert.doesNotThrow(() => L.validate(q('q15'), { q15: c })); assert.doesNotThrow(() => L.sanitizeAnswers(Q, { q15: c }));
    assert.equal(L.validate(q('q15'), { q15: c }).ok, false); assert.equal((L.sanitizeAnswers(Q, { q15: c }).q15 || {}).email, undefined);
  });
});
test('cleaning: invisible characters are deleted, control/private ones become a space (incl. ones a hand-made list missed)', () => {
  [0x034F, 0x180B, 0x180D, 0xFE0F, 0xFFF9, 0xFFFB, 0xE0100, 0xE01EF, 0x17B4, 0x0600, 0x06DD, 0x070F, 0x202A, 0x2066, 0x061C, 0x00AD, 0x200E].forEach((cp) => {
    assert.equal(L.cleanText('a' + CP(cp) + 'b'), 'ab', 'U+' + cp.toString(16));
  });
  [0x2800, 0xE000, 0x0085, 0x2028, 0x0000, 0x0007].forEach((cp) => assert.equal(L.cleanText('a' + CP(cp) + 'b'), 'a b', 'U+' + cp.toString(16)));
  assert.equal(L.cleanText('caf' + CP(0x65, 0x301)), 'caf' + CP(0xE9));                 // NFC normalisation
  assert.equal(L.cleanText(ZWJ + ZWJ + ZWJ), ''); assert.equal(L.cleanText(CP(0x2800, 0x2800)), '');
});
test('cleaning: ordinary text is left alone, including emoji, accents, other scripts and line breaks', () => {
  ['I love it', 'caf' + CP(0xE9) + ' na' + CP(0xEF) + 've', CP(0x4F60, 0x597D), CP(0x645, 0x631, 0x62D, 0x628, 0x627), CP(0x5E9, 0x5DC, 0x5D5, 0x5DD),
    'a ' + CP(0x1F600) + ' b', CP(0x1F44D, 0x1F3FD), CP(0x1F1FA, 0x1F1F8), 'line one\nline two', '1,234.50 - ok? (yes) "q" it\'s'].forEach((t) => assert.equal(L.cleanText(t), t));
  assert.equal(L.cleanText('I ' + CP(0x2764, 0xFE0F) + ' it'), 'I ' + CP(0x2764) + ' it');                 // emoji selector removed, no stray space
  assert.equal(L.cleanText(CP(0x645, 0x6CC, 0x200C, 0x62E, 0x648, 0x627, 0x647, 0x645)), CP(0x645, 0x6CC, 0x62E, 0x648, 0x627, 0x647, 0x645)); // joiner deleted, word stays whole
});
test('cleaning: a lone half of an emoji is replaced, valid pairs are kept', () => {
  const lo = String.fromCharCode(0xD800), hi = String.fromCharCode(0xDC00);
  assert.equal(L.cleanText('a' + lo + 'b'), 'a b'); assert.equal(L.cleanText('a' + hi + 'b'), 'a b');
  assert.equal(L.cleanText('x' + CP(0x1F600) + 'y'), 'x' + CP(0x1F600) + 'y');
  const edge = L.cleanText('a'.repeat(4000) + CP(0x1F600), 5);
  assert.doesNotThrow(() => Buffer.from(edge, 'utf8')); assert.equal(Buffer.from(edge, 'utf8').toString('utf8'), edge);
});
test('cleaning: truncates on whole characters, never inside an emoji', () => {
  const smile = CP(0x1F600);
  const t = L.cleanText('a'.repeat(999) + smile + 'zzz', 1000);
  assert.equal(Array.from(t).length, 1000); assert.ok(t.endsWith(smile));
  const cut = L.cleanText(smile.repeat(600), 500);
  assert.equal(Array.from(cut).length, 500); assert.doesNotThrow(() => JSON.parse(JSON.stringify(cut)));
  assert.equal(Buffer.from(cut, 'utf8').toString('utf8'), cut);                         // valid UTF-8 round trip
});
test('spreadsheet safety: formula-style text is neutralised on export, plain text is untouched', () => {
  ["=1+1", "+1", "-2", "@SUM(A1)", '\t=x', '\r=x', ' =x', '\n=x', '   +1', '\u00a0-5'].forEach((x) => assert.equal(L.spreadsheetSafe(x), "'" + x));
  ['hello', 'a=b', '1+1', ' x=1', '', 'e-mail', 'a -b'].forEach((x) => assert.equal(L.spreadsheetSafe(x), x));
  assert.equal(L.spreadsheetSafe(null), ''); assert.equal(L.spreadsheetSafe(5), '');
});
test('validateAll: finds every unmet requirement, passes a complete response', () => {
  assert.deepEqual(L.validateAll(Q, {}).map((p) => p.id), ['q1', 'q2', 'q12', 'q7']);   // in the order people meet them
  const ids = F.map((f) => f.id), full = {}; ids.forEach((id) => { full[id] = 4; });
  const ok = { q1: full, q2: ['safe', 'bills', 'goals'], q3: ['bills', 'safe', 'goals'], q7: ['type'], q12: 'something useful' };
  assert.deepEqual(L.validateAll(Q, ok), []);
  assert.deepEqual(L.validateAll(Q, Object.assign({}, ok, { q12: '' })).map((p) => p.id), ['q12']);
  assert.deepEqual(L.validateAll(Q, Object.assign({}, ok, { q2: ['safe', 'bills'] })).map((p) => p.id), ['q2']); // and q3 disappears with it
});

test('cleaning is idempotent: cleaning twice equals cleaning once (including combining marks and truncation)', () => {
  const samples = ['e' + ZWSP + CP(0x301), 'aaaa b', 'x' + CP(0x1100) + ZWJ + CP(0x1161), 'caf' + CP(0x65, 0x301) + ZWSP + CP(0x301), ' a ' + RLO + ' b ', 'line\n' + ZWSP + ' \nline', 'ok'];
  samples.forEach((x) => { [3, 5, 1000].forEach((max) => { const once = L.cleanText(x, max); assert.equal(L.cleanText(once, max), once, JSON.stringify(x) + ' max ' + max); }); });
  assert.equal(L.cleanText('aaaa b', 5), 'aaaa');                                    // no trailing space left by the cut
  let seed = 12345; const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  const pool = [0x61, 0x20, 0x0A, 0x65, 0x301, 0x200B, 0x200D, 0xFE0F, 0x1100, 0x1161, 0x11A8, 0x1F600, 0x202E, 0x2800, 0x41, 0xE000];
  for (let i = 0; i < 3000; i++) { let t = ''; for (let j = 0, n = 1 + Math.floor(rnd() * 12); j < n; j++) t += CP(pool[Math.floor(rnd() * pool.length)]); const once = L.cleanText(t, 8); assert.equal(L.cleanText(once, 8), once, JSON.stringify(t)); }
});
test('email: shell/SQL-flavoured characters and malformed punycode are refused; ordinary ones still work', () => {
  ['a`id`@b.co', 'a$x@b.co', 'a*b@b.co', 'a|b@b.co', 'a{b}@b.co', 'a@b.xn---', 'a@b.xn--', 'a@b.xn--a-'].forEach((e) => assert.ok(!L.validEmail(e), e));
  ["o'neil@x.com", 'a.b+c@example.co.uk', 'a_b-c@sub.x.io', 'a@b.xn--p1ai', 'a&b@x.co'].forEach((e) => assert.ok(L.validEmail(e), e));
});

/* ---------- form-service encoding ---------- */
const fs = require('node:fs'), path = require('node:path');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const formBlock = (name) => { const m = new RegExp('<form name="' + name + '"[^>]*>([\\s\\S]*?)</form>').exec(html); return m ? { open: m[0].slice(0, m[0].indexOf('>') + 1), inner: m[1] } : null; };
const inputNames = (b) => [...b.inner.matchAll(/<input[^>]*\bname="([^"]+)"/g)].map((m) => m[1]);
const fullPayload = (id) => {
  const g = {}; F.forEach((f, i) => { g[f.id] = i === 0 ? 'unsure' : (i % 5) + 1; });
  return { v: 1, meta: { id: id || 'abc123' }, answers: L.sanitizeAnswers(Q, { q1: g, q2: ['safe', 'bills', 'goals'], q3: ['goals', 'safe', 'bills'], q4: 'all', q5: 'weekly', q6: 'phone', q7: ['type', 'file'], q8: 'tap', q9: 'zero',
    q10: ['bill', 'weekly'], q11: ['other', 'typing'], q11_other: 'too pricey', q12: 'tell me\nmore', q13: 'idea', q14: 'app story', q15: { try: 'yes', email: 'a@b.co', quote: true } }) };
};
test('forms: the page declares exactly the fields the code can send, with spam trap and Netlify attributes', () => {
  const s = formBlock('survey'), c = formBlock('survey-contact');
  assert.ok(s && c, 'both forms exist in index.html');
  [s, c].forEach((b) => { assert.match(b.open, /data-netlify="true"/); assert.match(b.open, /netlify-honeypot="bot-field"/); assert.match(b.open, /\bhidden\b/); });
  assert.deepEqual(inputNames(s).filter((n) => n !== 'form-name').sort(), L.fieldNames(Q).sort());
  assert.ok(/name="form-name" value="survey"/.test(s.inner) && /name="form-name" value="survey-contact"/.test(c.inner));
  assert.deepEqual(inputNames(c).sort(), ['bot-field', 'email', 'form-name']);
  assert.equal(new Set(L.fieldNames(Q)).size, L.fieldNames(Q).length);
});
test('forms: answers are flat text fields; email is never in the answers submission', () => {
  const p = fullPayload(), f = L.toFields(Q, p);
  assert.equal(f['form-name'], 'survey'); assert.equal(f['bot-field'], ''); assert.equal(f.response_id, 'abc123');
  assert.equal(f.q1_safe, 'unsure'); assert.equal(f.q1_where, '2'); assert.equal(f.q2, 'safe,bills,goals'); assert.equal(f.q3, 'goals,safe,bills');
  assert.equal(f.q11, 'other,typing'); assert.equal(f.q11_other, 'too pricey'); assert.equal(f.q12, 'tell me\nmore');
  assert.equal(f.q15_try, 'yes'); assert.equal(f.q15_quote, 'yes');
  assert.ok(!JSON.stringify(f).includes('a@b.co'), 'email leaked into the answers');
  Object.keys(f).filter((k) => k !== 'form-name').forEach((k) => assert.ok(L.fieldNames(Q).includes(k), 'undeclared field ' + k));
  Object.values(f).forEach((v) => assert.equal(typeof v, 'string'));
  assert.deepEqual(L.toContactFields(p), { 'form-name': 'survey-contact', 'bot-field': '', email: 'a@b.co' });
});
test('forms: unanswered questions send nothing; "No" sends no contact submission; any random response only uses declared fields', () => {
  const f = L.toFields(Q, { meta: { id: 'x' }, answers: {} });
  assert.deepEqual(Object.keys(f).sort(), ['bot-field', 'form-name', 'response_id']);
  assert.equal(L.toContactFields({ answers: { q15: { try: 'no' } } }), null); assert.equal(L.toContactFields({ answers: {} }), null); assert.equal(L.toContactFields(null), null);
  let seed = 99; const rnd = (n) => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed % n; };
  const declared = new Set(L.fieldNames(Q));
  for (let i = 0; i < 300; i++) {
    const a = {}; Q.forEach((q) => {
      if (rnd(3) === 0) return;
      if (q.type === 'grid') { a[q.id] = {}; q.items.forEach((it) => { if (rnd(2)) a[q.id][it.id] = rnd(7) < 6 ? rnd(5) + 1 : 'unsure'; }); }
      else if (q.type === 'pick') a[q.id] = F.map((x) => x.id).sort(() => rnd(3) - 1).slice(0, 3);
      else if (q.type === 'multi') { a[q.id] = q.items.map((x) => x.id).filter(() => rnd(2)); if (a[q.id].includes('other')) a[q.id + '_other'] = 'x' + rnd(99); }
      else if (q.type === 'single') a[q.id] = q.items[rnd(q.items.length)].id;
      else if (q.type === 'text') a[q.id] = 'text ' + rnd(1000);
      else if (q.type === 'contact') a[q.id] = { try: rnd(2) ? 'yes' : 'no', email: 'p' + rnd(99) + '@x.co', quote: !!rnd(2) };
    });
    const ff = L.toFields(Q, { meta: { id: 'r' + i }, answers: L.sanitizeAnswers(Q, a) });
    Object.keys(ff).filter((k) => k !== 'form-name').forEach((k) => assert.ok(declared.has(k), 'undeclared ' + k));
    assert.ok(!/@/.test(JSON.stringify(ff)) || !JSON.stringify(ff).includes('x.co'), 'email in answers');
  }
});

/* ---------- sending (pretend network) ---------- */
const loadConfig = (location) => {
  globalThis.location = location; const p = require.resolve('../js/config.js'); delete require.cache[p]; delete globalThis.SV.config; require(p);
  const cfg = globalThis.SV.config; delete globalThis.location; return cfg;
};
test('config: only a real https site sends; a file or localhost stays in preview mode', async () => {
  assert.equal(typeof loadConfig({ protocol: 'https:' }).send, 'function');
  assert.equal(loadConfig({ protocol: 'http:' }).send, undefined); assert.equal(loadConfig({ protocol: 'file:' }).send, undefined);
  assert.equal(typeof loadConfig({ protocol: 'file:' }).netlifySend, 'function'); { const n = loadConfig({ protocol: 'file:' }).privacyNote; assert.ok(n.length > 100 && n.length < 1200 && /90 days/.test(n) && /@/.test(n) && /removed/.test(n) && /separately/.test(n) && /one cookie/.test(n) && /never attached/.test(n), 'the privacy note says who, how long, the one cookie, that the invitation name is kept apart, how to ask for removal'); }
});
test('send: two separate form posts (answers, then email), URL-encoded, same-site sign-in cookie only, error on a bad reply', async () => {
  const cfg = loadConfig({ protocol: 'https:' }), calls = [];
  globalThis.fetch = async (url, opts) => { calls.push({ url, opts, body: new URLSearchParams(opts.body) }); return { ok: true, status: 200 }; };
  await cfg.netlifySend(fullPayload('send-one'));
  assert.equal(calls.length, 2); assert.equal(calls[0].url, '/'); assert.equal(calls[0].opts.method, 'POST');
  assert.equal(calls[0].opts.headers['Content-Type'], 'application/x-www-form-urlencoded'); assert.equal(calls[0].opts.credentials, 'same-origin');
  assert.equal(calls[0].body.get('form-name'), 'survey'); assert.equal(calls[0].body.get('q3'), 'goals,safe,bills'); assert.equal(calls[0].body.get('q12'), 'tell me\nmore');
  assert.ok(!calls[0].opts.body.includes('a%40b.co') && !calls[0].opts.body.includes('a@b.co'), 'email in the answers post');
  assert.equal(calls[1].body.get('form-name'), 'survey-contact'); assert.equal(calls[1].body.get('email'), 'a@b.co'); assert.equal(calls[1].body.get('bot-field'), '');
  calls.length = 0; const noEmail = fullPayload('send-two'); delete noEmail.answers.q15;
  await cfg.netlifySend(noEmail); assert.equal(calls.length, 1);                               // no email, no second post
  globalThis.fetch = async () => ({ ok: false, status: 404 });
  await assert.rejects(() => cfg.netlifySend(fullPayload('send-three')), /HTTP 404/);                      // a rejected post is never shown as success
  let n = 0; globalThis.fetch = async () => (++n === 1 ? { ok: true } : { ok: false, status: 500 });
  await assert.rejects(() => cfg.netlifySend(fullPayload('send-four')), /HTTP 500/);                      // the email post failing also counts as failure
  assert.equal(n, 2);
  delete globalThis.fetch;
});

/* ---------- review round: bigger boxes, retries, hostile lists ---------- */
test('send: a retry sends only what has not arrived yet (no second copy of the answers or the email)', async () => {
  const cfg = loadConfig({ protocol: 'https:' }); const calls = [];
  const names = () => calls.map((c) => c.body.get('form-name'));
  let failContact = true;
  globalThis.fetch = async (url, opts) => { const body = new URLSearchParams(opts.body); calls.push({ body, opts }); return body.get('form-name') === 'survey-contact' && failContact ? { ok: false, status: 500 } : { ok: true }; };
  await assert.rejects(() => cfg.netlifySend(fullPayload('retry-001')), /HTTP 500/);
  assert.deepEqual(names(), ['survey', 'survey-contact']);                       // answers arrived, email did not
  failContact = false; calls.length = 0;
  await cfg.netlifySend(fullPayload('retry-001'));                               // retry
  assert.deepEqual(names(), ['survey-contact']);                                 // only the email is sent again
  calls.length = 0; await cfg.netlifySend(fullPayload('retry-001'));
  assert.deepEqual(names(), []);                                                 // everything arrived: nothing is sent
  calls.length = 0; await cfg.netlifySend(fullPayload('retry-002'));
  assert.deepEqual(names(), ['survey', 'survey-contact']);                       // a different response is unaffected
  assert.ok(calls.every((c) => c.opts.signal), 'every request can be cancelled after a timeout');
  assert.ok(calls.every((c) => c.opts.referrerPolicy === 'same-origin' && c.opts.credentials === 'same-origin'), 'posts carry a same-site referrer (a post with none is hidden as spam) and the same-site sign-in cookie, and nothing goes to other sites');
  delete globalThis.fetch;
});
test('send: a retry while the first attempt is still running joins it; a failed email is marked "answers safe"; answers already saved are known', async () => {
  const cfg = loadConfig({ protocol: 'https:' }); let calls = 0, release;
  globalThis.fetch = (url, opts) => { calls++; return new Promise((res) => { const go = () => res({ ok: true }); if (!release) release = []; release.push(go); }); };
  const a = cfg.netlifySend(fullPayload('join-0001')), b = cfg.netlifySend(fullPayload('join-0001'));
  assert.equal(a, b, 'a second send for the same response must reuse the first');
  assert.equal(cfg.hasArrived('join-0001'), false);
  await new Promise((r) => setImmediate(r)); release.shift()();                                  // answers arrive
  await new Promise((r) => setImmediate(r)); assert.equal(cfg.hasArrived('join-0001'), true); release.shift()(); await a;
  assert.equal(calls, 2, 'answers and email were each sent once');
  globalThis.fetch = async (url, opts) => (new URLSearchParams(opts.body).get('form-name') === 'survey-contact' ? { ok: false, status: 500 } : { ok: true });
  await assert.rejects(() => cfg.netlifySend(fullPayload('join-0002')), (e) => e.mainArrived === true && /HTTP 500/.test(e.message));
  assert.equal(cfg.hasArrived('join-0002'), true);
  globalThis.fetch = async () => ({ ok: false, status: 404 });
  await assert.rejects(() => cfg.netlifySend(fullPayload('join-0003')), (e) => !e.mainArrived); assert.equal(cfg.hasArrived('join-0003'), false);
  delete globalThis.fetch;
});
test('send: a DIFFERENT payload for the same response is refused while the first is running (it must not ride on the old email or answers); an abort signal cancels the request', async () => {
  const cfg = loadConfig({ protocol: 'https:' }); const seen = [], release = [];
  globalThis.fetch = (url, opts) => { seen.push(opts); return new Promise((res, rej) => { release.push(() => res({ ok: true })); opts.signal.addEventListener('abort', () => rej(new Error('aborted'))); }); };
  const first = fullPayload('race-0001'), changed = fullPayload('race-0001'); changed.answers.q15 = { try: 'no' };
  const a = cfg.netlifySend(first);
  await assert.rejects(() => cfg.netlifySend(changed), (e) => e.busy === true);
  assert.equal(seen.length, 1, 'nothing extra was sent for the changed payload');
  await new Promise((r) => setImmediate(r)); release.shift()(); await new Promise((r) => setImmediate(r)); release.shift()(); await a;
  const ctl = new AbortController(), b = cfg.netlifySend(fullPayload('race-0002'), ctl.signal);
  await new Promise((r) => setImmediate(r)); ctl.abort();
  await assert.rejects(() => b, /aborted/); assert.equal(cfg.hasArrived('race-0002'), false);
  const before = seen.length, c = cfg.netlifySend(fullPayload('race-0002'));      // a fresh attempt after the abort is allowed: the old one is gone
  await new Promise((r) => setImmediate(r)); assert.equal(seen.length, before + 1, 'a new request really started');
  release.pop()(); await new Promise((r) => setImmediate(r)); release.pop()(); await c; assert.equal(cfg.hasArrived('race-0002'), true);
  delete globalThis.fetch;
});
test('hostile lists stay fast: a huge pick list is cleaned in linear time', () => {
  const junk = []; for (let i = 0; i < 100000; i++) junk.push('x' + (i % 50)); const big = junk.concat(Array(100000).fill('safe'));
  const t0 = Date.now(); const out = L.sanitizeAnswers(Q, { q2: big, q7: big, q10: big, q11: big });
  assert.ok(Date.now() - t0 < 500, 'took ' + (Date.now() - t0) + 'ms'); assert.equal(out.q2, undefined);   // all junk before any valid id within the first 200 -> nothing valid
  assert.deepEqual(L.sanitizeAnswers(Q, { q2: ['safe', 'safe', 'bills', 'goals', 'debt'] }).q2, ['safe', 'bills', 'goals']);
});
test('text boxes: 2000 characters are kept, more are cut at a whole character', () => {
  assert.equal(L.sanitizeAnswers(Q, { q16: 'a'.repeat(1999) + 'b' }).q16.length, 2000);
  assert.equal(L.sanitizeAnswers(Q, { q16: 'a'.repeat(3000) }).q16.length, 2000);
  assert.equal(L.validate(q('q12'), { q12: '   ' }).ok, false); assert.equal(L.validate(q('q16'), {}).ok, true);
  const f = L.toFields(Q, { meta: { id: 'text-001' }, answers: L.sanitizeAnswers(Q, { q16: 'one more idea' }) });
  assert.equal(f.q16, 'one more idea'); assert.ok(L.fieldNames(Q).includes('q16'));
});

test('referrer policy: same-origin in the page, the headers and the post (never no-referrer, which the form service treats as spam)', () => {
  const fs = require('node:fs'), path = require('node:path'), root = path.join(__dirname, '..');
  assert.match(fs.readFileSync(path.join(root, 'index.html'), 'utf8'), /<meta name="referrer" content="same-origin">/);
  assert.match(fs.readFileSync(path.join(root, '_headers'), 'utf8'), /Referrer-Policy: same-origin/);
  assert.doesNotMatch(fs.readFileSync(path.join(root, 'js', 'config.js'), 'utf8'), /referrerPolicy: 'no-referrer'/);
});

test('the demo feedback questions (q17, q18) are optional, saved and sent; and "n of N" still counts only the questions', () => {
  assert.ok(!Q.some((x) => x.type === 'tour') && !SV.tour, 'the five-card tour is gone: the demo is the real app now');
  [q('q17'), q('q18')].forEach((x) => { assert.equal(x.required, false); assert.equal(L.validate(x, {}).ok, true); assert.match(x.title, /demo/); });
  assert.ok(L.fieldNames(Q).includes('q17') && L.fieldNames(Q).includes('q18'));
  const a = L.sanitizeAnswers(Q, { q17: ' the chart is confusing ', q18: 'a shared view' });
  assert.deepEqual(a, { q17: 'the chart is confusing', q18: 'a shared view' });
  const f = L.toFields(Q, { meta: { id: 'r1' }, answers: a }); assert.equal(f.q17, 'the chart is confusing'); assert.equal(f.q18, 'a shared view');
  const ans = { q2: ['safe', 'bills', 'goals'] };
  assert.equal(L.position(Q, ans, 'q14').index, 13); assert.equal(L.position(Q, ans, 'q17').index, 14);
  assert.equal(L.position(Q, ans, 'q15').index, 17); assert.equal(L.position(Q, ans, 'q15').total, 18);
});
test('intro: easy-to-understand (not "simple"), "you" not "people", the number of questions instead of a time, and no age', () => {
  const text = [SV.intro.title, SV.intro.lead, ...SV.intro.points].join(' ');
  assert.match(SV.intro.title, /easy-to-understand money dashboard/); assert.doesNotMatch(text, /\bsimple\b/i);
  assert.match(SV.intro.lead, /help you see your money clearly/); assert.doesNotMatch(SV.intro.lead, /\bpeople\b|\bthey\b|\btheir\b/i);
  assert.match(SV.intro.points[0], new RegExp('There are ' + Q.length + ' questions'));
  assert.doesNotMatch(text, /minutes?\b|\bmins?\b|hours?\b|\b18\b(?! questions)|\b30\b|age\b|years old|adults?\b/i, 'no time to finish, no age (the question count itself is fine)');
});
