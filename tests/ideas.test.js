const test = require('node:test');
const assert = require('node:assert/strict');
['util', 'catalog', 'config', 'engine', 'store', 'sample', 'ideas'].forEach((m) => require('../js/' + m + '.js'));
const FD = globalThis.FD, U = FD.util, I = FD.ideas;
const NOW = new Date(2026, 10, 5); // Nov 5 2026

function demo(mut) {
  const s = FD.sample.build(NOW);
  if (mut) mut(s);
  return { s, cfg: FD.config.buildConfig(s.answers, s.settings, NOW) };
}
const days = (n) => U.iso(U.addDays(NOW, n));
let tid = 0;
const tx = (date, note, amount, category) => ({ id: 'x' + (++tid), date, type: 'expense', amount, category: category || 'dining', note });

/* ---------- how much could you set aside ---------- */
test('plan: demo has room, amounts follow the stated rule, steps are ordered', () => {
  const { s, cfg } = demo(); const p = I.plan(cfg, s, NOW);
  assert.equal(p.status, 'ok');
  assert.ok(p.capacity > 0 && Math.abs(p.capacity - Math.max(0, p.free - p.goalMonthly)) < 1e-9);
  assert.equal(p.comfortable, Math.floor(p.capacity * 0.5 / 5) * 5);
  assert.equal(p.stretch, Math.floor(p.capacity * 0.8 / 5) * 5);
  assert.ok(p.comfortable < p.stretch && p.stretch <= p.capacity);
  assert.deepEqual(p.steps.map((x) => x.id), ['cushion', 'debt', 'invest']);   // the demo has a 22.9% card
  assert.deepEqual(p.steps.map((x) => x.status), ['now', 'later', 'later']);
  assert.ok(p.expensiveDebt.length >= 1 && p.expensiveDebt[0].apr >= I.EXPENSIVE_APR);
});
test('plan: a cushion that is big enough is marked done and the next step becomes "now"', () => {
  const { s, cfg } = demo(); let p = I.plan(cfg, s, NOW);
  s.settings.savingsBalance = p.cushion.target3 + 1;
  p = I.plan(cfg, s, NOW);
  assert.ok(p.cushion.done && p.cushion.gap === 0);
  assert.deepEqual(p.steps.map((x) => x.status), ['done', 'now', 'later']);
});
test('plan: no debt step without expensive debt; spending more than income gives no savings suggestion', () => {
  const a = demo((s) => { s.answers.debts = []; }); const p1 = I.plan(a.cfg, a.s, NOW);
  assert.deepEqual(p1.steps.map((x) => x.id), ['cushion', 'invest']);
  const b = demo((s) => { s.answers.pay = { amount: 500, nextPayday: s.answers.pay.nextPayday }; }); const p2 = I.plan(b.cfg, b.s, NOW);
  assert.equal(p2.status, 'deficit'); assert.equal(p2.capacity, 0); assert.equal(p2.comfortable, 0); assert.ok(p2.free < 0);
});
test('plan: no income means "unknown" and no steps', () => {
  const cfg = FD.config.buildConfig({ payFreq: 'varies', pay: { low: 0, high: 0 } }, {}, NOW);
  const p = I.plan(cfg, FD.store.defaultState(), NOW);
  assert.equal(p.status, 'unknown'); assert.deepEqual(p.steps, []);
});
test('plan: irregular income is planned on the slow month', () => {
  const { s, cfg } = demo((x) => { x.answers.payFreq = 'varies'; x.answers.pay = { low: 2000, high: 4000 }; });
  assert.equal(I.plan(cfg, s, NOW).income, 2000 + cfg.extraMonthly);
});
test('debtBoost: more money means sooner and cheaper; zero extra gives nothing', () => {
  const { cfg } = demo();
  assert.equal(I.debtBoost(cfg, 0), null);
  const d = I.debtBoost(cfg, 150);
  assert.ok(d.monthsWith < d.monthsWithout && d.interestSaved > 0);
  assert.equal(I.debtBoost({ debts: [] }, 100), null);
});

