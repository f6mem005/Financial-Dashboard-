/* sample.js — demo persona with deterministic, relative-to-today data. Never written to storage. */
(function (root) {
  'use strict';
  var FD = (root.FD = root.FD || {});
  var U = FD.util;

  function rng(seed) { // small deterministic PRNG so the demo (and tests) are stable
    var s = seed >>> 0;
    return function () { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
  }

  function build(now) {
    now = now || U.today();
    var iso = U.iso;
    var lastPay = U.addDays(now, -5);
    var answers = {
      payFreq: 'biweekly',
      pay: { amount: 1450, nextPayday: iso(U.addDays(lastPay, 14)) },
      otherIncome: [],
      bills: [
        { id: 'rent', amount: 1250, due: 1 }, { id: 'phone', amount: 55, due: 15 }, { id: 'carins', amount: 110, due: 10 },
        { id: 'utilities', amount: 90, due: 20 }, { id: 'internet', amount: 55, due: 12 }, { id: 'gym', amount: 25, due: 3 },
        { id: 'subs', amount: 38, due: 8 }
      ],
      variable: [
        { id: 'groceries', monthly: 330 }, { id: 'dining', monthly: 320 }, { id: 'transport', monthly: 150 },
        { id: 'shopping', monthly: 180 }, { id: 'fun', monthly: 140 }
      ],
      annual: [{ id: 'carreg', amount: 140, month: 8 }, { id: 'gifts', amount: 300, month: 12 }, { id: 'travel', amount: 500, month: 6 }],
      debts: [
        { id: 'd-student', type: 'student', balance: 9400, min: 110, apr: 5.5, aprKnown: true },
        { id: 'd-card', type: 'card', balance: 1850, min: 55, apr: 22.9, aprKnown: true }
      ],
      pain: ['runout', 'dontknow', 'debt', 'goal'],
      goals: [
        { id: 'g-trip', type: 'trip', target: 1200, date: iso(U.addMonths(now, 18)), created: iso(U.addDays(now, -60)), saved0: 150 },
        { id: 'g-emergency', type: 'emergency', target: 1000, date: iso(U.addMonths(now, 24)), created: iso(U.addDays(now, -60)), saved0: 0 }
      ],
      style: 'pick', checkin: 'weekly', addMode: 'both', homeFirst: 'pick'
    };

    var r = rng(42), txns = [], n = 0;
    function add(date, type, amount, category, note, goalId) {
      if (date > now) return;
      var t = { id: 'demo' + (n++), date: iso(date), type: type, amount: U.round2(amount), category: category, note: note };
      if (goalId) t.goalId = goalId;
      txns.push(t);
    }
    var start = U.addDays(now, -75);
    var notes = {
      groceries: ['Trader Joe’s', 'Kroger', 'Aldi', 'Farmers market'], dining: ['Chipotle', 'DoorDash', 'Coffee', 'Pizza night', 'Uber Eats'],
      transport: ['Gas', 'Metro card', 'Rideshare'], shopping: ['Amazon', 'Target', 'Thrift haul'], fun: ['Concert', 'Drinks with friends', 'Movies']
    };
    for (var i = 0; i <= 75; i++) {
      var d = U.addDays(start, i), dow = d.getDay(), dom = d.getDate();
      if (U.diffDays(lastPay, d) % 14 === 0 && d <= lastPay) add(d, 'income', 1450, 'pay', 'Paycheck');
      answers.bills.forEach(function (b) { if (U.clampDay(d.getFullYear(), d.getMonth(), b.due) === dom) add(d, 'expense', b.id === 'gym' && d >= U.addDays(now, -50) ? 45 : b.amount, b.id, ''); }); // the gym went up to $45 recently
      if (dom === 1) add(d, 'expense', 165, 'debt', 'Loan payments');
      if ((dow === 6 || dow === 2) && r() < 0.9) add(d, 'expense', 25 + r() * 30, 'groceries', notes.groceries[Math.floor(r() * 4)]);
      if (r() < 0.45) add(d, 'expense', 12 + r() * 24, 'dining', notes.dining[Math.floor(r() * 5)]);
      if (dow === 1 && r() < 0.8) add(d, 'expense', 25 + r() * 15, 'transport', notes.transport[Math.floor(r() * 3)]);
      if (r() < 0.12) add(d, 'expense', 25 + r() * 35, 'shopping', notes.shopping[Math.floor(r() * 3)]);
      if (dow === 5 && r() < 0.8) add(d, 'expense', 20 + r() * 30, 'fun', notes.fun[Math.floor(r() * 3)]);
      if (dow === 5 && d <= lastPay && U.diffDays(lastPay, d) % 14 === 0) add(d, 'expense', 50, 'savings', 'Trip fund', 'g-trip');
    }
    // a charge that looks doubled up, so the demo can show how those are flagged
    add(U.addDays(now, -9), 'expense', 14.99, 'dining', 'Pizza night');
    add(U.addDays(now, -8), 'expense', 14.99, 'dining', 'Pizza night');
    // one extra payday-aligned goal deposit so the trip goal has a visible pace
    add(U.addDays(lastPay, 0), 'expense', 50, 'savings', 'Trip fund', 'g-trip');
    add(U.addDays(lastPay, -14), 'expense', 50, 'savings', 'Trip fund', 'g-trip');

    var net = txns.reduce(function (s, t) { return s + (t.type === 'income' ? t.amount : -t.amount); }, 0);
    var state = FD.store.defaultState();
    state.mode = 'demo'; state.onboarded = true; state.answers = answers; state.transactions = txns;
    state.settings.openingBalance = U.round2(600 - net); state.settings.balanceSet = true;
    state.settings.minBalance = 100; state.settings.savingsBalance = 900; state.settings.balanceDate = iso(U.addDays(now, -75));
    state.subs = [
      { id: 's1', name: 'Streaming', amount: 15.99, cycle: 'monthly' }, { id: 's2', name: 'Music', amount: 10.99, cycle: 'monthly' },
      { id: 's3', name: 'Cloud storage', amount: 2.99, cycle: 'monthly' }, { id: 's4', name: 'Game pass', amount: 8, cycle: 'monthly' }, { id: 's5', name: 'Second music app', amount: 9.99, cycle: 'monthly' }
    ];
    return state;
  }
  FD.sample = { build: build };
  if (typeof module !== 'undefined' && module.exports) module.exports = FD;
})(typeof window !== 'undefined' ? window : globalThis);
