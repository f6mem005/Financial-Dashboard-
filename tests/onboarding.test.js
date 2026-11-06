const test = require('node:test');
const assert = require('node:assert/strict');
['util', 'catalog', 'config', 'engine', 'store', 'ideas', 'ui', 'onboarding'].forEach((m) => require('../js/' + m + '.js'));
const FD = globalThis.FD, V = FD.onboarding.validate, C = FD.catalog, U = FD.util;
const q = (id) => C.QUESTIONS.filter((x) => x.id === id)[0];
const NOW = new Date(2026, 10, 5);

test('which questions must be answered: exactly the money ones', () => {
  assert.deepEqual(C.QUESTIONS.filter((x) => x.required).map((x) => x.id), ['payFreq', 'pay', 'otherIncome', 'bills', 'variable', 'annual', 'debts']);
  for (const id of ['pain', 'goals', 'style', 'checkin', 'addMode', 'homeFirst']) assert.ok(!q(id).required, id + ' can still be skipped');
  for (const id of ['otherIncome', 'bills', 'variable', 'annual', 'debts']) assert.match(q(id).noneLabel, /None \/ N\/A/);
});
test('how you are paid: a choice is needed', () => {
  assert.match(V({}, q('payFreq')), /Choose one/); assert.equal(V({ payFreq: 'biweekly' }, q('payFreq')), '');
});
test('pay: an amount (0 is fine) or the explicit N/A; blank is not an answer', () => {
  assert.match(V({ payFreq: 'weekly', pay: {} }, q('pay')), /Enter your pay/); assert.match(V({ payFreq: 'weekly' }, q('pay')), /Enter your pay/);
  assert.match(V({ payFreq: 'weekly', pay: { amount: null } }, q('pay')), /\$0 \/ N\/A/);
  assert.equal(V({ payFreq: 'weekly', pay: { amount: 0 } }, q('pay')), ''); assert.equal(V({ payFreq: 'weekly', pay: { amount: 850 } }, q('pay')), '');
  assert.equal(V({ payFreq: 'weekly', pay: { none: true } }, q('pay')), '');
  assert.match(V({ payFreq: 'weekly', pay: { amount: -5 } }, q('pay')), /Enter your pay/); assert.match(V({ payFreq: 'weekly', pay: { amount: NaN } }, q('pay')), /Enter your pay/);
  assert.match(V({ payFreq: 'varies', pay: { low: 900 } }, q('pay')), /slow month and a good month/); assert.equal(V({ payFreq: 'varies', pay: { low: 900, high: 1800 } }, q('pay')), ''); assert.equal(V({ payFreq: 'varies', pay: { low: 0, high: 0 } }, q('pay')), '');
  assert.equal(V({ payFreq: 'varies', pay: { none: true } }, q('pay')), '');
});
test('lists: a list (empty = None / N/A) is needed, and every row needs an amount', () => {
  for (const id of ['otherIncome', 'bills', 'variable', 'annual', 'debts']) { assert.match(V({}, q(id)), /Pick what applies, or choose None \/ N\/A/, id); assert.equal(V({ [id]: [] }, q(id)), '', id + ' None / N/A'); }
  assert.match(V({ bills: [{ id: 'rent', name: 'Rent', amount: null, due: 1 }] }, q('bills')), /Enter an amount for Rent/);
  assert.equal(V({ bills: [{ id: 'rent', name: 'Rent', amount: 0, due: 1 }] }, q('bills')), '', '0 is an answer'); assert.equal(V({ bills: [{ id: 'rent', name: 'Rent', amount: 900 }] }, q('bills')), '');
  assert.match(V({ variable: [{ id: 'groceries', name: 'Groceries' }] }, q('variable')), /Enter an amount for Groceries/);
  assert.match(V({ otherIncome: [{ id: 'x', name: '', custom: true, monthly: 5 }] }, q('otherIncome')), /Name your/);
  assert.match(V({ annual: [{ id: 'gifts', name: 'Gifts', amount: '' }] }, q('annual')), /Enter an amount for Gifts/);
});
test('debts: balance and smallest payment, and a rate or "I don\'t know"', () => {
  const d = (o) => ({ debts: [Object.assign({ id: 'd-card', name: 'Credit card' }, o)] });
  assert.match(V(d({ balance: null, min: 25, apr: 20 }), q('debts')), /what you owe and the smallest payment for Credit card/);
  assert.match(V(d({ balance: 900, min: null, apr: 20 }), q('debts')), /smallest payment/);
  assert.match(V(d({ balance: 900, min: 25, aprKnown: true }), q('debts')), /yearly interest rate/);
  assert.equal(V(d({ balance: 900, min: 25, apr: 22.9, aprKnown: true }), q('debts')), '');
  assert.equal(V(d({ balance: 900, min: 25, aprKnown: false }), q('debts')), '', '"I don\'t know" is an answer (marked as an estimate)');
  assert.equal(V(d({ balance: 0, min: 0, apr: 0, aprKnown: true }), q('debts')), '');
});
test('optional questions are never blocked', () => { for (const id of ['pain', 'goals', 'style']) assert.equal(V({}, q(id)), ''); });