/* ---------- growth illustration ---------- */
test('growth: no growth is just what you put in', () => {
  const g = I.growth({ monthly: 100, start: 500, years: 3, ratePct: 0 });
  assert.equal(g.length, 4); assert.equal(g[0].value, 500); assert.equal(g[3].value, 500 + 100 * 36); assert.equal(g[3].contributed, 4100);
});
test('growth: matches the closed form for a lump sum and for steady saving', () => {
  const lump = I.growth({ monthly: 0, start: 1000, years: 10, ratePct: 5 });
  assert.ok(Math.abs(lump[10].value - 1000 * Math.pow(1.05, 10)) < 1e-6);
  const r = Math.pow(1.06, 1 / 12) - 1, steady = I.growth({ monthly: 200, start: 0, years: 20, ratePct: 6 });
  assert.ok(Math.abs(steady[20].value - 200 * (Math.pow(1 + r, 240) - 1) / r) < 1e-4);
});
test('growth: hostile numbers are clamped, never NaN', () => {
  const g = I.growth({ monthly: 'abc', start: -5, years: 9999, ratePct: 1e9 });
  assert.ok(g.every((x) => Number.isFinite(x.value)) && g.length === 61);
});
test('project: four generic fund types, ordered cautious <= middle <= hopeful, no product names', () => {
  const pr = I.project({ monthly: 200, start: 1000, years: 20 });
  assert.equal(pr.length, 4);
  pr.forEach((r) => { const e = (s) => s[s.length - 1].value; assert.ok(e(r.low) <= e(r.mid) && e(r.mid) <= e(r.high), r.id); });
  assert.ok(pr.every((r) => !/vanguard|fidelity|schwab|blackrock|ishares|spdr|spy|vti|voo|s&p|nasdaq/i.test(r.name + r.blurb)));
  const stocks = pr.filter((r) => r.id === 'stocks')[0], savings = pr.filter((r) => r.id === 'savings')[0];
  assert.ok(stocks.mid[20].value > savings.mid[20].value);
});
test('project: overriding the middle rate shifts the whole range together', () => {
  const base = I.project({ monthly: 100, start: 0, years: 10 }).filter((r) => r.id === 'stocks')[0];
  const over = I.project({ monthly: 100, start: 0, years: 10, rates: { stocks: 2 } }).filter((r) => r.id === 'stocks')[0];
  assert.equal(over.rates.mid, 2); assert.equal(over.rates.high - over.rates.low, base.rates.high - base.rates.low);
});

/* ---------- ways to spend less ---------- */
test('opportunities: many small purchases are found; results are whole dollars, ranked, capped', () => {
  const { s, cfg } = demo(); const o = I.opportunities(cfg, s, NOW);
  assert.ok(o.length >= 1 && o.length <= 6);
  assert.ok(o.some((x) => x.id === 'small-dining'));
  o.forEach((x) => { assert.equal(x.saves, Math.round(x.saves)); assert.ok(x.saves > 0 && x.title && x.detail && x.rule); });
  for (let i = 1; i < o.length; i++) assert.ok(o[i - 1].saves >= o[i].saves);
});
test('opportunities: a category running well above its recent months is flagged (needs at least ten days of the month)', () => {
  const N2 = new Date(2026, 10, 20), d2 = (n) => U.iso(U.addDays(N2, n));
  const st = FD.sample.build(N2); st.transactions = [];
  [1, 2, 3].forEach((b) => { for (let k = 0; k < 4; k++) st.transactions.push(tx(U.iso(new Date(2026, 10 - b, 3 + k * 6)), 'Dinner out', 50, 'dining')); }); // about $200 a month
  for (let k = 0; k < 5; k++) st.transactions.push(tx(d2(-k - 1), 'Dinner out', 70, 'dining'));   // $350 in five days
  const cfg = FD.config.buildConfig(st.answers, st.settings, N2);
  assert.ok(I.opportunities(cfg, st, N2).some((x) => x.id === 'trend-dining'));
  const early = new Date(2026, 10, 5), cfg2 = FD.config.buildConfig(st.answers, st.settings, early);
  assert.ok(!I.opportunities(cfg2, st, early).some((x) => x.id === 'trend-dining'));   // too early in the month to call it a trend
});
test('opportunities: fee-like charges are found; nothing is invented from nothing', () => {
  const { s, cfg } = demo((x) => { x.transactions.push(tx(days(-10), 'Overdraft fee', 35, 'other')); });
  assert.ok(I.opportunities(cfg, s, NOW).some((x) => x.id === 'fees'));
  const empty = demo((x) => { x.transactions = []; x.subs = []; x.answers.debts = []; });
  const o = I.opportunities(empty.cfg, empty.s, NOW);
  assert.ok(o.every((x) => x.saves > 0) && o.filter((x) => x.kind === 'trim').length <= 2 && o.every((x) => ['trim', 'subs'].includes(x.kind)));   // only the soft fallback and what is listed, never invented specifics
});

