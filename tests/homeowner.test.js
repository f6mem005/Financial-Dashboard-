// Home owners as well as renters: mortgage, HOA / association dues, property tax, home insurance, upkeep and big repairs have their own categories,
// are read from bank CSVs, are saved and read back, and are never suggested as something to trim.
const test = require('node:test');
const assert = require('node:assert/strict');
['util', 'catalog', 'config', 'engine', 'store', 'sample', 'ideas', 'csv'].forEach((m) => require('../js/' + m + '.js'));
const FD = globalThis.FD, C = FD.catalog, U = FD.util, I = FD.ideas;
const NOW = new Date(2026, 10, 5);

test('home owner categories exist next to rent, with sensible typical amounts', () => {
  for (const id of ['rent', 'mortgage', 'hoa', 'proptax', 'homeins']) assert.ok(C.find(C.BILLS, id), 'bill ' + id);
  for (const id of ['proptaxy', 'homeinsy', 'hoayear', 'homebig']) assert.ok(C.find(C.ANNUAL, id), 'yearly cost ' + id);
  assert.ok(C.find(C.VARIABLE, 'homerepair'), 'home upkeep');
  assert.ok(C.find(C.DEBTS, 'heloc'), 'home equity loan');
  assert.ok(C.find(C.GOALS, 'housedown') && C.find(C.GOALS, 'homefund'), 'home goals');
  C.BILLS.forEach((b) => { assert.ok(b.d > 0 && b.due >= 1 && b.due <= 31, b.id); });
  C.ANNUAL.forEach((a) => { assert.ok(a.d > 0 && a.month >= 1 && a.month <= 12, a.id); });
  C.VARIABLE.forEach((v) => assert.ok(v.d > 0, v.id));
  assert.match(C.QUESTIONS.find((q) => q.id === 'bills').help, /mortgage/i);
  assert.match(C.QUESTIONS.find((q) => q.id === 'debts').help, /mortgage goes under fixed bills/i, 'a mortgage is a bill, not a debt-plan debt (it would be counted twice)');
});

test('ids stay unique inside each list, and every one is a valid stored id', () => {
  const ID_OK = /^[A-Za-z0-9_-]{1,60}$/;
  for (const [name, list] of [['BILLS', C.BILLS], ['VARIABLE', C.VARIABLE], ['ANNUAL', C.ANNUAL], ['DEBTS', C.DEBTS], ['GOALS', C.GOALS]]) {
    const ids = list.map((x) => x.id); assert.equal(new Set(ids).size, ids.length, name + ' has a duplicate id'); ids.forEach((id) => assert.match(id, ID_OK, id));
  }
  const cats = C.CATEGORIES.map((c) => c.id); assert.equal(new Set(cats).size, cats.length, 'a bill and a spending category share an id');
});

test('mortgage, HOA dues, property tax and upkeep are saved, read back and turned into a plan', () => {
  const answers = { payFreq: 'monthly', pay: { amount: 7000, none: false, nextPayday: U.iso(U.addDays(NOW, 10)) }, otherIncome: [],
    bills: [{ id: 'mortgage', amount: 2100, due: 1 }, { id: 'hoa', amount: 310, due: 5 }, { id: 'proptax', amount: 380, due: 1 }, { id: 'homeins', amount: 125, due: 1 }],
    variable: [{ id: 'homerepair', monthly: 200 }, { id: 'groceries', monthly: 600 }],
    annual: [{ id: 'homebig', amount: 1500, month: 6 }, { id: 'hoayear', amount: 600, month: 1 }],
    debts: [{ id: 'd-heloc', type: 'heloc', balance: 20000, min: 220, apr: 8.5, aprKnown: true }],
    goals: [{ id: 'g-housedown', type: 'housedown', target: 20000, date: '2028-06-01', saved0: 0, created: U.iso(NOW) }] };
  const st = FD.store.sanitize({ v: 1, mode: 'real', onboarded: true, answers, settings: { balanceSet: true, openingBalance: 3000 } });
  assert.deepEqual(st.answers.bills.map((b) => b.id), ['mortgage', 'hoa', 'proptax', 'homeins']);
  assert.equal(st.answers.annual.length, 2); assert.equal(st.answers.debts[0].type, 'heloc');
  const cfg = FD.config.buildConfig(st.answers, st.settings, NOW);
  assert.deepEqual(cfg.bills.map((b) => b.name), ['Mortgage', 'HOA / association dues', 'Property tax', 'Home / renters insurance']);
  assert.equal(cfg.bills.reduce((t, b) => t + b.amount, 0), 2100 + 310 + 380 + 125);
  assert.ok(cfg.annual.some((a) => a.name === 'Big home repairs') && cfg.annual.some((a) => a.name === 'HOA yearly dues'));
  assert.equal(cfg.variable.find((v) => v.id === 'homerepair').name, 'Home upkeep');
  assert.equal(cfg.debts[0].name, 'Home equity loan / HELOC');
});

test('a transaction can be logged against the new categories (they survive validation)', () => {
  const tx = ['mortgage', 'hoa', 'proptax', 'homeins', 'homerepair'].map((c, i) => ({ id: 't' + i, date: '2026-11-0' + (i + 1), type: 'expense', amount: 100 + i, category: c, note: c }));
  const st = FD.store.sanitize({ v: 1, mode: 'real', onboarded: true, answers: {}, settings: {}, transactions: tx });
  assert.deepEqual(st.transactions.map((t) => t.category).sort(), ['hoa', 'homeins', 'homerepair', 'mortgage', 'proptax']);
});

