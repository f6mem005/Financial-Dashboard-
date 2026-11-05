/* engine.js — all the money math. Pure functions over (config, state, now). No DOM. */
(function (root) {
  'use strict';
  var FD = (root.FD = root.FD || {});
  var U = FD.util, C = FD.catalog;

  /* ---------- paydays ---------- */
  function paydays(cfg, from, to) {
    var out = [], anchor = U.parseISO(cfg.anchor) || from, d, k;
    if (cfg.freq === 'weekly' || cfg.freq === 'biweekly') {
      var step = cfg.freq === 'weekly' ? 7 : 14;
      var diff = U.diffDays(anchor, from);
      k = diff > 0 ? Math.ceil(diff / step) : -Math.floor(-diff / step);
      for (d = U.addDays(anchor, k * step); d <= to; d = U.addDays(d, step)) if (d >= from) out.push(d);
    } else {
      var d1 = anchor.getDate();
      var d2 = cfg.freq === 'twice' ? (d1 <= 15 ? d1 + 15 : d1 - 15) : null;
      var y = from.getFullYear(), m = from.getMonth();
      while (new Date(y, m, 1) <= to) {
        var days = d2 ? [d1, d2].sort(function (a, b) { return a - b; }) : [d1];
        days.forEach(function (dd) {
          var dt = new Date(y, m, U.clampDay(y, m, dd));
          if (dt >= from && dt <= to) out.push(dt);
        });
        m += 1; if (m > 11) { m = 0; y += 1; }
      }
    }
    return out;
  }

  /* ---------- transactions ---------- */
  function sumTxns(txns, pred) {
    var s = 0;
    txns.forEach(function (t) { if (pred(t)) s += t.type === 'income' ? t.amount : -t.amount; });
    return s;
  }
  function currentBalance(state) {
    var net = sumTxns(state.transactions, function () { return true; });
    return U.round2(U.num(state.settings.openingBalance, 0) + net);
  }
  function monthTxns(state, now, type) {
    var key = U.monthKey(now);
    return state.transactions.filter(function (t) { return t.date.slice(0, 7) === key && (!type || t.type === type); });
  }
  function spentByCategory(state, now) {
    var map = {};
    monthTxns(state, now, 'expense').forEach(function (t) { map[t.category] = (map[t.category] || 0) + t.amount; });
    return map;
  }
  function billPaid(cfg, state, bill, now) {
    var key = U.monthKey(now);
    if (state.billsPaid[bill.id + ':' + key]) return true;
    return monthTxns(state, now, 'expense').some(function (t) { return t.category === bill.id; });
  }

  /* ---------- this month ---------- */
  function monthSummary(cfg, state, now) {
    var incomeTxns = monthTxns(state, now, 'income');
    var received = incomeTxns.reduce(function (s, t) { return s + t.amount; }, 0);
    var spentMap = spentByCategory(state, now);
    var spent = 0; Object.keys(spentMap).forEach(function (k) { spent += spentMap[k]; });
    var expected = cfg.baseMonthly + cfg.extraMonthly;
    var income = Math.max(received, expected);
    var bills = cfg.bills.map(function (b) {
      var due = new Date(now.getFullYear(), now.getMonth(), U.clampDay(now.getFullYear(), now.getMonth(), b.due));
      var paid = billPaid(cfg, state, b, now);
      return { bill: b, due: due, paid: paid, overdue: !paid && due < now };
    });
    return { received: received, expected: expected, income: income, spent: spent, remaining: income - spent,
      byCategory: spentMap, bills: bills };
  }

  function categoryRows(cfg, state, now) {
    var map = spentByCategory(state, now);
    return Object.keys(map).map(function (id) {
      return { id: id, name: C.nameOf(C.CATEGORIES, id), amount: map[id] };
    }).filter(function (r) { return r.amount > 0; }).sort(function (a, b) { return b.amount - a.amount; });
  }

  /* top 3 variable-spending categories this month, with change vs. usual */
  function leaks(cfg, state, now) {
    var map = spentByCategory(state, now);
    var usual = {}; cfg.variable.forEach(function (v) { usual[v.id] = v.monthly; });
    var day = now.getDate(), dim = U.daysInMonth(now.getFullYear(), now.getMonth());
    return Object.keys(map).filter(function (id) {
      var c = C.find(C.CATEGORIES, id);
      return c && c.kind === 'var';
    }).map(function (id) {
      var u = usual[id];
      var pace = map[id] / Math.max(day, 1) * dim; // where this category is heading this month
      return { id: id, name: C.nameOf(C.CATEGORIES, id), amount: map[id], usual: u === undefined ? null : u,
        pace: pace, over: u === undefined ? null : pace - u };
    }).sort(function (a, b) { return b.amount - a.amount; }).slice(0, 3);
  }

  /* ---------- logged-average spending (replaces the guess once there's data) ---------- */
  function variableMonthly(cfg, state, now) {
    var dates = state.transactions.filter(function (t) { return t.type === 'expense'; }).map(function (t) { return t.date; }).sort();
    var first = dates.length ? U.parseISO(dates[0]) : null;
    var span = first ? U.diffDays(first, now) + 1 : 0;
    var usingLogged = span >= 28;
    var out = cfg.variable.map(function (v) {
      var monthly = v.monthly;
      if (usingLogged) {
        var from = U.addDays(now, -Math.min(span, 90) + 1), fromIso = U.iso(from), nowIso = U.iso(now), total = 0;
        state.transactions.forEach(function (t) {
          if (t.type === 'expense' && t.category === v.id && t.date >= fromIso && t.date <= nowIso) total += t.amount;
        });
        monthly = total / (Math.min(span, 90) / 30.4);
      }
      return { id: v.id, name: v.name, monthly: monthly, guess: v.monthly };
    });
    return { rows: out, usingLogged: usingLogged };
  }

  /* ---------- goals ---------- */
  function goalStatus(g, state, now) {
    var contributed = 0, recent = 0;
    var since = U.iso(U.addDays(now, -90));
    state.transactions.forEach(function (t) {
      if (t.goalId === g.id && t.type === 'expense') { contributed += t.amount; if (t.date >= since) recent += t.amount; }
    });
    var saved = g.saved0 + contributed;
    var end = U.parseISO(g.date) || now;
    var monthsLeft = Math.max((U.diffDays(now, end)) / 30.4, 0);
    var remaining = Math.max(g.target - saved, 0);
    var needed = remaining <= 0 ? 0 : remaining / Math.max(monthsLeft, 1);
    var start = U.parseISO(g.created) || now;
    var windowDays = Math.max(Math.min(90, U.diffDays(start, now) + 1), 30);
    var pace = recent / (windowDays / 30.4);
    var status = remaining <= 0 ? 'done' : (pace + 0.005 >= needed ? 'on' : 'behind');
    return { goal: g, saved: saved, remaining: remaining, pct: Math.min(saved / g.target, 1), needed: needed, pace: pace,
      behindBy: status === 'behind' ? needed - pace : 0, status: status, pastDue: end < now && remaining > 0, monthsLeft: monthsLeft };
  }

  /* ---------- forecast ---------- */
  /* opts: {days, whatIf:{cut:{catId:amt}, extraSavings}, income:'low'|'high', includeGoals} */
  function forecast(cfg, state, now, opts) {
    opts = opts || {};
    var days = opts.days || 365;
    var whatIf = opts.whatIf || { cut: {}, extraSavings: 0 };
    var useHigh = opts.income === 'high';
    var includeGoals = opts.includeGoals !== false;
    var end = U.addDays(now, days);
    var vm = variableMonthly(cfg, state, now);
    var cutMap = whatIf.cut || {};
    var varRows = vm.rows.map(function (r) { return { id: r.id, monthly: Math.max(r.monthly - U.num(cutMap[r.id], 0), 0) }; });
    var varTotal = varRows.reduce(function (s, r) { return s + r.monthly; }, 0);

    var goalMonthly = includeGoals ? cfg.goals.reduce(function (s, g) {
      var st = goalStatus(g, state, now);
      return s + (st.status === 'done' ? 0 : st.needed);
    }, 0) : 0;
    var debtMin = cfg.debts.reduce(function (s, d) { return s + d.min; }, 0);
    var extraSave = Math.max(U.num(whatIf.extraSavings, 0), 0);

    var paySet = {};
    paydays(cfg, now, end).forEach(function (d) { paySet[U.iso(d)] = true; });
    var incomeToday = state.transactions.some(function (t) { return t.type === 'income' && t.date === U.iso(now); });
    var payAmt = cfg.irregular ? (useHigh ? cfg.payHigh : cfg.payLow) : cfg.payAmount;

    var bal = currentBalance(state), pts = [], events = [], setAside = 0;
    var billPaidNow = {}; cfg.bills.forEach(function (b) { billPaidNow[b.id] = billPaid(cfg, state, b, now); });

    for (var i = 0; i <= days; i++) {
      var d = U.addDays(now, i), key = U.iso(d), dom = d.getDate(), y = d.getFullYear(), m = d.getMonth();
      var dim = U.daysInMonth(y, m), delta = 0;
      if (paySet[key] && !(i === 0 && incomeToday)) { delta += payAmt; events.push({ date: d, label: 'Payday', amount: payAmt }); }
      if (dom === 1) {
        if (cfg.extraMonthly) { delta += cfg.extraMonthly; }
        if (debtMin) { delta -= debtMin; events.push({ date: d, label: 'Debt payments', amount: -debtMin }); }
        if (goalMonthly) { delta -= goalMonthly; setAside += goalMonthly; events.push({ date: d, label: 'Goal savings', amount: -goalMonthly }); }
        if (extraSave) { delta -= extraSave; setAside += extraSave; events.push({ date: d, label: 'Extra savings', amount: -extraSave }); }
      }
      cfg.bills.forEach(function (b) {
        if (U.clampDay(y, m, b.due) !== dom) return;
        if (i === 0 && billPaidNow[b.id]) return;
        delta -= b.amount; events.push({ date: d, label: b.name, amount: -b.amount });
      });
      cfg.annual.forEach(function (a) {
        if (a.month === m + 1 && dom === 1) { delta -= a.amount; events.push({ date: d, label: a.name, amount: -a.amount }); }
      });
      delta -= varTotal / dim;
      bal += delta;
      pts.push({ date: d, balance: U.round2(bal) });
    }
    var min = cfg.minBalance;
    var firstBelow = null, firstNegative = null, lowest = pts[0];
    pts.forEach(function (p) {
      if (!firstBelow && p.balance < min) firstBelow = p;
      if (!firstNegative && p.balance < 0) firstNegative = p;
      if (p.balance < lowest.balance) lowest = p;
    });
    return { points: pts, events: events, firstBelow: firstBelow, firstNegative: firstNegative, lowest: lowest,
      varTotal: varTotal, usingLogged: vm.usingLogged, goalMonthly: goalMonthly, debtMin: debtMin, extraSave: extraSave,
      setAside: setAside, payAmt: payAmt, end: pts[pts.length - 1] };
  }

  /* ---------- safe to spend until next payday ---------- */
  function safeToSpend(cfg, state, now) {
    var next = paydays(cfg, U.addDays(now, 1), U.addDays(now, 70))[0];
    if (!next) next = U.addDays(now, 14);
    var balance = currentBalance(state);
    var committed = 0, items = [];
    var y, m;
    for (var d = new Date(now); d < next; d = U.addDays(d, 1)) {
      y = d.getFullYear(); m = d.getMonth();
      cfg.bills.forEach(function (b) {
        if (U.clampDay(y, m, b.due) !== d.getDate()) return;
        if (U.iso(d) === U.iso(now) && billPaid(cfg, state, b, now)) return;
        committed += b.amount; items.push({ date: new Date(d), label: b.name, amount: b.amount });
      });
      if (d.getDate() === 1) {
        var dm = cfg.debts.reduce(function (s, x) { return s + x.min; }, 0);
        if (dm) { committed += dm; items.push({ date: new Date(d), label: 'Debt payments', amount: dm }); }
        cfg.annual.forEach(function (a) { if (a.month === m + 1) { committed += a.amount; items.push({ date: new Date(d), label: a.name, amount: a.amount }); } });
      }
    }
    var days = Math.max(U.diffDays(now, next), 1);
    var safe = balance - committed;
    return { safe: safe, balance: balance, committed: committed, items: items, next: next, days: days, perDay: safe / days };
  }

  /* payday-to-payday list: every money event until next payday with running balance */
  function cashCalendar(cfg, state, now) {
    var s = safeToSpend(cfg, state, now);
    var rows = [], bal = s.balance;
    var paid = paydays(cfg, now, s.next)[0];
    rows.push({ date: now, label: 'Today', amount: 0, balance: bal, kind: 'start' });
    s.items.sort(function (a, b) { return a.date - b.date; }).forEach(function (it) {
      bal -= it.amount; rows.push({ date: it.date, label: it.label, amount: -it.amount, balance: bal, kind: 'out' });
    });
    var pay = cfg.irregular ? cfg.payLow : cfg.payAmount;
    rows.push({ date: s.next, label: 'Next payday', amount: pay, balance: bal + pay, kind: 'pay', paid: paid });
    return { rows: rows, summary: s };
  }

  /* ---------- debt payoff: avalanche vs snowball ---------- */
  function payoff(debts, extra, method) {
    var list = debts.map(function (d) { return { id: d.id, name: d.name, bal: d.balance, apr: d.apr, min: d.min, paidOffAt: null }; });
    var months = 0, interest = 0, MAX = 600, stuck = false;
    var budget = list.reduce(function (s, d) { return s + d.min; }, 0) + Math.max(extra, 0);
    while (list.some(function (d) { return d.bal > 0.005; }) && months < MAX) {
      months++;
      list.forEach(function (d) { if (d.bal > 0) { var i = d.bal * d.apr / 100 / 12; d.bal += i; interest += i; } });
      var pool = budget;
      list.forEach(function (d) { if (d.bal > 0) { var p = Math.min(d.min, d.bal); d.bal -= p; pool -= p; } });
      var order = list.filter(function (d) { return d.bal > 0.005; }).sort(function (a, b) {
        return method === 'snowball' ? a.bal - b.bal : b.apr - a.apr || a.bal - b.bal;
      });
      order.forEach(function (d) { if (pool > 0) { var p = Math.min(pool, d.bal); d.bal -= p; pool -= p; } });
      list.forEach(function (d) { if (d.bal <= 0.005 && d.paidOffAt === null) { d.bal = 0; d.paidOffAt = months; } });
    }
    if (list.some(function (d) { return d.bal > 0.005; })) stuck = true;
    return { months: months, interest: U.round2(interest), stuck: stuck, debts: list.map(function (d) { return { id: d.id, name: d.name, paidOffAt: d.paidOffAt }; }) };
  }
  function debtPlan(cfg, extra) {
    return { avalanche: payoff(cfg.debts, extra, 'avalanche'), snowball: payoff(cfg.debts, extra, 'snowball') };
  }

  /* ---------- subscriptions ---------- */
  function subscriptions(cfg, state) {
    var bill = cfg.bills.filter(function (b) { return b.id === 'subs'; })[0];
    var items = state.subs.map(function (s) { return { id: s.id, name: s.name, amount: s.amount, cycle: s.cycle, monthly: s.cycle === 'yearly' ? s.amount / 12 : s.amount }; });
    var listed = items.reduce(function (s, i) { return s + i.monthly; }, 0);
    var monthly = bill ? bill.amount : listed;
    return { items: items, listed: listed, monthly: monthly, yearly: monthly * 12, unlisted: Math.max(monthly - listed, 0) };
  }

  /* ---------- alerts ---------- */
  function alerts(cfg, state, now, fc) {
    var out = [];
    var ms = monthSummary(cfg, state, now);
    ms.bills.forEach(function (b) {
      var days = U.diffDays(now, b.due);
      if (!b.paid && days >= 0 && days <= 3) {
        out.push({ level: 'warn', text: b.bill.name + ' (' + U.money(b.bill.amount) + ') is due ' + (days === 0 ? 'today' : days === 1 ? 'tomorrow' : 'in ' + days + ' days') + '.' });
      } else if (b.overdue) {
        out.push({ level: 'warn', text: b.bill.name + ' was due ' + U.fmtDate(b.due) + ' and isn’t marked paid.' });
      }
    });
    if (cfg.style !== 'track') {
      var spent = ms.byCategory;
      cfg.variable.forEach(function (v) {
        var s = spent[v.id] || 0;
        if (cfg.limits[v.id] && s > cfg.limits[v.id]) out.push({ level: 'bad', text: v.name + ' is over budget by ' + U.money(s - cfg.limits[v.id]) + ' this month.' });
      });
    }
    fc = fc || forecast(cfg, state, now, { days: 365 });
    if (fc.firstNegative) {
      out.push({ level: 'bad', text: 'Your balance is projected to go below $0 on ' + U.fmtDate(fc.firstNegative.date) + '.' });
    } else if (cfg.minBalance > 0 && fc.firstBelow) {
      out.push({ level: 'warn', text: 'Your balance is projected to drop below your ' + U.money(cfg.minBalance) + ' cushion on ' + U.fmtDate(fc.firstBelow.date) + '.' });
    }
    return out;
  }

  FD.engine = { paydays: paydays, currentBalance: currentBalance, monthSummary: monthSummary, categoryRows: categoryRows,
    leaks: leaks, variableMonthly: variableMonthly, goalStatus: goalStatus, forecast: forecast, safeToSpend: safeToSpend,
    cashCalendar: cashCalendar, debtPlan: debtPlan, payoff: payoff, subscriptions: subscriptions, alerts: alerts,
    spentByCategory: spentByCategory, billPaid: billPaid };
  if (typeof module !== 'undefined' && module.exports) module.exports = FD;
})(typeof window !== 'undefined' ? window : globalThis);