/* ---------- duplicates ---------- */
test('duplicates: the demo double charge and two music apps are found', () => {
  const { s, cfg } = demo(); const d = I.duplicates(cfg, s, NOW);
  const dbl = d.filter((x) => x.kind === 'double');
  assert.equal(dbl.length, 1); assert.ok(s.transactions.some((t) => t.id === dbl[0].txnId) && dbl[0].oneOff);
  assert.ok(d.some((x) => x.kind === 'sub-overlap' && /music/.test(x.title)));
});
test('duplicates: same subscription listed twice; same bill twice; different shops and far-apart dates are not flagged', () => {
  const { s, cfg } = demo((x) => {
    x.subs = [{ id: 'a', name: 'Netflix', amount: 15.49, cycle: 'monthly' }, { id: 'b', name: 'netflix', amount: 15.49, cycle: 'monthly' }];
    x.answers.bills.push({ id: 'internet2', name: 'Internet', amount: 55, due: 12 });
    x.transactions = [tx(days(-2), 'Cafe Aroma', 12), tx(days(-1), 'Cafe Aroma', 12), tx(days(-3), 'Bakery', 12), tx(days(-1), 'Pharmacy', 12), tx(days(-9), 'Taxi', 20), tx(days(-2), 'Taxi', 20)];
  });
  const d = I.duplicates(cfg, s, NOW);
  assert.ok(d.some((x) => x.kind === 'sub-same' && x.saves > 180));
  assert.ok(d.some((x) => x.kind === 'bill-dup'));
  const doubles = d.filter((x) => x.kind === 'double');
  assert.equal(doubles.length, 1); assert.match(doubles[0].title, /Cafe Aroma/);
});
test('duplicates: tiny purchases and future-dated rows are ignored', () => {
  const { s, cfg } = demo((x) => { x.subs = []; x.transactions = [tx(days(-2), 'Vending', 2), tx(days(-1), 'Vending', 2), tx(days(3), 'Concert', 60), tx(days(4), 'Concert', 60)]; });
  assert.deepEqual(I.duplicates(cfg, s, NOW).filter((x) => x.kind === 'double'), []);
});

