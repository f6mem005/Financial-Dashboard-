const test = require('node:test');
const assert = require('node:assert/strict');
require('../js/logic.js'); require('../js/questions.js'); require('../results/analyze.js');
const SV = globalThis.SV, L = SV.logic, A = SV.analyze, Q = SV.questions, F = SV.features;
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, a + ' vs ' + b);
const CP = (...c) => String.fromCodePoint(...c);

// Three respondents whose answers were worked out by hand (see the expectations below).
const CSV = [
  'response_id,created_at,q1_safe,q1_where,q1_leaks,q1_bills,q2,q3,q4,q5,q7,q12,q15_try,q15_quote',
  'resp-0001,2026-01-01T10:00:00Z,5,4,2,unsure,"safe,where,bills","where,safe,bills",invest,weekly,"type,file",one,,',
  'resp-0002,2026-01-02T10:00:00Z,4,3,,,"safe,leaks,goals","safe,goals,leaks",all,weekly,type,two,yes,yes',
  'resp-0003,2026-01-03T10:00:00Z,1,5,,,"where,bills,debt","debt,where,bills",invest,daily,,,no,'
].join('\n');

test('csv reading: quotes, line breaks inside quotes, CRLF, BOM, limits', () => {
  assert.deepEqual(A.parseCsv(String.fromCharCode(0xFEFF) + 'a,b\r\n1,"x,y"\r\n2,"line\nbreak"\r\n'), [['a', 'b'], ['1', 'x,y'], ['2', 'line\nbreak']]);
  assert.deepEqual(A.parseCsv('a\n"he said ""hi"""'), [['a'], ['he said "hi"']]);
  assert.throws(() => A.parseCsv('x'.repeat(5000001)), /too big/); assert.throws(() => A.parseCsv('a\n'.repeat(50003)), /Too many rows/);
  assert.throws(() => A.readExport(''), /empty/); assert.throws(() => A.readExport('{"a":1}'), /list of submissions/); assert.throws(() => A.readExport('[1,'), /JSON/);
});
test('json reading: flat rows, the form service API shape, and {submissions:[...]}', () => {
  const flat = [{ response_id: 'a', q5: 'daily', q12: 'hi' }];
  assert.equal(A.analyze(JSON.stringify(flat)).stats.n, 1);
  assert.equal(A.analyze(JSON.stringify([{ id: 's1', created_at: '2026-01-01T00:00:00Z', data: { response_id: 'a', q5: 'daily' } }])).stats.n, 1);
  assert.equal(A.analyze(JSON.stringify({ submissions: flat })).stats.n, 1);
  assert.equal(A.analyze('[]').stats.n, 0);
});
test('numbers: a hand-worked dataset gives exactly the expected scores', () => {
  const r = A.analyze(CSV), s = r.stats, f = (id) => s.features.find((x) => x.id === id);
  assert.equal(s.n, 3); assert.equal(s.smallSample, true); assert.equal(r.info.duplicatesRemoved, 0);
  // safe: ratings 5,4,1; picked by r1,r2 (2 of 3); #2 for r1 (2 pts) + #1 for r2 (3 pts)
  assert.equal(f('safe').rated, 3); near(f('safe').top2Pct, 200 / 3); near(f('safe').mean, 10 / 3); assert.equal(f('safe').unsure, 0);
  assert.equal(f('safe').picked, 2); near(f('safe').pickedPct, 200 / 3); assert.equal(f('safe').rankPoints, 5); assert.equal(f('safe').rank1, 1);
  // where: ratings 4,3,5; #1 for r1 (3) + #2 for r3 (2)
  near(f('where').mean, 4); near(f('where').top2Pct, 200 / 3); assert.equal(f('where').rankPoints, 5); assert.equal(f('where').rank1, 1);
  // bills: only "not sure" answered; picked by r1,r3, last place each time (1 + 1)
  assert.equal(f('bills').rated, 0); assert.equal(f('bills').top2Pct, null); assert.equal(f('bills').mean, null); assert.equal(f('bills').unsure, 1); near(f('bills').unsurePct, 100);
  assert.equal(f('bills').picked, 2); assert.equal(f('bills').rankPoints, 2);
  assert.equal(f('debt').rankPoints, 3); assert.equal(f('debt').rank1, 1); assert.equal(f('goals').rankPoints, 2); assert.equal(f('leaks').rankPoints, 1);
  assert.equal(f('leaks').rated, 1); assert.equal(f('leaks').top2, 0);
  assert.equal(f('invest').never, 2); near(f('invest').neverPct, 200 / 3);                   // 2 of the 3 who answered Q4
  assert.deepEqual(s.order.slice(0, 5), ['safe', 'where', 'debt', 'goals', 'bills']);        // ties broken by importance, then name
  const q5 = s.questions.q5; assert.equal(q5.answered, 3); assert.equal(q5.options.find((o) => o.id === 'weekly').count, 2); near(q5.options.find((o) => o.id === 'weekly').pct, 200 / 3);
  const q7 = s.questions.q7; assert.equal(q7.answered, 2); near(q7.options.find((o) => o.id === 'type').pct, 100); near(q7.options.find((o) => o.id === 'file').pct, 50);
  assert.deepEqual(s.texts.q12, ['one', 'two']); assert.deepEqual(s.contact, { tryYes: 1, tryNo: 1, quote: 1 });
});
test('duplicates: a retry shares a response id; the EARLIEST copy is kept even if the export lists newest first', () => {
  const rows = [
    { response_id: 'dupe-001', created_at: '2026-02-02T00:00:00Z', q5: 'daily' },     // newer copy listed first (like a newest-first export)
    { response_id: 'dupe-001', created_at: '2026-02-01T00:00:00Z', q5: 'weekly' },
    { response_id: 'solo-002', q5: 'weekly' }, { response_id: '', q5: 'daily' }, { q5: 'daily' }    // no id: cannot be matched, kept
  ];
  const p = A.prepare(rows);
  assert.equal(p.responses.length, 4); assert.equal(p.duplicatesRemoved, 1);
  assert.equal(p.responses.find((r) => r.id === 'dupe-001').answers.q5, 'weekly');
  assert.equal(A.prepare([{ response_id: 'zzzzzzzz' }, { response_id: 'wwwwwwww', q5: 'daily' }]).emptyRows, 1);   // a row with no usable answers is not counted
});
test('hostile or damaged rows cannot distort the results', () => {
  const row = { response_id: 'hostile-1', q1_safe: '9', q1_where: '3', q1_leaks: '3.5', q1_bills: '<img>', q2: 'safe,safe,zzz,bills,goals,debt', q3: 'safe,bills,debt', q4: 'nope', q5: 'weekly;drop', q7: ',,type,,<x>,type',
    q12: 'hi' + CP(0x202E) + CP(0x200B) + ' there', constructor: 'x', __proto__: 'y' };
  const a = A.fromFlat(row).answers;
  assert.deepEqual(a.q1, { where: 3 }); assert.deepEqual(a.q2, ['safe', 'bills', 'goals']); assert.equal(a.q3, undefined);   // 4 raw picks cleaned to 3; ranking no longer matches -> dropped
  assert.equal(a.q4, undefined); assert.equal(a.q5, undefined); assert.deepEqual(a.q7, ['type']); assert.equal(a.q12, 'hi there');
  const j = A.readExport('[{"__proto__":{"polluted":1},"response_id":"pollute-1","q5":"daily"}]');
  assert.equal(A.prepare(j).responses.length, 1); assert.equal(({}).polluted, undefined);
});
test('round trip: what the survey sends is exactly what the analysis reads back (random responses)', () => {
  let seed = 4242; const rnd = (n) => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed % n; };
  for (let i = 0; i < 400; i++) {
    const a = {}; Q.forEach((q) => {
      if (rnd(4) === 0) return;
      if (q.type === 'grid') { a[q.id] = {}; q.items.forEach((it) => { if (rnd(3)) a[q.id][it.id] = rnd(7) < 6 ? rnd(5) + 1 : 'unsure'; }); }
      else if (q.type === 'pick') a[q.id] = F.map((x) => x.id).sort(() => rnd(3) - 1).slice(0, 3);
      else if (q.type === 'rank') a[q.id] = (a.q2 || []).slice().sort(() => rnd(3) - 1);
      else if (q.type === 'multi') { a[q.id] = q.items.map((x) => x.id).filter(() => rnd(2)); if (a[q.id].includes('other')) a[q.id + '_other'] = 'x' + rnd(99); }
      else if (q.type === 'single') a[q.id] = q.items[rnd(q.items.length)].id;
      else if (q.type === 'text') a[q.id] = 'words ' + rnd(1000) + '\nline 2, with "quotes"';
      else if (q.type === 'contact') a[q.id] = { try: rnd(2) ? 'yes' : 'no', email: 'p' + rnd(99) + '@x.co', quote: !!rnd(2) };
    });
    const clean = L.sanitizeAnswers(Q, a), payload = { meta: { id: 'id' + i }, answers: clean };
    const back = A.fromFlat(L.toFields(Q, payload)).answers, expected = JSON.parse(JSON.stringify(clean));
    if (expected.q15) delete expected.q15.email;                                  // the email travels separately by design
    assert.deepEqual(JSON.parse(JSON.stringify(back)), expected, 'response ' + i);
    // and through a real CSV round trip too
    const f = L.toFields(Q, payload), keys = Object.keys(f), line = (o) => keys.map((k) => A.csvCell === undefined ? '' : '"' + String(o[k]).replace(/"/g, '""') + '"').join(',');
    const csv = keys.join(',') + '\n' + line(f), via = A.readExport(csv)[0];
    assert.deepEqual(JSON.parse(JSON.stringify(A.fromFlat(via).answers)), expected, 'csv ' + i);
  }
});
test('exports: formulas are neutralised, quoting is right, markdown carries the key numbers', () => {
  const r = A.analyze(CSV.replace(',two,', ',"=1+1,\n""x""",'));
  const feats = A.featuresCsv(r.stats).split('\n'); assert.equal(feats[0].split(',')[0], 'rank'); assert.ok(feats[1].startsWith('1,"A ""safe to spend"" number",5,'));
  const resp = A.responsesCsv(r.responses);
  assert.ok(resp.includes("\"'=1+1,\n\"\"x\"\"\""), 'formula not prefixed and quoted'); assert.ok(!/(^|,)=1\+1/.test(resp), 'raw formula cell');
  assert.equal(A.csvCell('=1+1'), "'=1+1"); assert.equal(A.csvCell('a,b'), '"a,b"'); assert.equal(A.csvCell('say "hi"'), '"say ""hi"""'); assert.equal(A.csvCell(null), ''); assert.equal(A.csvCell(5), '5');
  const md = A.toMarkdown(r.stats, r.info);
  assert.ok(md.includes('**3 responses**') && md.includes('Small sample') && md.includes('| 1 | A "safe to spend" number | 5 |') && md.includes('67%'));
  assert.ok(md.includes('Said yes: 1, said no: 1'));
  assert.ok(A.toMarkdown(A.aggregate([]), { duplicatesRemoved: 0 }).includes('**0 responses**'));           // an empty export does not crash
});
test('scale: 20,000 responses are analysed quickly', () => {
  const rows = []; for (let i = 0; i < 20000; i++) rows.push({ response_id: 'r' + i, q1_safe: String(1 + (i % 5)), q2: 'safe,bills,goals', q3: 'bills,safe,goals', q5: 'weekly', q12: 'text ' + i });
  const t0 = Date.now(), p = A.prepare(rows), s = A.aggregate(p.responses);
  assert.equal(s.n, 20000); assert.ok(Date.now() - t0 < 3000, 'took ' + (Date.now() - t0) + 'ms'); assert.equal(s.smallSample, false);
});

/* ---------- review round: untrusted files, wrong files, safe output ---------- */
const spawn = require('node:child_process').spawnSync, os = require('node:os'), pth = require('node:path'), fsx = require('node:fs');
const BOMCH = String.fromCharCode(0xFEFF);
test('reading: unclosed quote is an error, semicolon CSV works, spaces are trimmed, repeated columns keep the first value', () => {
  assert.throws(() => A.parseCsv('a,b\n1,"unterminated\n3,4\n5,6'), /unclosed quote/);
  assert.equal(A.analyze('response_id;q5\nsemi-0001;daily').stats.n, 1);                         // European spreadsheets
  assert.equal(A.analyze('response_id, q5\nspace-001, daily').stats.questions.q5.options.find((o) => o.id === 'daily').count, 1);
  assert.equal(A.readExport('q5,q5\ndaily,\n')[0].q5, 'daily'); assert.equal(A.readExport('q5,q5\n,weekly\n')[0].q5, 'weekly');
  assert.equal(A.analyze('response_id,q5\n').stats.n, 0);                                             // header only
});
test('wrong or damaged files explain themselves instead of showing a bare "0 people"', () => {
  const none = A.analyze('foo,bar\n1,2\n'); assert.equal(none.stats.n, 0); assert.match(none.info.warnings.join(' '), /None of the columns look like survey answers/);
  assert.match(A.analyze('email\nme@example.com\n').info.warnings.join(' '), /survey-contact/);          // the contact export by mistake
  const some = A.analyze('response_id,q5\nok-000001,daily\nbad-0001,\n'); assert.equal(some.stats.n, 1); assert.match(some.info.warnings.join(' '), /1 of 2 rows had no readable survey answers/);
  assert.equal(A.analyze(CSV).info.warnings.length, 0);                                                // a good file raises nothing
});
test('a hostile file cannot use up memory: only known columns are kept, absurd headers are refused', () => {
  const junk = []; for (let i = 0; i < 250; i++) junk.push('c' + i);
  let body = junk.join(',') + ',q5,response_id\n'; for (let i = 0; i < 4000; i++) body += junk.map(() => 'x').join(',') + ',daily,id-' + String(i).padStart(6, '0') + '\n';
  const t0 = Date.now(), r = A.analyze(body);
  assert.equal(r.stats.n, 4000); assert.ok(Date.now() - t0 < 2500, 'took ' + (Date.now() - t0) + 'ms'); assert.deepEqual(Object.keys(A.readExport(body)[0]).sort(), ['q5', 'response_id']);
  const wide = []; for (let i = 0; i < 400; i++) wide.push('c' + i);
  assert.throws(() => A.analyze(wide.join(',') + '\n1\n'), /too many columns/);
});
test('hostile list cells stay fast (a quoted cell with 100,000 junk items)', () => {
  const cell = '"' + Array(100000).fill('x').join(',') + ',' + Array(100000).fill('safe').join(',') + '"';
  const t0 = Date.now(), r = A.analyze('response_id,q2,q5\nspeed-0001,' + cell + ',daily\n');
  assert.ok(Date.now() - t0 < 500, 'took ' + (Date.now() - t0) + 'ms'); assert.equal(r.stats.n, 1);
});
test('ids and timestamps: only well-formed values are trusted', () => {
  assert.equal(A.fromFlat({ response_id: 'a'.repeat(100000), q5: 'daily' }).id, null); assert.equal(A.fromFlat({ response_id: 'ab\u001bcdefgh', q5: 'daily' }).id, null);
  assert.equal(A.fromFlat({ response_id: '123e4567-e89b-12d3-a456-426614174000', q5: 'daily' }).id, '123e4567-e89b-12d3-a456-426614174000'); assert.equal(A.fromFlat({ response_id: 'short', q5: 'daily' }).id, null);
  const at = (v) => A.fromFlat({ created_at: v, q5: 'daily' }).createdAt;
  assert.equal(at('2026-01-05T09:00:00Z'), Date.UTC(2026, 0, 5, 9)); assert.equal(at('2026-01-05 09:00:00 +0100'), Date.UTC(2026, 0, 5, 8)); assert.equal(at('2026-01-05 09:00:00 UTC'), Date.UTC(2026, 0, 5, 9)); assert.equal(at('2026-01-05 09:00:00 +0100 extra'), null) /* trailing text: not trusted */;
  assert.equal(at('2026-01-05T10:00:00+01:00'), Date.UTC(2026, 0, 5, 9)); assert.equal(at('2026-01-05T10:00:00+0100'), Date.UTC(2026, 0, 5, 9));
  assert.equal(at('1'), null); assert.equal(at('2026-01-05 09:00:00'), null); assert.equal(at('1767600000000'), 1767600000000); assert.equal(at('1767600000'), 1767600000000); assert.equal(at('nope'), null);
});
test('duplicates: copies without a timestamp can never beat dated ones, whatever the file order', () => {
  const copy = (when, ans) => Object.assign({ response_id: 'same-0001' }, when ? { created_at: when } : {}, { q5: ans });
  const LATE = copy('2026-01-05T00:00:00Z', 'daily'), NODATE = copy(null, 'weekly'), EARLY = copy('2026-01-01T00:00:00Z', 'payday');
  [[LATE, NODATE, EARLY], [EARLY, LATE, NODATE], [NODATE, EARLY, LATE], [LATE, EARLY, NODATE]].forEach((order) => {
    const p = A.prepare(order); assert.equal(p.responses.length, 1); assert.equal(p.responses[0].answers.q5, 'payday'); assert.equal(p.duplicatesRemoved, 2);
  });
});
test('repeated sends that DISAGREE are reported; many identical responses are flagged', () => {
  const rows = [{ response_id: 'conf-0001', created_at: '2026-01-01T00:00:00Z', q5: 'daily' }, { response_id: 'conf-0001', created_at: '2026-01-02T00:00:00Z', q5: 'weekly' }, { response_id: 'conf-0002', q5: 'daily' }];
  const r = A.prepare(rows); assert.equal(r.duplicatesRemoved, 1); assert.equal(r.conflicts, 1);
  assert.match(A.analyze(JSON.stringify(rows)).info.warnings.join(' '), /DIFFERENT answers/);
  const same = []; for (let i = 0; i < 8; i++) same.push({ response_id: 'bot-' + String(i).padStart(6, '0'), q1_safe: '5', q2: 'safe,bills,goals', q3: 'safe,bills,goals', q5: 'daily', q12: 'same text' });
  const s = A.analyze(JSON.stringify(same)); assert.equal(s.info.identical, 7); assert.match(s.info.warnings.join(' '), /7 responses have answers identical/);
  assert.equal(A.prepare(same.slice(0, 3)).identical, 0);                                             // too few to say anything
});
test('markdown report: other people\'s text cannot become links, images, headings, HTML or code', () => {
  const evil = ['<img src=x onerror=alert(1)>', '![t](https://evil.example/p.png?x)', '[l](javascript:alert(1))', '```', '# Big heading', '- fake item', '> quote', 'a | b', '<script>x</script>', '*bold* _it_ ~~s~~ &amp;'];
  const rows = evil.map((t, i) => ({ response_id: 'mdev-' + String(i).padStart(6, '0'), q5: 'daily', q12: t }));
  const md = A.toMarkdown(A.analyze(JSON.stringify(rows)).stats, { duplicatesRemoved: 0 });
  const lines = md.split('\n'), start = lines.findIndex((l) => l.startsWith('## The ONE thing')), items = lines.slice(start + 2).filter((l) => l.startsWith('- ')).slice(0, evil.length);
  assert.equal(items.length, evil.length);
  items.forEach((l) => { const body = l.slice(2); assert.ok(!/(^|[^\\])[<>\[\]`*_!#~&|]/.test(body), 'unescaped markup in: ' + l); assert.ok(!/^[-+>]/.test(body), 'starts like markdown: ' + l); });
  assert.ok(!lines.some((l, i) => i > start && /^#{1,6}\s/.test(l) && l.includes('Big heading')));       // no heading was created by an answer
});
test('spreadsheet files: Excel marker, formulas defused (also behind spaces and line breaks), CSV re-readable', () => {
  const rows = [{ response_id: 'xl-0000001', q5: 'daily', q12: ' =1+1' }, { response_id: 'xl-0000002', q5: 'daily', q12: 'line\n=2+2' }, { response_id: 'xl-0000003', q5: 'daily', q12: 'café ’ ok' }];
  const csv = A.excelCsv(A.responsesCsv(A.prepare(rows).responses));
  assert.equal(csv.charCodeAt(0), 0xFEFF); assert.ok(csv.includes("'=1+1"), 'the formula cell is defused');          // cleaning trims the leading space first
  const cells = A.parseCsv(csv.slice(1)).slice(1).reduce((all, row) => all.concat(row), []);
  assert.equal(cells.length, 3 * (L.fieldNames(Q).length - 1)); cells.forEach((c) => assert.ok(!/^\s*[=+\-@]/.test(c), 'a cell starts like a formula: ' + JSON.stringify(c)));
  assert.ok(cells.includes('line\n=2+2'));                                                                    // a line inside a cell is not a formula
  assert.equal(A.readExport(csv).length, 3);                                                          // the marker does not break re-reading
});
test('bases are stated, and thin ones are flagged', () => {
  const s = A.analyze(CSV).stats; assert.match(A.basesLine(s), /ratings 3, top-3 picks 3, ranking 3/);
  const rows = []; for (let i = 0; i < 40; i++) rows.push({ response_id: 'base-' + String(i).padStart(6, '0'), q1_safe: '4', q2: 'safe,bills,goals', q3: 'safe,bills,goals', q5: 'daily' + (i % 2), q4: i < 5 ? 'invest' : '' });
  const line = A.basesLine(A.analyze(JSON.stringify(rows)).stats); assert.match(line, /"never use" 5/); assert.match(line, /Under 30 for "never use"/);
  assert.match(A.toMarkdown(A.analyze(CSV).stats, {}), /People who answered:/);
});
test('the analysis depends on these question ids and types; renaming one must fail here', () => {
  const t = (id) => Q.find((x) => x.id === id).type;
  assert.deepEqual(['q1', 'q2', 'q3', 'q4', 'q15'].map(t), ['grid', 'pick', 'rank', 'single', 'contact']);
  ['q12', 'q13', 'q14', 'q16', 'q17', 'q18'].forEach((id) => assert.equal(t(id), 'text')); assert.equal(Q.find((x) => x.id === 'q11').otherText, true);
  assert.deepEqual(Object.keys(A.aggregate([]).texts).sort(), ['q11_other', 'q12', 'q13', 'q14', 'q16', 'q17', 'q18']);
});
test('command line: prints the report; refuses to overwrite its input, bad options, non-files; writes Excel-ready owner-only files', () => {
  const dir = fsx.mkdtempSync(pth.join(os.tmpdir(), 'cli-test-')), cli = pth.join(__dirname, '..', 'results', 'analyze-cli.js'), inp = pth.join(dir, 'in.csv');
  fsx.writeFileSync(inp, CSV);
  const run = (...a) => spawn(process.execPath, [cli, ...a], { encoding: 'utf8', timeout: 15000 });
  let r = run(inp); assert.equal(r.status, 0); assert.match(r.stdout, /\*\*3 responses\*\*/);
  r = run(inp, '--features', inp); assert.equal(r.status, 2); assert.match(r.stderr, /refusing to overwrite/); assert.equal(fsx.readFileSync(inp, 'utf8'), CSV);
  const link = pth.join(dir, 'link.csv'); fsx.symlinkSync(inp, link); r = run(inp, '--responses', link); assert.equal(r.status, 2); assert.equal(fsx.readFileSync(inp, 'utf8'), CSV);   // a symlink to the input counts as the input
  r = run(inp, '--features'); assert.equal(r.status, 2); assert.match(r.stderr, /needs a file name/);
  r = run(inp, '--features', '--responses', pth.join(dir, 'r.csv')); assert.equal(r.status, 2); assert.ok(!fsx.existsSync(pth.join(dir, '--responses')));
  r = run(inp, '--bogus'); assert.equal(r.status, 2); assert.match(r.stderr, /unexpected argument/);
  r = run(inp, '--features', pth.join(dir, 'x.csv'), '--responses', pth.join(dir, 'x.csv')); assert.equal(r.status, 2);
  r = run(dir); assert.equal(r.status, 1); assert.match(r.stderr, /not a regular file/);
  r = run(pth.join(dir, 'missing.csv')); assert.equal(r.status, 1); r = run(); assert.equal(r.status, 2);
  const f = pth.join(dir, 'f.csv'), rr = pth.join(dir, 'r.csv'); r = run(inp, '--features', f, '--responses', rr); assert.equal(r.status, 0);
  [f, rr].forEach((p) => { assert.equal(fsx.readFileSync(p, 'utf8').charCodeAt(0), 0xFEFF); if (process.platform !== 'win32') assert.equal(fsx.statSync(p).mode & 0o077, 0, 'file is readable by others'); });
  fsx.rmSync(dir, { recursive: true, force: true });
});

/* ---------- follow-up review: links, permissions, odd files ---------- */
test('command line: a hard link or odd spelling of the input is still the input; permissions are really owner-only', () => {
  const dir = fsx.mkdtempSync(pth.join(os.tmpdir(), 'cli2-')), cli = pth.join(__dirname, '..', 'results', 'analyze-cli.js'), inp = pth.join(dir, 'in file.csv');
  fsx.writeFileSync(inp, CSV);
  const run = (...a) => spawn(process.execPath, [cli, ...a], { encoding: 'utf8', timeout: 15000 });
  const hard = pth.join(dir, 'hard.csv'); fsx.linkSync(inp, hard);
  let r = run(inp, '--features', hard); assert.equal(r.status, 2); assert.match(r.stderr, /refusing to overwrite/); assert.equal(fsx.readFileSync(inp, 'utf8'), CSV);   // same file on disk, different name
  r = run(inp, '--responses', pth.join(dir, 'IN FILE.CSV')); if (fsx.existsSync(pth.join(dir, 'IN FILE.CSV'))) { assert.equal(r.status, 2); assert.equal(fsx.readFileSync(inp, 'utf8'), CSV); }   // matters on case-insensitive disks
  const loose = pth.join(dir, 'loose.csv'); fsx.writeFileSync(loose, 'old'); fsx.chmodSync(loose, 0o644);
  r = run(inp, '--features', loose); assert.equal(r.status, 0);
  if (process.platform !== 'win32') assert.equal(fsx.statSync(loose).mode & 0o077, 0, 'an existing file stayed readable by others');
  assert.ok(fsx.readFileSync(loose, 'utf8').includes('rank,feature'));
  const link = pth.join(dir, 'out-link.csv'), victim = pth.join(dir, 'victim.csv'); fsx.writeFileSync(victim, 'keep me'); fsx.symlinkSync(victim, link);
  r = run(inp, '--features', link); assert.equal(r.status, 0); assert.equal(fsx.readFileSync(victim, 'utf8'), 'keep me');       // a link is replaced, never written through
  assert.deepEqual(fsx.readdirSync(dir).filter((n) => n.includes('.tmp-')), []);                                                // no temp files left behind
  fsx.rmSync(dir, { recursive: true, force: true });
});
test('command line: checks every output before writing any; rejects stray arguments and odd names', () => {
  const dir = fsx.mkdtempSync(pth.join(os.tmpdir(), 'cli3-')), cli = pth.join(__dirname, '..', 'results', 'analyze-cli.js'), inp = pth.join(dir, 'in.csv');
  fsx.writeFileSync(inp, CSV);
  const run = (...a) => spawn(process.execPath, [cli, ...a], { encoding: 'utf8', timeout: 15000 });
  const good = pth.join(dir, 'good.csv');
  let r = run(inp, '--features', good, '--responses', pth.join(dir, 'nope', 'r.csv')); assert.equal(r.status, 2); assert.match(r.stderr, /does not exist/); assert.ok(!fsx.existsSync(good), 'wrote one file before failing');
  r = run(inp, 'extra'); assert.equal(r.status, 2); assert.match(r.stderr, /unexpected argument/);
  r = run(inp, '--features', '-'); assert.equal(r.status, 2); assert.ok(!fsx.existsSync(pth.join(dir, '-')));
  r = run(inp, '--features', good, '--features', good); assert.equal(r.status, 2);
  r = run(inp, '--features', dir); assert.equal(r.status, 2); assert.match(r.stderr, /is a folder/);
  fsx.rmSync(dir, { recursive: true, force: true });
});
test('odd but harmless files: delimiter by recognised columns, one-column export, headers ignoring case', () => {
  assert.equal(A.analyze('Response_ID,Q5,Q12\nrespo-0001,daily,hello\n').stats.questions.q5.options.find((o) => o.id === 'daily').count, 1);   // upper-case headers
  const one = A.analyze('q12\nhello, world, and more\nsecond answer\n'); assert.deepEqual(one.stats.texts.q12, ['hello, world, and more', 'second answer']);   // commas kept in a one-column file
  assert.equal(A.analyze('response_id;q5;q12\nsemi-0001;daily;"a, b"\n').stats.texts.q12[0], 'a, b');                                       // semicolon file with a comma inside a cell
  assert.equal(A.analyze('response_id\tq5\nTAB-00001\tdaily\n').stats.n, 1);
  assert.equal(A.analyze('Submission date,response_id,q5\n2026-01-05 09:00:00 UTC,date-0001,daily\n').responses[0].createdAt, Date.UTC(2026, 0, 5, 9));
});
test('the "which copy was kept" warning tells the truth when times cannot be read', () => {
  const noTime = [{ response_id: 'undt-0001', q5: 'daily' }, { response_id: 'undt-0001', q5: 'weekly' }];
  const w = A.analyze(JSON.stringify(noTime)).info.warnings.join(' ');
  assert.match(w, /time could not be read/); assert.match(w, /copy with a readable time was kept, or if none had one, the first copy listed/); assert.ok(!/earliest copy was kept/.test(w));
  const dated = [{ response_id: 'dt-000001', created_at: '2026-01-02T00:00:00Z', q5: 'daily' }, { response_id: 'dt-000001', created_at: '2026-01-01T00:00:00Z', q5: 'weekly' }];
  const w2 = A.analyze(JSON.stringify(dated)).info.warnings.join(' '); assert.match(w2, /earliest copy was kept/); assert.ok(!/could not be read/.test(w2));
  assert.equal(A.prepare(dated.map((d) => Object.assign({}, d, { q5: 'daily' }))).undatedDupes, 0);
});
test('markdown: addresses and web links in other people\'s text do not become live links', () => {
  const rows = ['see http://evil.example/x', 'www.evil.example', 'mail me a@evil.example', 'HTTPS://evil.example', 'ftp://evil.example'].map((t, i) => ({ response_id: 'link-' + String(i).padStart(6, '0'), q5: 'daily', q12: t }));
  const md = A.toMarkdown(A.analyze(JSON.stringify(rows)).stats, {});
  const items = md.split('\n').filter((l) => l.startsWith('- ') && /evil/.test(l));
  assert.equal(items.length, 5);
  items.forEach((l) => { assert.ok(!/(https?|ftp):\/\//i.test(l.replace(/\\:/g, '')) || /\\:/.test(l), 'live link: ' + l); assert.ok(!/(^|[^\\])www\./i.test(l), 'www link: ' + l); assert.ok(!/(^|[^\\])@/.test(l), 'address: ' + l); });
});

test('timestamps: each row uses the first timestamp-like column it can actually read', () => {
  const csv = 'Submission date,created_at,response_id,q5\n,2020-01-02T00:00:00Z,tsc-00001,daily\n,2020-01-01T00:00:00Z,tsc-00001,weekly\n';
  const r = A.analyze(csv);
  assert.equal(r.responses.length, 1); assert.equal(r.responses[0].answers.q5, 'weekly');   // the earlier copy, found through the second column
  assert.equal(r.info.undatedDupes, 0);
  const odd = 'Submission date,created_at,response_id,q5\nnot a date,2020-01-02T00:00:00Z,tsd-00001,daily\nnot a date,2020-01-01T00:00:00Z,tsd-00001,weekly\n';
  assert.equal(A.analyze(odd).responses[0].answers.q5, 'weekly');
});

test('timestamps in a JSON export follow the same rule: the first readable one wins, an unreadable top-level one does not hide a readable one', () => {
  const rows = [{ created_at: '', data: { response_id: 'jsn-00001', date: 'n/a', created_at: '2024-05-02T00:00:00Z', q5: 'daily' } },
    { created_at: '2024-05-01T00:00:00Z', data: { response_id: 'jsn-00001', q5: 'weekly' } }];
  const r = A.analyze(JSON.stringify(rows));
  assert.equal(r.responses.length, 1); assert.equal(r.info.undatedDupes, 0); assert.equal(r.responses[0].answers.q5, 'weekly');   // the 05-01 copy is earlier
});

test('the two feedback questions (q17, q18) reach the report, in the respondents\' words', () => {
  const csv = 'response_id,q12,q17,q18\nr1,a wish,the chart is confusing,a shared view\nr2,another wish,,more goals\n';
  const r = A.analyze(csv), md = A.toMarkdown(r.stats, r.info);
  assert.deepEqual(r.stats.texts.q17, ['the chart is confusing']); assert.deepEqual(r.stats.texts.q18.sort(), ['a shared view', 'more goals']);
  assert.match(md, /What they did not like in the demo \(1\)/); assert.match(md, /What they would like to see that is not there \(2\)/);
  assert.match(md, /the chart is confusing/);
});
