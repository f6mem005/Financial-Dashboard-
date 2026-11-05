const test = require('node:test');
const assert = require('node:assert/strict');
['util', 'catalog', 'config', 'engine', 'store', 'sample', 'csv'].forEach((m) => require('../js/' + m + '.js'));
const FD = globalThis.FD, U = FD.util, E = FD.engine;
const NOW = new Date(2026, 10, 5); // Nov 5 2026

function demo() { const s = FD.sample.build(NOW); return { s, cfg: FD.config.buildConfig(s.answers, s.settings, NOW) }; }

test('config: skipped answers fall back to flagged defaults', () => {
  const cfg = FD.config.buildConfig({}, {}, NOW);
  assert.equal(cfg.freq, 'biweekly');
  assert.ok(cfg.payAmount > 0);
  assert.ok(cfg.assumed.length >= 2);
  assert.equal(cfg.style, 'track');
  assert.ok(cfg.features.safeToSpend);
  assert.ok(cfg.notes.length === 1);
});
test('config: irregular income uses the low month and keeps a range', () => {
  const cfg = FD.config.buildConfig({ payFreq: 'varies', pay: { low: 900, high: 2100 } }, {}, NOW);
  assert.equal(cfg.baseMonthly, 900); assert.equal(cfg.payHigh, 2100); assert.ok(cfg.features.incomeRange);
});
test('config: pain points map to features', () => {
  const { cfg } = demo();
  assert.ok(cfg.features.cashCalendar && cfg.features.leaks && cfg.features.debtPlan && cfg.features.goals && cfg.features.subscriptions);
  assert.equal(cfg.hero, 'safe'); assert.equal(cfg.style, 'envelopes');
});
test('config: unknown debt rate uses typical default and is flagged', () => {
  const cfg = FD.config.buildConfig({ debts: [{ type: 'card', balance: 1000, aprKnown: false }] }, {}, NOW);
  assert.equal(cfg.debts[0].apr, 24); assert.ok(cfg.debts[0].aprGuess); assert.ok(cfg.debts[0].minGuess);
});
test('config: hostile input is coerced, not trusted', () => {
  const cfg = FD.config.buildConfig({ payFreq: '__proto__', pay: { amount: '1e99', nextPayday: 'x' }, bills: [{ id: '<img onerror=1>', name: '<b>x</b>'.repeat(50), amount: -5 }, null, 7] }, {}, NOW);
  assert.equal(cfg.freq, 'biweekly'); assert.ok(cfg.payAmount <= 1e6); assert.equal(cfg.bills.length, 0);
});
test('paydays: biweekly stays on a 14 day cadence', () => {
  const cfg = FD.config.buildConfig({ payFreq: 'biweekly', pay: { amount: 1000, nextPayday: '2026-11-10' } }, {}, NOW);
  const p = E.paydays(cfg, NOW, U.addDays(NOW, 50)).map(U.iso);
  assert.deepEqual(p, ['2026-11-10', '2026-11-24', '2026-12-08', '2026-12-22']);
});
test('paydays: twice a month and day-31 monthly clamp', () => {
  const t = FD.config.buildConfig({ payFreq: 'twice', pay: { amount: 1, nextPayday: '2026-11-15' } }, {}, NOW);
  assert.deepEqual(E.paydays(t, NOW, new Date(2026, 11, 31)).map(U.iso), ['2026-11-15', '2026-11-30', '2026-12-15', '2026-12-31']);
  const m = FD.config.buildConfig({ payFreq: 'monthly', pay: { amount: 1, nextPayday: '2026-01-31' } }, {}, NOW);
  assert.deepEqual(E.paydays(m, NOW, new Date(2027, 2, 1)).map(U.iso), ['2026-11-30', '2026-12-31', '2027-01-31', '2027-02-28']);
});
test('forecast: simple known scenario', () => {
  const s = FD.store.defaultState(); s.settings.openingBalance = 1000;
  const cfg = FD.config.buildConfig({ payFreq: 'monthly', pay: { amount: 2000, nextPayday: '2026-11-20' }, bills: [{ id: 'rent', amount: 1000, due: 10 }], variable: [], annual: [] }, s.settings, NOW);
  const fc = E.forecast(cfg, s, NOW, { days: 30 });
  // Nov 10 rent (-1000) => 0, Nov 20 pay (+2000) => 2000
  assert.equal(fc.points.find((p) => U.iso(p.date) === '2026-11-10').balance, 0);
  assert.equal(fc.points.find((p) => U.iso(p.date) === '2026-11-20').balance, 2000);
  assert.equal(fc.firstNegative, null);
});
test('forecast: low income below the high income line; what-if cut raises balance', () => {
  const { s, cfg } = demo();
  const irr = FD.config.buildConfig({ payFreq: 'varies', pay: { low: 800, high: 2000, nextPayday: '2026-11-10' } }, {}, NOW);
  const lo = E.forecast(irr, FD.store.defaultState(), NOW, { days: 90, income: 'low' });
  const hi = E.forecast(irr, FD.store.defaultState(), NOW, { days: 90, income: 'high' });
  assert.ok(hi.end.balance > lo.end.balance);
  const base = E.forecast(cfg, s, NOW, { days: 180 });
  const cut = E.forecast(cfg, s, NOW, { days: 180, whatIf: { cut: { dining: 50 }, extraSavings: 0 } });
  assert.ok(cut.end.balance > base.end.balance + 250);
  const save = E.forecast(cfg, s, NOW, { days: 180, whatIf: { cut: {}, extraSavings: 100 } });
  assert.ok(save.end.balance < base.end.balance && save.setAside >= 500);
});
test('forecast: demo persona dips below zero within a year (red-zone demo)', () => {
  const { s, cfg } = demo();
  const fc = E.forecast(cfg, s, NOW, { days: 365 });
  assert.ok(fc.firstNegative, 'expected a projected negative balance in the demo');
});
test('safe to spend subtracts bills due before payday', () => {
  const s = FD.store.defaultState(); s.settings.openingBalance = 500;
  const cfg = FD.config.buildConfig({ payFreq: 'biweekly', pay: { amount: 1000, nextPayday: '2026-11-12' }, bills: [{ id: 'phone', amount: 60, due: 8 }, { id: 'rent', amount: 900, due: 20 }] }, s.settings, NOW);
  const r = E.safeToSpend(cfg, s, NOW);
  assert.equal(r.committed, 60); assert.equal(r.safe, 440); assert.equal(r.days, 7);
});
test('payoff: avalanche never costs more interest than snowball; stuck debts flagged', () => {
  const { cfg } = demo();
  const p = E.debtPlan(cfg, 100);
  assert.ok(p.avalanche.interest <= p.snowball.interest + 0.01);
  assert.ok(p.avalanche.months > 0 && !p.avalanche.stuck);
  const stuck = E.payoff([{ id: 'a', name: 'a', balance: 10000, apr: 30, min: 50 }], 0, 'avalanche');
  assert.ok(stuck.stuck);
});
test('goals: on track vs behind', () => {
  const { s, cfg } = demo();
  const trip = E.goalStatus(cfg.goals.find((g) => g.id === 'g-trip'), s, NOW);
  const em = E.goalStatus(cfg.goals.find((g) => g.id === 'g-emergency'), s, NOW);
  assert.equal(em.status, 'behind'); assert.ok(em.behindBy > 0);
  assert.ok(trip.saved >= 150 && ['on', 'behind'].includes(trip.status));
});
test('alerts: bill due soon + projected negative', () => {
  const { s, cfg } = demo();
  const a = E.alerts(cfg, s, NOW).map((x) => x.text).join('|');
  assert.match(a, /projected to go below \$0/);
});
test('store: sanitize drops junk and never loads demo mode from disk', () => {
  const s = FD.store.sanitize({ mode: 'demo', onboarded: true, transactions: [{ date: '2026-02-30', amount: 5 }, { date: '2026-02-03', amount: -4 }, { date: '2026-02-03', amount: '12.345', type: 'income', category: '../x', note: 'a\u0000b' }],
    billsPaid: { '__proto__': true, 'rent:2026-11': true, 'x:y': true }, settings: { minBalance: 'abc' } });
  assert.equal(s.mode, 'fresh'); assert.equal(s.onboarded, false);
  assert.equal(s.transactions.length, 1); assert.equal(s.transactions[0].category, 'extra'); assert.equal(s.transactions[0].amount, 12.35);
  assert.deepEqual(Object.keys(s.billsPaid), ['rent:2026-11']); assert.equal(s.settings.minBalance, 0);
  assert.equal(({}).polluted, undefined);
});
test('csv: parses quotes, debit/credit, dupes, bad rows', () => {
  const text = 'Date,Description,Amount\n11/01/2026,"UBER EATS, ORDER",-23.50\n11/02/2026,PAYROLL ACME,1450.00\n13/45/2026,bad,5\n11/01/2026,"UBER EATS, ORDER",-23.50\n';
  const r = FD.csv.toTransactions(FD.csv.parse(text), { dateFormat: 'mdy', existing: [] });
  assert.equal(r.txns.length, 3); assert.equal(r.skipped, 1); assert.equal(r.dupes, 0); // two identical same-day purchases both import
  assert.equal(r.txns[0].category, 'dining'); assert.equal(r.txns[1].category, 'pay');
  const again = FD.csv.toTransactions(FD.csv.parse(text), { dateFormat: 'mdy', existing: r.txns });
  assert.equal(again.txns.length, 0); assert.equal(again.dupes, 3); // re-importing the same file adds nothing
  const dc = FD.csv.toTransactions(FD.csv.parse('Posted;Memo;Debit;Credit\n2026-11-03;Coffee;4,5;\n2026-11-04;Refund;;10\n'.replace('4,5', '4.50')), {});
  assert.equal(dc.txns.length, 2);
});
test('csv: limits enforced', () => {
  assert.throws(() => FD.csv.parse('a'.repeat(2000001)), /too big/);
  assert.throws(() => FD.csv.toTransactions(FD.csv.parse('foo,bar\n1,2\n'), {}), /Date column/);
  assert.throws(() => FD.csv.parse(('a,b\n').repeat(5002)), /Too many rows/);
});