/* ---------- things that changed ---------- */
test('drift: the demo notices the higher gym payments and the old balance', () => {
  const { s, cfg } = demo(); const d = I.drift(cfg, s, NOW);
  const gym = d.filter((x) => x.kind === 'bill')[0];
  assert.deepEqual(gym.apply, { kind: 'bill', id: 'gym', amount: 45 });
  assert.ok(d.some((x) => x.kind === 'balance' && x.apply.kind === 'goto'));
  assert.ok(d.length <= 4);
});
test('drift: everyday spending that settled far from the estimate is offered at the logged level', () => {
  const { s, cfg } = demo((x) => { x.answers.variable.filter((v) => v.id === 'transport')[0].monthly = 300; });
  const v = I.drift(cfg, s, NOW).filter((x) => x.kind === 'var');
  assert.equal(v.length, 1); assert.equal(v[0].apply.id, 'transport'); assert.ok(v[0].apply.amount % 5 === 0 && v[0].apply.amount < 200);
});
test('drift: dismissed suggestions stay away', () => {
  const { s, cfg } = demo(); const first = I.drift(cfg, s, NOW)[0];
  s.settings.dismissed = [first.id];
  assert.ok(I.drift(cfg, s, NOW).every((x) => x.id !== first.id));
});
test('drift: changed paychecks are noticed (and not when pay varies)', () => {
  const mk = (x) => { x.transactions = [1, 2, 3].map((k) => ({ id: 'p' + k, date: days(-14 * k), type: 'income', amount: 1700, category: 'pay', note: 'Pay' })); };
  const a = demo(mk), d = I.drift(a.cfg, a.s, NOW).filter((x) => x.kind === 'pay');
  assert.equal(d.length, 1); assert.equal(d[0].apply.amount, 1700);
  const b = demo((x) => { mk(x); x.answers.payFreq = 'varies'; x.answers.pay = { low: 1000, high: 2000 }; });
  assert.deepEqual(I.drift(b.cfg, b.s, NOW).filter((x) => x.kind === 'pay'), []);
});
test('drift: a charge that repeats monthly and is not in your bills is offered as a bill', () => {
  const { s, cfg } = demo((x) => { x.transactions = [1, 2, 3, 4].map((b) => tx(U.iso(new Date(2026, 10 - (b - 1), 14)), 'Language app', 12.99, 'fun')).filter((t) => t.date <= days(0)); });
  const d = I.drift(cfg, s, NOW).filter((x) => x.kind === 'newbill');
  assert.equal(d.length, 1); assert.equal(d[0].apply.name, 'Language app'); assert.equal(d[0].apply.amount, 12.99); assert.equal(d[0].apply.due, 14);
});

/* ---------- storage of the new settings ---------- */
test('store: savings balance is clamped or absent; dismissed ids are filtered and capped', () => {
  const raw = (settings) => ({ v: 1, mode: 'real', onboarded: true, settings });
  assert.equal(FD.store.sanitize(raw({ savingsBalance: null })).settings.savingsBalance, null);
  assert.equal(FD.store.sanitize(raw({ savingsBalance: '' })).settings.savingsBalance, null);
  assert.equal(FD.store.sanitize(raw({ savingsBalance: 1e99 })).settings.savingsBalance, 1e8);
  assert.equal(FD.store.sanitize(raw({ savingsBalance: -50 })).settings.savingsBalance, 0);
  const ids = ['pay:1700', 'bad id', '<x>', 'Bill:upper', 'ok:fine-1.2_3'].concat(Array.from({ length: 200 }, (_, i) => 'n:' + i));
  const out = FD.store.sanitize(raw({ dismissed: ids })).settings.dismissed;
  assert.ok(out.length <= 100 && out.includes('pay:1700') && !out.includes('bad id') && !out.includes('<x>') && !out.includes('Bill:upper'));
  assert.deepEqual(FD.store.sanitize(raw({ dismissed: 'nope' })).settings.dismissed, []);
});