test('config: an explicit "no pay" is $0 and is NOT replaced by a typical amount; skipped (old data) still is', () => {
  const none = FD.config.buildConfig({ payFreq: 'biweekly', pay: { none: true } }, {}, NOW);
  assert.equal(none.payAmount, 0); assert.equal(none.baseMonthly, 0); assert.ok(!none.assumed.some((a) => /Paychecks of/.test(a)));
  const skipped = FD.config.buildConfig({ payFreq: 'biweekly' }, {}, NOW); assert.ok(skipped.payAmount > 0); assert.ok(skipped.assumed.some((a) => /Paychecks of/.test(a)));
  const varies = FD.config.buildConfig({ payFreq: 'varies', pay: { none: true } }, {}, NOW); assert.equal(varies.payLow, 0); assert.equal(varies.payHigh, 0); assert.ok(!varies.assumed.some((a) => /Income of/.test(a)));
});
test('everything chosen as N/A gives a clean, estimate-free setup and the Ideas tab asks for pay instead of guessing', () => {
  const state = FD.store.defaultState(); state.mode = 'real';
  state.answers = { payFreq: 'biweekly', pay: { none: true }, otherIncome: [], bills: [], variable: [], annual: [], debts: [] };
  const cfg = FD.config.buildConfig(state.answers, state.settings, NOW);
  assert.deepEqual(cfg.assumed.filter((a) => /typical|Typical/.test(a) && !/payday/.test(a)), [], 'nothing was filled in with a typical amount');
  assert.equal(cfg.bills.length, 0); assert.equal(cfg.variable.length, 0);
  assert.equal(FD.ideas.plan(cfg, state, NOW).status, 'unknown');
});
test('storage keeps the no-pay flag as a plain boolean and drops anything else', () => {
  const s = (pay) => FD.store.sanitize({ v: 1, mode: 'real', onboarded: true, answers: { payFreq: 'weekly', pay } }).answers.pay;
  assert.equal(s({ none: true }).none, true); assert.equal(s({ none: 'yes' }).none, false); assert.equal(s({ none: 1 }).none, false); assert.equal(s({ amount: 5 }).none, false);
});

test('an explicit 0 paycheck is never replaced by a typical amount, even if "none" was toggled off', () => {
  const cfg = FD.config.buildConfig({ payFreq: 'biweekly', pay: { amount: 0, none: false } }, FD.store.defaultState().settings, NOW);
  assert.ok(!cfg.assumed.some((a) => /Paychecks of|Next payday/.test(a)), cfg.assumed.join(' | '));
  const blank = FD.config.buildConfig({ payFreq: 'biweekly', pay: {} }, FD.store.defaultState().settings, NOW);
  assert.ok(blank.assumed.some((a) => /Paychecks of/.test(a)), 'a truly blank pay still gets the typical default');
});

test('the question to resume at is kept, clamped, and dropped once setup is finished', () => {
  const a = FD.store.sanitize({ v: 1, mode: 'real', onboarded: false, setupStep: 5, answers: {} });
  assert.equal(a.setupStep, 5);
  assert.equal(FD.store.sanitize({ v: 1, mode: 'real', onboarded: false, setupStep: 9999, answers: {} }).setupStep, 50);
  assert.equal(FD.store.sanitize({ v: 1, mode: 'real', onboarded: false, setupStep: 'x', answers: {} }).setupStep, 0);
  assert.equal(FD.store.sanitize({ v: 1, mode: 'real', onboarded: true, setupStep: 5, answers: {} }).setupStep, 0);
});