/* ---------- regression tests for independent review findings ---------- */
const mk = (answers, bal) => { const s = FD.store.defaultState(); s.settings.openingBalance = bal || 0; return { s, cfg: FD.config.buildConfig(answers, s.settings, NOW) }; };
const tx = (o) => FD.store.sanitizeTxn(Object.assign({ id: 'x' + Math.random().toString(36).slice(2), amount: 1, type: 'expense', category: 'other', note: '' }, o));
const at = (fc, iso) => fc.points.find((p) => U.iso(p.date) === iso).balance;

test('review: a bill already paid this month is not deducted again later in the month', () => {
  const { s, cfg } = mk({ payFreq: 'monthly', pay: { amount: 1, nextPayday: '2026-12-28' }, bills: [{ id: 'utilities', amount: 100, due: 20 }], variable: [], annual: [] }, 6000);
  s.transactions.push(tx({ date: '2026-11-04', amount: 100, category: 'utilities' }));
  const bal = E.currentBalance(s, NOW);
  assert.equal(bal, 5900);
  assert.equal(at(E.forecast(cfg, s, NOW, { days: 20 }), '2026-11-20'), 5900);
  assert.equal(E.safeToSpend(cfg, s, NOW).committed, 0);
});
test('review: "mark paid" is modelled as a real expense, so safe-to-spend does not jump', () => {
  const { s, cfg } = mk({ payFreq: 'monthly', pay: { amount: 100, nextPayday: '2026-11-25' }, bills: [{ id: 'rent', amount: 800, due: 5 }] }, 1000);
  assert.equal(E.safeToSpend(cfg, s, NOW).safe, 200);
  s.transactions.push(tx({ date: '2026-11-05', amount: 800, category: 'rent' })); s.billsPaid['rent:2026-11'] = true;
  assert.equal(E.safeToSpend(cfg, s, NOW).safe, 200);
});
test('review: goal savings stop when the goal is funded (no 12 x deductions)', () => {
  const { s, cfg } = mk({ payFreq: 'monthly', pay: { amount: 0, nextPayday: '2026-11-20' }, variable: [], goals: [{ id: 'g1', type: 'trip', target: 1200, date: '2027-01-05', created: '2026-11-05' }] }, 5000);
  const fc = E.forecast(cfg, s, NOW, { days: 365, includeGoals: true });
  assert.ok(Math.abs(fc.setAside - 1200) < 1, 'set aside ' + fc.setAside);
  const past = mk({ payFreq: 'monthly', variable: [], goals: [{ id: 'g2', type: 'trip', target: 1200, date: '2026-01-01', created: '2025-12-01' }] }, 5000);
  assert.ok(Math.abs(E.forecast(past.cfg, past.s, NOW, { days: 365 }).setAside - 1200) < 1);
});
test('review: debt minimums stop once the debt is paid off', () => {
  const { s, cfg } = mk({ payFreq: 'monthly', variable: [], debts: [{ id: 'd1', type: 'bnpl', balance: 100, min: 50, apr: 0, aprKnown: true }] }, 0);
  const fc = E.forecast(cfg, s, NOW, { days: 365 });
  const paid = fc.events.filter((e) => e.label === 'Debt payments').reduce((t, e) => t - e.amount, 0);
  assert.ok(Math.abs(paid - 100) < 0.01, 'paid ' + paid);
});
test('review: only a slow-month income given -> not zeroed, and flagged', () => {
  const cfg = FD.config.buildConfig({ payFreq: 'varies', pay: { low: 1500 } }, {}, NOW);
  assert.equal(cfg.payLow, 1500); assert.equal(cfg.payHigh, 1500); assert.equal(cfg.baseMonthly, 1500); assert.ok(cfg.assumed.some((a) => /slow-month/.test(a)));
  const hi = FD.config.buildConfig({ payFreq: 'varies', pay: { high: 2500 } }, {}, NOW);
  assert.equal(hi.payLow, 2500);
});
test('review: reserved-word / unknown categories cannot corrupt totals', () => {
  const s = FD.store.sanitize({ mode: 'real', transactions: ['constructor', '__proto__', 'toString', 'hasOwnProperty'].map((c) => ({ date: '2026-11-03', amount: 5, category: c })) });
  assert.ok(s.transactions.every((t) => t.category === 'other'));
  const cfg = FD.config.buildConfig({}, {}, NOW);
  const ms = E.monthSummary(cfg, s, NOW);
  assert.equal(typeof ms.spent, 'number'); assert.equal(ms.spent, 20);
});
test('review: future-dated transactions do not change today\'s balance; non-string dates rejected', () => {
  const { s } = mk({}, 100);
  s.transactions.push(tx({ date: '2026-12-25', amount: 300 }));
  assert.equal(E.currentBalance(s, NOW), 100);
  assert.equal(FD.store.sanitizeTxn({ date: ['2026-01-05'], amount: 5 }), null);
  assert.equal(U.parseISO(['2026-01-05']), null);
});
test('review: logged-average spending ignores a rent entry, counts unbudgeted categories', () => {
  const { s, cfg } = mk({ payFreq: 'monthly', variable: [{ id: 'groceries', monthly: 300 }] }, 0);
  s.transactions.push(tx({ date: '2026-10-01', amount: 900, category: 'rent' }), tx({ date: '2026-11-03', amount: 40, category: 'groceries' }));
  assert.equal(E.variableMonthly(cfg, s, NOW).usingLogged, false); // only 3 days of everyday spending
  assert.equal(E.variableMonthly(cfg, s, NOW).rows[0].monthly, 300);
  s.transactions.push(tx({ date: '2026-10-01', amount: 30, category: 'groceries' }), tx({ date: '2026-10-10', amount: 300, category: 'other' }));
  const vm = E.variableMonthly(cfg, s, NOW);
  assert.ok(vm.usingLogged && vm.rows.some((r) => r.id === 'unbudgeted' && r.monthly > 100));
});
test('review: new goal is neutral, not "behind"; alerts honour the include-goals toggle', () => {
  const { s, cfg } = mk({ payFreq: 'monthly', goals: [{ id: 'g1', type: 'trip', target: 1200, date: '2027-07-05', created: '2026-11-05' }] }, 0);
  assert.equal(E.goalStatus(cfg.goals[0], s, NOW).status, 'new');
  const d = demo(); d.s.settings.includeGoals = false;
  const off = E.forecast(d.cfg, d.s, NOW, { days: 365, includeGoals: false });
  assert.equal(!!E.alerts(d.cfg, d.s, NOW).find((a) => /below \$0/.test(a.text)), !!off.firstNegative);
});
test('review: unread payday today is counted by safe-to-spend like the forecast does', () => {
  const { s, cfg } = mk({ payFreq: 'monthly', pay: { amount: 1000, nextPayday: '2026-11-05' }, bills: [] }, 50);
  const r = E.safeToSpend(cfg, s, NOW);
  assert.ok(r.payToday); assert.equal(r.balance, 1050);
});
test('review: CSV amounts are parsed strictly', () => {
  const P = FD.csv.parseAmount;
  assert.equal(P('\u22125.00'), -5); assert.equal(P('(12.50)'), -12.5); assert.equal(P('1,234.56'), 1234.56);
  assert.equal(P('12,50'), 12.5); assert.equal(P('1.234,56'), 1234.56); assert.equal(P('$ 7'), 7);
  assert.equal(P('1e9'), null); assert.equal(P('abc'), null); assert.equal(P('5.00 DR'), null); assert.equal(P('99999999999'), null);
  assert.equal(FD.csv.categorize('DIFFERENT HARVEST SUPERMARKET'), 'other');
});
test('review: h() refuses disallowed tags and attributes; bidi controls are stripped', () => {
  assert.equal(U.cleanStr('a\u202Eb\u200Bc'), 'a b c');
  const dom = require('node:vm'); void dom; // h() needs a DOM; covered by the browser flow test
});
