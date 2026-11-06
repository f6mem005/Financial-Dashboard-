/* ideas.js - suggestions built from your own numbers: how much you could set aside, a simple growth illustration,
   places you could spend less, charges that look doubled up, and things that changed since you set up.
   Pure functions over (config, state, now). No DOM. Education only: nothing here is a recommendation of any product. */
(function (root) {
  'use strict';
  var FD = (root.FD = root.FD || {});
  var U = FD.util, C = FD.catalog, E = FD.engine;

  function sum(list, f) { return list.reduce(function (s, x) { return s + f(x); }, 0); }
  function floor5(n) { return Math.max(0, Math.floor(n / 5) * 5); }
  function r0(n) { return Math.round(n); }
  function norm(s) { return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim(); }
  function median(a) { var s = a.slice().sort(function (x, y) { return x - y; }), m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; }
  function money(n, o) { return U.money(n, o); }

  /* =====================================================================
     1. How much could you set aside?
     ===================================================================== */
  var EXPENSIVE_APR = 8; // debts above this usually cost more than savings or investments tend to earn

  function plan(cfg, state, now) {
    var vm = E.variableMonthly(cfg, state, now);
    var income = cfg.baseMonthly + cfg.extraMonthly;                       // the cautious (low-month) income if yours varies
    var bills = sum(cfg.bills, function (b) { return b.amount; });
    var variable = sum(vm.rows, function (r) { return r.monthly; });
    var debtMin = sum(cfg.debts, function (d) { return d.min; });
    var annual = sum(cfg.annual, function (a) { return a.amount; }) / 12;
    var goals = state.settings.includeGoals === false ? 0 : sum(cfg.goals, function (g) { var st = E.goalStatus(g, state, now); return st.status === 'done' ? 0 : st.needed; });
    var essentialsVar = sum(vm.rows.filter(function (r) { return r.id === 'groceries' || r.id === 'transport'; }), function (r) { return r.monthly; });
    var essentials = bills + debtMin + annual + essentialsVar;             // what has to be paid even in a bad month
    var free = income - bills - variable - debtMin - annual;               // before any goal savings
    var capacity = Math.max(0, free - goals);                              // what is genuinely left once goal savings are covered
    // anything the person skipped was filled in with a typical amount; never present advice built on a made-up income as their own
    var guessed = [];
    if (cfg.assumed.some(function (a) { return /^(Paychecks of|Income of)/.test(a); })) guessed.push('your pay');
    if (state.answers.bills === undefined || state.answers.bills === null) guessed.push('your bills');
    if (state.answers.variable === undefined || state.answers.variable === null) guessed.push('your everyday spending');
    var out = { income: income, bills: bills, variable: variable, debtMin: debtMin, annualMonthly: annual, goalMonthly: goals,
      essentials: essentials, free: free, capacity: capacity, comfortable: floor5(capacity * 0.5), stretch: floor5(capacity * 0.8),
      status: income <= 0 || guessed.indexOf('your pay') >= 0 ? 'unknown' : free < 0 ? 'deficit' : capacity < 25 ? 'tight' : 'ok', goalsOverCapacity: goals > free + 0.5,
      guessed: guessed, usingLogged: vm.usingLogged, steps: [], cushion: null, expensiveDebt: [] };
    if (out.status === 'unknown') { out.capacity = out.comfortable = out.stretch = 0; return out; }   // no number at all rather than one built on guesses

    // 1. a cushion: about 3 months of the things you must pay
    var have = state.settings.savingsBalance === null || state.settings.savingsBalance === undefined ? null : U.num(state.settings.savingsBalance, 0, 0, 1e8);
    var target = essentials * 3;
    out.cushion = { target1: essentials, target3: target, have: have, monthsCovered: have === null || essentials <= 0 ? null : have / essentials,
      done: have !== null && essentials > 0 && have >= target, gap: have === null ? target : Math.max(0, target - have) };
    // 2. debts that cost more than saving is likely to earn
    out.expensiveDebt = cfg.debts.filter(function (d) { return d.apr >= EXPENSIVE_APR && d.balance > 0; }).map(function (d) {
      return { name: d.name, apr: d.apr, balance: d.balance, guess: d.aprGuess, yearlyInterest: d.balance * d.apr / 100 };
    });

    var steps = [];
    steps.push({ id: 'cushion', done: out.cushion.done, title: 'Build a cushion', amount: out.comfortable });
    if (out.expensiveDebt.length) steps.push({ id: 'debt', done: false, title: 'Pay down high-interest debt', amount: out.comfortable });
    steps.push({ id: 'invest', done: false, title: 'Invest for the long term', amount: out.comfortable });
    var now1 = false;
    steps.forEach(function (s) { s.status = s.done ? 'done' : !now1 ? (now1 = true, 'now') : 'later'; });
    out.steps = steps;
    return out;
  }

  /* extra payment on top of minimums: how much sooner, how much interest saved (uses the same payoff maths as the Plan tab) */
  function debtBoost(cfg, extra) {
    if (!cfg.debts.length || extra <= 0) return null;
    var base = E.payoff(cfg.debts, 0, 'avalanche'), boosted = E.payoff(cfg.debts, extra, 'avalanche');
    if (base.stuck) return { stuckBefore: true, monthsWith: boosted.months, monthsWithout: null, interestSaved: null, stuckAfter: boosted.stuck };
    return { stuckBefore: false, stuckAfter: boosted.stuck, monthsWith: boosted.months, monthsWithout: base.months, interestSaved: Math.max(0, base.interest - boosted.interest) };
  }

  /* =====================================================================
     2. What could it grow into? (generic types of investment, illustrative only)
     Rates are per year AFTER inflation and fees, so results are in today's money. They are planning ranges, not forecasts.
     ===================================================================== */
  var INSTRUMENTS = [
    { id: 'savings', name: 'Savings account', blurb: 'Money in a bank that earns a little interest. Very steady. Grows slowly.', real: { low: 0, mid: 0.5, high: 1.5 } },
    { id: 'bonds', name: 'Bond index fund', blurb: 'A fund that lends to governments and companies. Usually steadier than stocks, but it can still lose value.', real: { low: 0, mid: 1.5, high: 3 } },
    { id: 'blend', name: 'Mixed fund (about 60% stocks, 40% bonds)', blurb: 'A blend of the two. A middle road between steady and bumpy.', real: { low: 0.5, mid: 3.5, high: 6 } },
    { id: 'stocks', name: 'Broad stock index fund', blurb: 'A fund that holds a slice of the whole stock market. Bumpy from year to year; over decades it has historically grown the most, but it can fall a lot and stay down for years.', real: { low: 1, mid: 5, high: 8 } }
  ];

  /* Value after each year of saving `monthly` a month (added at the end of each month) starting from `start`, growing at `ratePct` a year. */
  function growth(opts) {
    var monthly = U.num(opts.monthly, 0, 0, 100000), start = U.num(opts.start, 0, 0, 1e9), years = Math.round(U.num(opts.years, 10, 1, 60)), ratePct = U.num(opts.ratePct, 0, -20, 30);
    var rm = Math.pow(1 + ratePct / 100, 1 / 12) - 1, bal = start, pts = [{ year: 0, value: start, contributed: start }];
    for (var m = 1; m <= years * 12; m++) {
      bal = bal * (1 + rm) + monthly;
      if (m % 12 === 0) pts.push({ year: m / 12, value: bal, contributed: start + monthly * m });
    }
    return pts;
  }
  /* every instrument at its cautious / middle / hopeful rate; `rates` can override the middle rate per instrument id */
  function project(opts) {
    var rates = opts.rates || {};
    return INSTRUMENTS.map(function (ins) {
      var mid = rates[ins.id] !== undefined ? U.num(rates[ins.id], ins.real.mid, -20, 30) : ins.real.mid;
      var shift = mid - ins.real.mid, low = Math.round((ins.real.low + shift) * 100) / 100, high = Math.round((ins.real.high + shift) * 100) / 100;
      mid = Math.round(mid * 100) / 100;
      var args = function (r) { return { monthly: opts.monthly, start: opts.start, years: opts.years, ratePct: r }; };
      return { id: ins.id, name: ins.name, blurb: ins.blurb, rates: { low: low, mid: mid, high: high }, low: growth(args(low)), mid: growth(args(mid)), high: growth(args(high)) };
    });
  }

  /* =====================================================================
     3. Ways to spend less
     ===================================================================== */
  var FLEX = ['dining', 'shopping', 'fun', 'gaming', 'pets', 'family'];
  function monthStart(d, back) { return new Date(d.getFullYear(), d.getMonth() - back, 1); }
  function catMonthTotals(state, now, id, monthsBack) { // totals for each of the previous `monthsBack` full months (oldest first), counts of months with any spending
    var totals = [];
    for (var b = monthsBack; b >= 1; b--) {
      var key = U.monthKey(monthStart(now, b)), t = 0;
      state.transactions.forEach(function (x) { if (x.type === 'expense' && x.category === id && x.date.slice(0, 7) === key) t += x.amount; });
      totals.push(t);
    }
    return totals;
  }
  function opportunities(cfg, state, now) {
    var items = [], vm = E.variableMonthly(cfg, state, now), seen = Object.create(null);
    var nowIso = U.iso(now), key = U.monthKey(now), day = now.getDate(), dim = U.daysInMonth(now.getFullYear(), now.getMonth());
    function add(o) { if (o.saves > 0.5 && !seen[o.id]) { seen[o.id] = true; o.saves = r0(o.saves); items.push(o); } }
    var name = function (id) { return C.nameOf(C.CATEGORIES, id); };

    // 3a. spending running above your own recent normal
    cfg.variable.forEach(function (v) {
      if (FLEX.indexOf(v.id) < 0 && v.id !== 'groceries' && v.id !== 'transport') return;
      var past = catMonthTotals(state, now, v.id, 3).filter(function (t) { return t > 0; });
      var thisMonth = 0; state.transactions.forEach(function (x) { if (x.type === 'expense' && x.category === v.id && x.date.slice(0, 7) === key && x.date <= nowIso) thisMonth += x.amount; });
      if (past.length >= 2 && day >= 10) {
        var avg = sum(past, function (t) { return t; }) / past.length, pace = thisMonth / day * dim;
        if (pace >= avg * 1.25 && pace - avg >= 20) add({ id: 'trend-' + v.id, kind: 'trend', title: name(v.id) + ' is running higher than usual',
          detail: 'This month is on pace for ' + money(pace) + ', compared with about ' + money(avg) + ' a month recently.', saves: (pace - avg) * 12,
          rule: 'If you came back down to your recent average.' });
      }
    });
    // 3b. logged spending above what you planned
    if (vm.usingLogged && state.answers.variable !== undefined && state.answers.variable !== null) vm.rows.forEach(function (r) {   // only against amounts the person gave, never typical defaults
      if (r.id === 'unbudgeted' || r.guess <= 0 || (FLEX.indexOf(r.id) < 0 && r.id !== 'groceries' && r.id !== 'transport')) return;
      if (r.monthly > r.guess * 1.2 && r.monthly - r.guess >= 25 && !seen['trend-' + r.id]) add({ id: 'over-' + r.id, kind: 'over', title: name(r.id) + ' is above what you planned',
        detail: 'You planned ' + money(r.guess) + ' a month; your logged spending averages ' + money(r.monthly) + '.', saves: (r.monthly - r.guess) * 12, rule: 'If you came back to the amount you planned.' });
    });
    // 3c. lots of small purchases
    var recentFrom = U.iso(U.addDays(now, -30)), byCat = Object.create(null);
    state.transactions.forEach(function (x) { if (x.type === 'expense' && x.date >= recentFrom && x.date <= nowIso && FLEX.indexOf(x.category) >= 0) { (byCat[x.category] = byCat[x.category] || []).push(x.amount); } });
    Object.keys(byCat).forEach(function (id) {
      var a = byCat[id], total = sum(a, function (x) { return x; }), avg = total / a.length;
      if (a.length >= 12 && avg < 25) add({ id: 'small-' + id, kind: 'small', title: 'Lots of small ' + name(id).toLowerCase() + ' purchases',
        detail: a.length + ' purchases in the last 30 days, averaging ' + money(avg) + ', add up to ' + money(total) + '.', saves: total * 0.25 * 12, rule: 'If you skipped about one in four.' });
    });
    // 3d. subscriptions
    var sub = E.subscriptions(cfg, state);
    if (sub.monthly >= 10) add({ id: 'subs', kind: 'subs', title: 'Subscriptions cost ' + money(sub.yearly) + ' a year',
      detail: 'That is about ' + money(sub.monthly) + ' a month. It is worth looking through them for ones you rarely use.', saves: sub.yearly * 0.1, rule: 'If you trimmed about a tenth.' });
    // 3e. fees
    var feeFrom = U.iso(U.addDays(now, -90)), fees = [];
    state.transactions.forEach(function (x) { if (x.type === 'expense' && x.date >= feeFrom && x.date <= nowIso && /\b(fee|overdraft|nsf|late charge|service charge|finance charge|interest charge|atm)\b/i.test(x.note)) fees.push(x); });
    if (fees.length) { var ft = sum(fees, function (x) { return x.amount; }); add({ id: 'fees', kind: 'fees', title: 'Possible bank or card fees',
      detail: fees.length + ' charge' + (fees.length === 1 ? '' : 's') + ' that look like fees, ' + money(ft) + ' in the last 3 months. Banks will sometimes refund a first fee if you ask.', saves: ft * 4 * 0.5, rule: 'If you avoided about half of them.' }); }
    // 3f. interest on expensive debt
    cfg.debts.forEach(function (d) {
      if (d.apr >= 15 && d.balance > 0) add({ id: 'interest-' + d.id, kind: 'interest', title: d.name + ' costs about ' + money(d.balance * d.apr / 100) + ' a year in interest',
        detail: 'At ' + d.apr + '%' + (d.aprGuess ? ' (a typical rate; check your statement)' : '') + ' on ' + money(d.balance) + '. Paying it down faster, or asking about a lower rate, reduces this.', saves: d.balance * d.apr / 100 * 0.25, rule: 'If you cut the balance by a quarter.' });
    });
    // 3g. fallback so there is always something concrete: the biggest flexible categories
    var ownSpending = state.answers.variable !== undefined && state.answers.variable !== null;   // never build ideas on typical amounts we filled in
    if (items.length < 2 && ownSpending) vm.rows.filter(function (r) { return FLEX.indexOf(r.id) >= 0 && r.monthly >= 40; }).sort(function (a, b) { return b.monthly - a.monthly; }).slice(0, 2).forEach(function (r) {
      add({ id: 'trim-' + r.id, kind: 'trim', title: name(r.id) + ' is one of your bigger flexible costs', detail: 'About ' + money(r.monthly) + ' a month.', saves: r.monthly * 0.1 * 12, rule: 'A 10% trim.' });
    });
    items.sort(function (a, b) { return b.saves - a.saves; });
    return items.slice(0, 6);
  }

  /* =====================================================================
     4. Possible duplicates
     ===================================================================== */
  var OVERLAP = [
    ['video streaming', /\b(netflix|hulu|disney|hbo|paramount|peacock|crunchyroll|prime video|apple tv|youtube tv|video streaming)\b/],
    ['music', /\b(spotify|apple music|youtube music|tidal|pandora|deezer|amazon music|music)\b/],
    ['cloud storage', /\b(icloud|google one|dropbox|onedrive|cloud storage)\b/],
    ['fitness', /\b(gym|fitness|peloton|classpass|yoga)\b/]
  ];
  function duplicates(cfg, state, now) {
    var out = [], subs = state.subs || [], dismissed = Object.create(null);
    (state.settings.dismissed || []).forEach(function (d) { dismissed[d] = true; });
    // same name listed twice
    var byName = Object.create(null);
    subs.forEach(function (s) { var k = norm(s.name); if (k) (byName[k] = byName[k] || []).push(s); });
    Object.keys(byName).forEach(function (k) {
      var g = byName[k]; if (g.length < 2) return;
      var cheapest = Math.min.apply(null, g.map(function (s) { return s.cycle === 'yearly' ? s.amount : s.amount * 12; }));
      out.push({ id: 'subname:' + k.replace(/ /g, '-').slice(0, 40), kind: 'sub-same', title: '"' + g[0].name + '" is listed ' + g.length + ' times',
        detail: g.map(function (s) { return money(s.amount, { cents: true }) + ' ' + s.cycle; }).join(' and ') + '. If it is one service, remove the extra.', saves: cheapest });
    });
    // two services of the same kind
    OVERLAP.forEach(function (o) {
      var hits = subs.filter(function (s) { return o[1].test(norm(s.name)); });
      var distinct = Object.create(null); hits.forEach(function (s) { distinct[norm(s.name)] = s; });
      var list = Object.keys(distinct).map(function (k) { return distinct[k]; });
      if (list.length >= 2) {
        var cheapest = Math.min.apply(null, list.map(function (s) { return s.cycle === 'yearly' ? s.amount : s.amount * 12; }));
        out.push({ id: 'overlap:' + o[0].replace(/ /g, '-'), kind: 'sub-overlap', title: 'You have ' + list.length + ' ' + o[0] + ' services',
          detail: list.map(function (s) { return s.name; }).join(' and ') + '. Many people only use one.', saves: cheapest });
      }
    });
    // two bills that look the same
    var seenBill = Object.create(null);
    cfg.bills.forEach(function (b) {
      var k = norm(b.name);
      if (!k) return;                                                      // names with no Latin letters or digits all look alike once simplified; skip rather than guess
      [['n:' + k, 'the same name']].forEach(function (p) {
        if (!seenBill[p[0]]) { seenBill[p[0]] = b; return; }
        var other = seenBill[p[0]]; if (other === b) return;
        var id = 'bill:' + norm(other.name + ' ' + b.name).replace(/ /g, '-').slice(0, 40);
        if (!out.some(function (o) { return o.id === id; })) out.push({ id: id, kind: 'bill-dup', title: '"' + other.name + '" and "' + b.name + '" look like the same bill', detail: 'They have ' + p[1] + '. If it is one bill, remove one.', saves: Math.min(other.amount, b.amount) * 12 });
      });
    });
    // charges that look doubled: same place, same amount, within 3 days
    var tx = state.transactions.filter(function (t) { return t.type === 'expense' && t.amount >= 10 && norm(t.note) && !t.goalId && !t.billId && t.date <= U.iso(now); }).sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; });
    var byKey = Object.create(null);
    tx.forEach(function (t) { var k = norm(t.note) + '|' + t.amount; (byKey[k] = byKey[k] || []).push(t); });
    Object.keys(byKey).forEach(function (k) {
      var g = byKey[k], cluster = [g[0]];
      function flush() {
        if (cluster.length === 2 && cluster[0].id !== cluster[1].id) {   // exactly two close together; a run of daily purchases is a habit, not a double charge
          var a = cluster[0], b = cluster[1];
          out.push({ id: 'double:' + b.id, kind: 'double', txnId: b.id, title: 'Two ' + money(b.amount, { cents: true }) + ' charges for "' + b.note + '"',
            detail: U.fmtDate(U.parseISO(a.date)) + ' and ' + U.fmtDate(U.parseISO(b.date)) + '. A double charge, or two real purchases?', saves: b.amount, oneOff: true });
        }
      }
      for (var i = 1; i < g.length; i++) {
        var gap = U.diffDays(U.parseISO(g[i - 1].date), U.parseISO(g[i].date));
        if (gap >= 0 && gap <= 3) cluster.push(g[i]); else { flush(); cluster = [g[i]]; }
      }
      flush();
    });
    return out.filter(function (d) { return !dismissed[d.id]; }).slice(0, 8);
  }

  /* =====================================================================
     5. Things that changed since you set up (compares what you log with what you told us)
     ===================================================================== */
  function drift(cfg, state, now) {
    var out = [], dismissed = Object.create(null), nowIso = U.iso(now);
    (state.settings.dismissed || []).forEach(function (d) { dismissed[d] = true; });
    var balanceItem = null;
    function add(s) { if (!dismissed[s.id]) out.push(s); }
    var from = function (days) { return U.iso(U.addDays(now, -days)); };

    // income
    var payAssumed = cfg.assumed.some(function (a) { return /^(Paychecks of|Income of)/.test(a); });   // never say "you told us" about a typical default
    if (!cfg.irregular && !payAssumed) {
      var pays = state.transactions.filter(function (t) { return t.type === 'income' && t.category === 'pay' && t.date >= from(120) && t.date <= nowIso; }).sort(function (a, b) { return a.date < b.date ? 1 : -1; }).slice(0, 3);
      if (pays.length >= 2) {
        var m = median(pays.map(function (p) { return p.amount; }));
        if (Math.abs(m - cfg.payAmount) / cfg.payAmount >= 0.08 && Math.abs(m - cfg.payAmount) >= 25) add({ id: 'pay:' + r0(m), kind: 'pay', title: 'Your paychecks look different',
          detail: 'Your last ' + pays.length + ' paychecks were about ' + money(m) + '. You told us ' + money(cfg.payAmount) + '.', apply: { kind: 'pay', amount: r0(m) } });
      }
    }
    // bills that now cost something else
    cfg.bills.forEach(function (b) {
      var pays = state.transactions.filter(function (t) { return t.type === 'expense' && (t.category === b.id || t.billId === b.id) && t.date >= from(100) && t.date <= nowIso; }).sort(function (a, c) { return a.date < c.date ? 1 : -1; });
      if (pays.length < 2) return;
      var a1 = pays[0].amount, a2 = pays[1].amount;
      if (Math.abs(a1 - a2) / Math.max(a1, a2) <= 0.02 && Math.abs(a1 - b.amount) / b.amount >= 0.05 && Math.abs(a1 - b.amount) >= 3) add({ id: 'bill:' + b.id + ':' + r0(a1), kind: 'bill', title: b.name + ' now costs something different',
        detail: 'The last two payments were ' + money(a1, { cents: a1 % 1 !== 0 }) + '. You told us ' + money(b.amount) + '.', apply: { kind: 'bill', id: b.id, amount: U.round2(a1) } });
    });
    // everyday spending that has settled somewhere else
    var vm = E.variableMonthly(cfg, state, now);
    if (vm.usingLogged && state.answers.variable !== undefined && state.answers.variable !== null) vm.rows.forEach(function (r) {
      if (r.id === 'unbudgeted' || r.guess <= 0) return;
      if (Math.abs(r.monthly - r.guess) / r.guess >= 0.25 && Math.abs(r.monthly - r.guess) >= 25 && r5(r.monthly) > 0) add({ id: 'var:' + r.id + ':' + r5(r.monthly), kind: 'var', title: C.nameOf(C.CATEGORIES, r.id) + ' has settled at a different level',
        detail: 'Over the last few months it averages ' + money(r.monthly) + ' a month. You told us ' + money(r.guess) + '.', apply: { kind: 'var', id: r.id, amount: r5(r.monthly) } });
    });
    function r5(n) { return Math.round(n / 5) * 5; }
    // a charge that comes back every month but isn't in your bills
    var known = cfg.bills.map(function (b) { return norm(b.name); }).concat((state.subs || []).map(function (s) { return norm(s.name); }));
    var groups = Object.create(null);
    state.transactions.forEach(function (t) {
      if (t.type !== 'expense' || t.date > nowIso || t.date < U.iso(monthStart(now, 3)) || t.amount < 5) return;
      var cat = C.find(C.CATEGORIES, t.category); if (!cat || cat.kind !== 'var' || t.category === 'groceries') return;
      var k = norm(t.note); if (k.length < 3) return;
      (groups[k] = groups[k] || []).push(t);
    });
    Object.keys(groups).forEach(function (k) {
      var g = groups[k], months = Object.create(null); g.forEach(function (t) { months[t.date.slice(0, 7)] = (months[t.date.slice(0, 7)] || 0) + 1; });
      var mk = Object.keys(months); if (mk.length < 3 || mk.some(function (x) { return months[x] > 2; })) return;
      var med = median(g.map(function (t) { return t.amount; }));
      if (!g.every(function (t) { return Math.abs(t.amount - med) / med <= 0.1; })) return;
      if (known.some(function (n) { return n && (n.indexOf(k) >= 0 || k.indexOf(n) >= 0); })) return;
      var latest = g.slice().sort(function (a, b) { return a.date < b.date ? 1 : -1; })[0];
      add({ id: 'newbill:' + k.replace(/ /g, '-').slice(0, 40), kind: 'newbill', title: 'Looks like a monthly bill: "' + latest.note + '"',
        detail: money(med, { cents: med % 1 !== 0 }) + ' in ' + mk.length + ' of the last 4 months, and it is not in your bills yet.', apply: { kind: 'newbill', name: latest.note, amount: U.round2(med), due: Math.round(median(g.map(function (t) { return U.parseISO(t.date).getDate(); }))), txnIds: g.slice(0, 12).map(function (t) { return t.id; }) } });
    });
    // balance not updated for a while
    var bd = state.settings.balanceSet ? (U.parseISO(state.settings.balanceChecked) || U.parseISO(state.settings.balanceDate)) : null;   // the last time you confirmed it, not the first
    if (bd && U.diffDays(bd, now) >= 30 && !dismissed['balance:' + U.monthKey(now)]) balanceItem = ({ id: 'balance:' + U.monthKey(now), kind: 'balance', title: 'Update your balance', detail: 'You last confirmed it ' + U.diffDays(bd, now) + ' days ago. Spending you did not log makes the forecast drift.', apply: { kind: 'goto', tab: 'settings' } });
    if (balanceItem) out.unshift(balanceItem);   // a stale balance makes everything else less reliable, so it always makes the list
    return out.slice(0, 4);
  }

  FD.ideas = { plan: plan, debtBoost: debtBoost, INSTRUMENTS: INSTRUMENTS, growth: growth, project: project, opportunities: opportunities, duplicates: duplicates, drift: drift, EXPENSIVE_APR: EXPENSIVE_APR };
  if (typeof module !== 'undefined' && module.exports) module.exports = FD;
})(typeof window !== 'undefined' ? window : globalThis);