/* ---------- fixes from review ---------- */
test('plan: skipping everything never produces a set-aside number built on invented pay', () => {
  const st = FD.store.defaultState(); st.mode = 'real'; st.onboarded = true;
  const cfg = FD.config.buildConfig(st.answers, st.settings, NOW), p = I.plan(cfg, st, NOW);
  assert.equal(p.status, 'unknown'); assert.deepEqual(p.steps, []); assert.equal(p.comfortable, 0);
  assert.ok(p.guessed.includes('your pay'));
  assert.deepEqual(I.opportunities(cfg, st, NOW).filter((x) => x.kind === 'trim'), []);   // no "bigger flexible costs" from default spending
});
test('plan: pay given but bills and spending skipped is allowed, and says what was assumed', () => {
  const st = FD.store.defaultState(); st.mode = 'real'; st.answers = { payFreq: 'monthly', pay: { amount: 3000, nextPayday: U.iso(U.addDays(NOW, 5)) } };
  const cfg = FD.config.buildConfig(st.answers, st.settings, NOW), p = I.plan(cfg, st, NOW);
  assert.notEqual(p.status, 'unknown'); assert.deepEqual(p.guessed, ['your bills', 'your everyday spending']);
});
test('plan: money already committed to goals is taken out before "comfortable"', () => {
  const a = demo(); const base = I.plan(a.cfg, a.s, NOW);
  const b = demo((s) => { s.answers.goals = [{ id: 'g-car', type: 'car', target: 7000, date: U.iso(U.addMonths(NOW, 4)), created: U.iso(NOW), saved0: 0 }]; });
  const withGoal = I.plan(b.cfg, b.s, NOW);
  assert.ok(withGoal.goalMonthly > base.goalMonthly);
  assert.ok(Math.abs(withGoal.capacity - Math.max(0, withGoal.free - withGoal.goalMonthly)) < 1e-9);
  assert.ok(withGoal.comfortable < base.comfortable);
  b.s.settings.includeGoals = false;
  assert.equal(I.plan(b.cfg, b.s, NOW).goalMonthly, 0);
});
test('drift: the balance nudge clears once the balance is confirmed, and returns after 30 more days', () => {
  const { s, cfg } = demo();
  assert.ok(I.drift(cfg, s, NOW).some((x) => x.kind === 'balance'));
  s.settings.balanceChecked = U.iso(U.addDays(NOW, -2));
  assert.ok(!I.drift(cfg, s, NOW).some((x) => x.kind === 'balance'));
  assert.ok(I.drift(cfg, s, U.addDays(NOW, 40)).some((x) => x.kind === 'balance'));
});
test('drift: "add as a bill" carries the matching transaction ids so they are not counted twice', () => {
  const { s, cfg } = demo((x) => { x.transactions = [1, 2, 3, 4].map((b) => tx(U.iso(new Date(2026, 10 - (b - 1), 14)), 'Language app', 12.99, 'fun')).filter((t) => t.date <= days(0)); });
  const d = I.drift(cfg, s, NOW).filter((x) => x.kind === 'newbill')[0];
  assert.ok(d.apply.txnIds.length >= 3 && d.apply.txnIds.every((id) => s.transactions.some((t) => t.id === id)));
});
test('drift: a category that logs to about $0 is not offered as a new estimate of $0', () => {
  const { s, cfg } = demo((x) => { x.answers.variable.filter((v) => v.id === 'fun')[0].monthly = 300; x.transactions = x.transactions.filter((t) => t.category !== 'fun'); });
  assert.ok(I.drift(cfg, s, NOW).filter((x) => x.kind === 'var').every((x) => x.apply.amount > 0));
});
test('duplicates: a run of daily purchases is a habit, not a pile of double charges', () => {
  const { s, cfg } = demo((x) => { x.subs = []; x.transactions = [1, 2, 3, 4, 5].map((k) => tx(days(-k), 'Coffee shop', 10.5)); });
  assert.deepEqual(I.duplicates(cfg, s, NOW).filter((x) => x.kind === 'double'), []);
});
test('duplicates: goal deposits and bill payments are never "double charges"', () => {
  const { s, cfg } = demo((x) => { x.subs = []; x.transactions = [Object.assign(tx(days(-2), 'Goal: Trip', 50, 'savings'), { goalId: 'g-trip' }), Object.assign(tx(days(-1), 'Goal: Trip', 50, 'savings'), { goalId: 'g-trip' }),
    Object.assign(tx(days(-2), 'Rent (marked paid)', 600, 'rent'), { billId: 'rent' }), Object.assign(tx(days(-1), 'Rent (marked paid)', 600, 'rent'), { billId: 'rent' })]; });
  assert.deepEqual(I.duplicates(cfg, s, NOW).filter((x) => x.kind === 'double'), []);
});
test('duplicates: two different bills with the same amount and day are not called the same bill; names that simplify to nothing are skipped', () => {
  const { s, cfg } = demo((x) => { x.answers.bills = [{ id: 'phone', amount: 50, due: 1 }, { id: 'internet', amount: 50, due: 1 }, { id: 'r1', name: '家賃', amount: 500, due: 1 }, { id: 'r2', name: '電気', amount: 60, due: 5 }]; });
  assert.deepEqual(I.duplicates(cfg, s, NOW).filter((x) => x.kind === 'bill-dup'), []);
});
test('duplicates: dismissed items free their slot instead of hiding new ones', () => {
  const { s, cfg } = demo((x) => { x.subs = []; x.transactions = []; for (let i = 0; i < 10; i++) x.transactions.push(tx(days(-20 - i * 5), 'Shop ' + String.fromCharCode(97 + i), 20 + i), tx(days(-20 - i * 5), 'Shop ' + String.fromCharCode(97 + i), 20 + i)); });
  const all = I.duplicates(cfg, s, NOW); assert.equal(all.length, 8);
  s.settings.dismissed = all.slice(0, 3).map((d) => d.id);
  const rest = I.duplicates(cfg, s, NOW); assert.equal(rest.length, 7); assert.ok(rest.every((d) => !s.settings.dismissed.includes(d.id)));
});
test('project: displayed rates have no floating-point noise', () => {
  const r = I.project({ monthly: 100, start: 0, years: 5, rates: { blend: 3.7 } }).filter((x) => x.id === 'blend')[0];
  assert.equal(r.rates.low, 0.7); assert.equal(r.rates.high, 6.2); assert.equal(r.rates.mid, 3.7);
});
test('store: balanceChecked is a date or null; pain is deduplicated and capped', () => {
  const raw = (settings, answers) => ({ v: 1, mode: 'real', onboarded: true, settings, answers });
  assert.equal(FD.store.sanitize(raw({ balanceChecked: '2026-10-01' })).settings.balanceChecked, '2026-10-01');
  assert.equal(FD.store.sanitize(raw({ balanceChecked: 'soon' })).settings.balanceChecked, null);
  const pain = FD.store.sanitize(raw({}, { pain: Array.from({ length: 5000 }, () => FD.catalog.PAIN[0].id) })).answers.pain;
  assert.deepEqual(pain, [FD.catalog.PAIN[0].id]);
});