test('bank CSV lines for housing are recognised (and a mortgage is not mistaken for a plain loan)', () => {
  const cat = FD.csv.categorize;
  assert.equal(cat('CHASE MORTGAGE PAYMENT'), 'mortgage'); assert.equal(cat('Wells Fargo Home Mortgage'), 'mortgage'); assert.equal(cat('HOME LOAN PMT'), 'mortgage');
  assert.equal(cat('SUNSET RIDGE HOA DUES'), 'hoa'); assert.equal(cat('Maple Court Homeowners Association'), 'hoa'); assert.equal(cat('CONDO FEE'), 'hoa');
  assert.equal(cat('COUNTY TAX COLLECTOR'), 'proptax'); assert.equal(cat('Property Tax 2nd half'), 'proptax');
  assert.equal(cat('State Farm Homeowners Insurance'), 'homeins', 'a home policy from an insurer that also sells car insurance');
  assert.equal(cat('HOME DEPOT #1234'), 'homerepair'); assert.equal(cat('Bob\'s Plumbing'), 'homerepair');
  assert.equal(cat('STATE FARM AUTO INSURANCE'), 'carins'); assert.equal(cat('NAVIENT STUDENT LOAN'), 'debt'); assert.equal(cat('LANDLORD RENT'), 'rent');
});

test('Ideas never suggest trimming housing: mortgage, HOA, tax, insurance and home upkeep are not "flexible" costs', () => {
  const answers = { payFreq: 'monthly', pay: { amount: 6000, none: false, nextPayday: U.iso(U.addDays(NOW, 10)) }, otherIncome: [],
    bills: [{ id: 'mortgage', amount: 2500, due: 1 }, { id: 'hoa', amount: 900, due: 1 }, { id: 'proptax', amount: 700, due: 1 }, { id: 'homeins', amount: 300, due: 1 }],
    variable: [{ id: 'homerepair', monthly: 900 }, { id: 'groceries', monthly: 500 }], annual: [], debts: [] };
  const st = FD.store.sanitize({ v: 1, mode: 'real', onboarded: true, answers, settings: { balanceSet: true, openingBalance: 1000 } });
  const cfg = FD.config.buildConfig(st.answers, st.settings, NOW);
  const ideas = I.opportunities(cfg, st, NOW);
  const text = JSON.stringify(ideas);
  assert.ok(!/trim-homerepair|trim-mortgage|trim-hoa|trim-proptax|trim-homeins/.test(text), text.slice(0, 300));
  assert.ok(!/Mortgage|HOA|Property tax/.test(ideas.map((x) => x.title).join(' ')), 'no idea is about cutting a housing bill');
});

test('yearly costs show their short names, so a long label is never cut off at 40 characters', () => {
  for (const a of C.ANNUAL) assert.ok((a.short || a.label).length <= 40, a.id + ' would be cut off: ' + (a.short || a.label));
  for (const b of C.BILLS) assert.ok((b.short || b.label).length <= 40, b.id);
  for (const v of C.VARIABLE) assert.ok((v.short || v.label).length <= 40, v.id);
  for (const d of C.DEBTS) assert.ok((d.short || d.label).length <= 40, d.id);
  for (const g of C.GOALS) assert.ok((g.short || g.label).length <= 40, g.id);
});

test('bank CSV: housing phrases beat loose words (found in review), and look-alikes are not caught', () => {
  const cat = FD.csv.categorize, curly = String.fromCharCode(8217);
  assert.equal(cat('SHELLPOINT MORTGAGE SERVICING'), 'mortgage', 'not gas because of "shell"');
  assert.equal(cat('METRO MORTGAGE CO'), 'mortgage', 'not transit because of "metro"');
  assert.equal(cat('Metropolitan Life HOME INSURANCE'), 'homeins');
  assert.equal(cat('TACOMA HVAC'), 'homerepair', 'not eating out because of "taco"');
  assert.equal(cat('PROPERTY OWNERS INS CO'), 'homeins', 'an insurer, not an association');
  assert.equal(cat('Lowe' + curly + 's #123'), 'homerepair'); assert.equal(cat("Lowe's #123"), 'homerepair'); assert.equal(cat('LOWES 0456'), 'homerepair');
  assert.equal(cat('RIVERBEND HOA'), 'hoa'); assert.equal(cat('HOA DUES AUTOPAY'), 'hoa'); assert.equal(cat('SUNSET RIDGE HOA FEE'), 'hoa');
  assert.equal(cat('Hoa Binh Market'), 'groceries', 'Hoa is a common name'); assert.equal(cat('PHO HOA RESTAURANT'), 'dining');
  assert.equal(cat('SHELL OIL 5521'), 'transport'); assert.equal(cat('METRO TRANSIT'), 'transport'); assert.equal(cat('TACO BELL'), 'dining');
  assert.equal(cat('STATE FARM AUTO INSURANCE'), 'carins'); assert.equal(cat('SALES TAX'), 'other');
});

test('bank CSV: the usual ways a bank writes an HOA payment are recognised, and the name Hoa is still not', () => {
  const cat = FD.csv.categorize;
  for (const d of ['HOA ACH', 'HOA-DUES', 'HOA *DUES', 'HOA #1234', 'HOA MGMT', 'HOA ACH PMT', 'OAKS HOA - ACH', 'SUNSET HOA ASSOC', 'HOA DUES', 'RIVERBEND HOA']) assert.equal(cat(d), 'hoa', d);
  for (const d of ['Hoa Binh Market', 'HOA BINH SUPERMARKET', 'PHO HOA RESTAURANT']) assert.notEqual(cat(d), 'hoa', d);
});