test('skipped answers are never described as "what you told us" or "what you planned"', () => {
  const st = FD.store.defaultState(); st.mode = 'real'; st.answers = { payFreq: 'biweekly' };   // pay and spending skipped: both are typical defaults
  st.transactions = [1, 2, 3].map((k) => ({ id: 'p' + k, date: days(-14 * k), type: 'income', amount: 2200, category: 'pay', note: 'Pay' }));
  for (let k = 0; k < 60; k++) st.transactions.push(tx(days(-k), 'Cafe ' + (k % 7), 30 + (k % 5), 'dining'));
  const cfg = FD.config.buildConfig(st.answers, st.settings, NOW);
  assert.deepEqual(I.drift(cfg, st, NOW).filter((x) => x.kind === 'pay' || x.kind === 'var'), []);
  assert.deepEqual(I.opportunities(cfg, st, NOW).filter((x) => x.kind === 'over'), []);
});
test('plan: goals that need more than the leftover are flagged (the tight card shows the note)', () => {
  const { s, cfg } = demo((x) => { x.answers.goals = [{ id: 'g-car', type: 'car', target: 9000, date: U.iso(U.addDays(NOW, 120)), created: U.iso(NOW), saved0: 0 }]; });
  const p = I.plan(cfg, s, NOW);
  assert.equal(p.status, 'tight'); assert.equal(p.goalsOverCapacity, true); assert.equal(p.capacity, 0);
});
