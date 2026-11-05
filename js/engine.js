/* engine.js — all the money math. Pure functions over (config, state, now). No DOM. */
(function (root) {
  'use strict';
  var FD = (root.FD = root.FD || {});
  var U = FD.util, C = FD.catalog;
  var VAR_IDS = C.CATEGORIES.filter(function (c) { return c.kind === 'var'; }).map(function (c) { return c.id; });

  /* ---------- paydays ---------- */
  function twiceDays(d1) { // 1st&15th, 15th&last, otherwise d and d±15
    if (d1 === 1) return [1, 15];
    if (d1 === 15 || d1 >= 28) return [15, 31];
    return d1 <= 15 ? [d1, d1 + 15] : [d1 - 15, d1];
  }
  function paydays(cfg, from, to) {
    var out = [], anchor = U.parseISO(cfg.anchor) || from, d, k;
    if (cfg.freq === 'weekly' || cfg.freq === 'biweekly') {
      var step = cfg.freq === 'weekly' ? 7 : 14;
      var diff = U.diffDays(anchor, from);
      k = diff > 0 ? Math.ceil(diff / step) : -Math.floor(-diff / step);
      for (d = U.addDays(anchor, k * step); d <= to; d = U.addDays(d, step)) if (d >= from) out.push(d);
    } else {
      var days = cfg.freq === 'twice' ? twiceDays(anchor.getDate()) : [anchor.getDate()];
      var y = from.getFullYear(), m = from.getMonth();
      while (new Date(y, m, 1) <= to) {
        days.forEach(function (dd) {
          var dt = new Date(y, m, U.clampDay(y, m, dd));
          if (dt >= from && dt <= to) out.push(dt);
        });
        m += 1; if (m > 11) { m = 0; y += 1; }
      }
    }
    return out;
  }
  function payAmount(cfg, high) { return cfg.irregular ? (high ? cfg.payHigh : cfg.payLow) : cfg.payAmount; }

  /* ---------- transactions ---------- */
  /* Only transactions dated today or earlier count toward the current balance. */
  function netToDate(state, now) {
    var nowIso = U.iso(now || U.today()), s = 0;
    state.transactions.forEach(function (t) { if (t.date <= nowIso) s += t.type === 'income' ? t.amount : -t.amount; });
    return s;
  }
  function currentBalance(state, now) {
    return U.round2(U.num(state.settings.openingBalance, 0, -1e8, 1e8) + netToDate(state, now));
  }
  function monthTxns(state, now, type) {
    var key = U.monthKey(now);
    return state.transactions.filter(function (t) { return t.date.slice(0, 7) === key && (!type || t.type === type); });
  }
  function spentByCategory(state, now) {
    var map = Object.create(null);
    monthTxns(state, now, 'expense').forEach(function (t) { map[t.category] = (map[t.category] || 0) + t.amount; });
    return map;
  }
  function loggedOn(state, date, type, cat) {
    var iso = U.iso(date);
    return state.transactions.some(function (t) { return t.date === iso && t.type === type && t.category === cat; });
  }
  /* A bill counts as paid for the month of `date` if: it was marked paid, a payment dated today or earlier was logged,
     or it fell due before the day you told us your balance (that balance already reflects it). */
  function billPaid(state, bill, date, now) {
    now = now || U.today();
    var key = U.monthKey(date), nowIso = U.iso(now);
    if (state.billsPaid[bill.id + ':' + key]) return true;
    if (state.transactions.some(function (t) {
      return t.type === 'expense' && t.date <= nowIso && t.date.slice(0, 7) === key && (t.billId === bill.id || t.category === bill.id);
    })) return true;
    var bd = state.settings.balanceSet ? U.parseISO(state.settings.balanceDate) : null;
    if (bd && U.monthKey(bd) === key) {
      var due = new Date(date.getFullYear(), date.getMonth(), U.clampDay(date.getFullYear(), date.getMonth(), bill.due));
      if (due < bd) return true;
    }
    return false;
  }
  /* Bills due earlier this month that are still unpaid: treated as due now. */
  function overdueBills(cfg, state, now) {
    return cfg.bills.filter(function (b) {
      var due = new Date(now.getFullYear(), now.getMonth(), U.clampDay(now.getFullYear(), now.getMonth(), b.due));
      return due < now && !billPaid(state, b, now, now);
    });
  }

  /* ---------- this month ---------- */
  function monthSummary(cfg, state, now) {
    var received = monthTxns(state, now, 'income').reduce(function (s, t) { return s + t.amount; }, 0);
    var spentMap = spentByCategory(state, now);
    var spent = 0; Object.keys(spentMap).forEach(function (k) { spent += spentMap[k]; });
    var expected = cfg.baseMonthly + cfg.extraMonthly;
    var income = Math.max(received, expected);
    var bills = cfg.bills.map(function (b) {
      var due = new Date(now.getFullYear(), now.getMonth(), U.clampDay(now.getFullYear(), now.getMonth(), b.due));
      var paid = billPaid(state, b, now, now);
      return { bill: b, due: due, paid: paid, overdue: !paid && due < now };
    });
    return { received: received, expected: expected, income: income, spent: spent, remaining: income - spent, byCategory: spentMap, bills: bills };
  }

  function categoryRows(cfg, state, now) {
    var map = spentByCategory(state, now);
    return Object.keys(map).map(function (id) {
      return { id: id, name: C.nameOf(C.CATEGORIES, id), amount: map[id] };
    }).filter(function (r) { return r.amount > 0; }).sort(function (a, b) { return b.amount - a.amount; });
  }

  /* top 3 variable-spending categories this month; the pace note is suppressed early in the month */
  function leaks(cfg, state, now) {
    var map = spentByCategory(state, now);
    var usual = Object.create(null); cfg.variable.forEach(function (v) { usual[v.id] = v.monthly; });
    var day = now.getDate(), dim = U.daysInMonth(now.getFullYear(), now.getMonth()), early = day < 5;
    return Object.keys(map).filter(function (id) { return VAR_IDS.indexOf(id) >= 0; }).map(function (id) {
      var u = usual[id];
      var pace = map[id] / Math.max(day, 1) * dim;
      return { id: id, name: C.nameOf(C.CATEGORIES, id), amount: map[id], usual: u === undefined ? null : u,
        pace: pace, early: early, over: early || u === undefined ? null : pace - u };
    }).sort(function (a, b) { return b.amount - a.amount; }).slice(0, 3);
  }

  /* ---------- everyday spending: your estimate, replaced by the logged average once there is enough history ---------- */
  function variableMonthly(cfg, state, now) {
    var nowIso = U.iso(now), first = null;
    state.transactions.forEach(function (t) {
      if (t.type === 'expense' && VAR_IDS.indexOf(t.category) >= 0 && t.date <= nowIso && (first === null || t.date < first)) first = t.date;
    });
    var span = first ? U.diffDays(U.parseISO(first), now) + 1 : 0;
    var win = Math.min(span, 90), totals = Object.create(null), count = 0, daySet = Object.create(null);
    if (span >= 28) {
      var fromIso = U.iso(U.addDays(now, -win + 1));
      state.transactions.forEach(function (t) {
        if (t.type === 'expense' && VAR_IDS.indexOf(t.category) >= 0 && t.date >= fromIso && t.date <= nowIso) {
          totals[t.category] = (totals[t.category] || 0) + t.amount; count++; daySet[t.date] = true;
        }
      });
    }
    // 4+ weeks of history AND real coverage (10+ purchases on 5+ different days) before the logged average replaces your estimate
    var usingLogged = span >= 28 && count >= 10 && Object.keys(daySet).length >= 5;
    if (!usingLogged) totals = Object.create(null);
    var months = win / 30.4, listed = Object.create(null);
    var rows = cfg.variable.map(function (v) {
      listed[v.id] = true;
      var loggable = VAR_IDS.indexOf(v.id) >= 0; // custom "Other" rows can't be logged against, so they keep your estimate
      return { id: v.id, name: v.name, monthly: usingLogged && loggable ? (totals[v.id] || 0) / months : v.monthly, guess: v.monthly };
    });
    if (usingLogged) {
      var other = 0; Object.keys(totals).forEach(function (id) { if (!listed[id]) other += totals[id]; });
      other /= months;
      if (other > 0.5) rows.push({ id: 'unbudgeted', name: 'Other spending', monthly: other, guess: 0 });
    }
    return { rows: rows, usingLogged: usingLogged };
  }

  /* ---------- goals ---------- */
  function goalStatus(g, state, now) {
    var contributed = 0, recent = 0, since = U.iso(U.addDays(now, -90));
    state.transactions.forEach(function (t) {
      if (t.goalId === g.id && t.type === 'expense') { contributed += t.amount; if (t.date >= since) recent += t.amount; }
    });
    var saved = g.saved0 + contributed;
    var end = U.parseISO(g.date) || now;
    var monthsLeft = Math.max(U.diffDays(now, end) / 30.4, 0);
    var remaining = Math.max(g.target - saved, 0);
    var needed = remaining <= 0 ? 0 : remaining / Math.max(monthsLeft, 1);
    var start = U.parseISO(g.created) || now;
    var age = U.diffDays(start, now);
    var windowDays = Math.max(Math.min(90, age + 1), 30);
    var pace = recent / (windowDays / 30.4);
    var status = remaining <= 0 ? 'done' : pace + 0.005 >= needed ? 'on' : (age < 30 ? 'new' : 'behind');
    return { goal: g, saved: saved, remaining: remaining, pct: Math.min(saved / g.target, 1), needed: needed, pace: pace,
      behindBy: status === 'behind' ? needed - pace : 0, status: status, pastDue: end < now && remaining > 0, monthsLeft: monthsLeft };
  }

  /* ---------- forecast ---------- */
  /* opts: {days, whatIf:{cut:{catId:amt}, extraSavings}, income:'low'|'high', includeGoals} */
  function forecast(cfg, state, now, opts) {
    opts = opts || {};
    var days = opts.days || 365;
    var whatIf = opts.whatIf || { cut: Object.create(null), extraSavings: 0 };
    var includeGoals = opts.includeGoals !== false;
    var end = U.addDays(now, days);
    var vm = variableMonthly(cfg, state, now);
    var cutMap = whatIf.cut || Object.create(null);
    var varTotal = vm.rows.reduce(function (s, r) { return s + Math.max(r.monthly - U.num(cutMap[r.id], 0), 0); }, 0);

    // each goal and debt is simulated month by month and stops when it is finished
    var goalPlans = includeGoals ? cfg.goals.map(function (g) {
      var st = goalStatus(g, state, now); return { left: st.remaining, per: st.needed };
    }).filter(function (p) { return p.left > 0; }) : [];
    var goalMonthly = goalPlans.reduce(function (s, p) { return s + p.per; }, 0);
    var debtPlans = cfg.debts.map(function (d) { return { bal: d.balance, apr: d.apr, min: d.min }; });
    var debtMin = cfg.debts.reduce(function (s, d) { return s + d.min; }, 0);
    var extraSave = Math.max(U.num(whatIf.extraSavings, 0), 0);

    var paySet = Object.create(null);
    paydays(cfg, now, end).forEach(function (d) { paySet[U.iso(d)] = true; });
    var payAmt = payAmount(cfg, opts.income === 'high');
    var bal = currentBalance(state, now), pts = [], events = [], setAside = 0;

    for (var i = 0; i <= days; i++) {
      var d = U.addDays(now, i), key = U.iso(d), dom = d.getDate(), y = d.getFullYear(), m = d.getMonth();
      var dim = U.daysInMonth(y, m), delta = 0, today = i === 0;
      if (paySet[key] && !(today && loggedOn(state, d, 'income', 'pay'))) { delta += payAmt; events.push({ date: d, label: 'Payday', amount: payAmt }); }
      if (dom === 1) {
        if (cfg.extraMonthly && !(today && loggedOn(state, d, 'income', 'extra'))) { delta += cfg.extraMonthly; events.push({ date: d, label: 'Other income', amount: cfg.extraMonthly }); }
        if (!(today && loggedOn(state, d, 'expense', 'debt'))) {
          var dp = 0;
          debtPlans.forEach(function (x) {
            if (x.bal <= 0.005) return;
            var interest = x.bal * x.apr / 1200, pay = Math.min(x.min, x.bal + interest);
            x.bal = x.bal + interest - pay; dp += pay;
          });
          if (dp) { delta -= dp; events.push({ date: d, label: 'Debt payments', amount: -dp }); }
        }
        if (!(today && loggedOn(state, d, 'expense', 'savings'))) {
          var gp = 0;
          goalPlans.forEach(function (p) { var pay = Math.min(p.per, p.left); p.left -= pay; gp += pay; });
          if (extraSave) gp += extraSave;
          if (gp) { delta -= gp; setAside += gp; events.push({ date: d, label: 'Savings', amount: -gp }); }
        }
      }
      cfg.bills.forEach(function (b) {
        if (U.clampDay(y, m, b.due) !== dom) return;
        if (U.monthKey(d) === U.monthKey(now) && billPaid(state, b, d, now)) return;
        delta -= b.amount; events.push({ date: d, label: b.name, amount: -b.amount });
      });
      if (today) overdueBills(cfg, state, now).forEach(function (b) { delta -= b.amount; events.push({ date: d, label: b.name + ' (overdue)', amount: -b.amount }); });
      cfg.annual.forEach(function (a) {
        if (a.month === m + 1 && dom === 1) { delta -= a.amount; events.push({ date: d, label: a.name, amount: -a.amount }); }
      });
      if (!today) delta -= varTotal / dim; // today's spending is already in your balance
      bal += delta;
      pts.push({ date: d, balance: U.round2(bal) });
    }
    var min = cfg.minBalance, firstBelow = null, firstNegative = null, lowest = pts[0];
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
    var next = paydays(cfg, U.addDays(now, 1), U.addDays(now, 70))[0] || U.addDays(now, 14);
    var pay = payAmount(cfg, false);
    // a payday today that hasn't been logged yet is assumed to have landed (the forecast does the same)
    var payToday = paydays(cfg, now, now).length > 0 && !loggedOn(state, now, 'income', 'pay');
    var base = currentBalance(state, now), balance = base + (payToday ? pay : 0);
    var committed = 0, items = [];
    for (var d = new Date(now); d < next; d = U.addDays(d, 1)) {
      var y = d.getFullYear(), m = d.getMonth(), today = U.iso(d) === U.iso(now);
      cfg.bills.forEach(function (b) {
        if (U.clampDay(y, m, b.due) !== d.getDate()) return;
        if (U.monthKey(d) === U.monthKey(now) && billPaid(state, b, d, now)) return;
        committed += b.amount; items.push({ date: new Date(d), label: b.name, amount: b.amount });
      });
      if (d.getDate() === 1) {
        var dm = cfg.debts.reduce(function (s, x) { return s + Math.min(x.min, x.balance); }, 0);
        if (dm && !(today && loggedOn(state, d, 'expense', 'debt'))) { committed += dm; items.push({ date: new Date(d), label: 'Debt payments', amount: dm }); }
        cfg.annual.forEach(function (a) {
          if (a.month === m + 1) { committed += a.amount; items.push({ date: new Date(d), label: a.name, amount: a.amount }); }
        });
      }
    }
    overdueBills(cfg, state, now).forEach(function (b) { committed += b.amount; items.push({ date: new Date(now), label: b.name + ' (overdue)', amount: b.amount }); });
    var days = Math.max(U.diffDays(now, next), 1), safe = balance - committed;
    return { safe: safe, balance: balance, base: base, payToday: payToday, pay: pay, committed: committed, items: items, next: next, days: days, perDay: safe / days };
  }

  /* payday-to-payday list: every money event until next payday with running balance */
  function cashCalendar(cfg, state, now) {
    var s = safeToSpend(cfg, state, now);
    var rows = [], bal = s.base;
    rows.push({ date: now, label: 'Today', amount: 0, balance: bal, kind: 'start' });
    if (s.payToday) { bal += s.pay; rows.push({ date: now, label: 'Payday (today)', amount: s.pay, balance: bal, kind: 'pay' }); }
    s.items.sort(function (a, b) { return a.date - b.date; }).forEach(function (it) {
      bal -= it.amount; rows.push({ date: it.date, label: it.label, amount: -it.amount, balance: bal, kind: 'out' });
    });
    rows.push({ date: s.next, label: 'Next payday', amount: s.pay, balance: bal + s.pay, kind: 'pay' });
    return { rows: rows, summary: s };
  }

  /* ---------- debt payoff: avalanche vs snowball ---------- */
  function payoff(debts, extra, method) {
    var list = debts.map(function (d) { return { id: d.id, name: d.name, bal: d.balance, apr: d.apr, min: d.min, paidOffAt: null }; });
    var months = 0, interest = 0, MAX = 600;
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
    var stuck = list.some(function (d) { return d.bal > 0.005; });
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
    var monthly = bill ? Math.max(bill.amount, listed) : listed;
    return { items: items, listed: listed, monthly: monthly, yearly: monthly * 12, unlisted: Math.max(monthly - listed, 0) };
  }

  /* ---------- alerts ---------- */
  function alerts(cfg, state, now, fc) {
    var out = [], ms = monthSummary(cfg, state, now);
    ms.bills.forEach(function (b) {
      var days = U.diffDays(now, b.due);
      if (!b.paid && days >= 0 && days <= 3) {
        out.push({ level: 'warn', text: b.bill.name + ' (' + U.money(b.bill.amount) + ') is due ' + (days === 0 ? 'today' : days === 1 ? 'tomorrow' : 'in ' + days + ' days') + '.' });
      } else if (b.overdue) {
        out.push({ level: 'warn', text: b.bill.name + ' was due ' + U.fmtDate(b.due) + ' and isn’t marked paid.' });
      }
    });
    if (cfg.style !== 'track') {
      cfg.variable.forEach(function (v) {
        var s = ms.byCategory[v.id] || 0;
        if (cfg.limits[v.id] && s > cfg.limits[v.id]) out.push({ level: 'bad', text: v.name + ' is over budget by ' + U.money(s - cfg.limits[v.id]) + ' this month.' });
      });
    }
    fc = fc || forecast(cfg, state, now, { days: 365, includeGoals: state.settings.includeGoals !== false });
    if (fc.firstNegative) {
      out.push({ level: 'bad', text: 'Your balance is projected to go below $0 on ' + U.fmtDate(fc.firstNegative.date) + '.' });
    } else if (cfg.minBalance > 0 && fc.firstBelow) {
      out.push({ level: 'warn', text: 'Your balance is projected to drop below your ' + U.money(cfg.minBalance) + ' cushion on ' + U.fmtDate(fc.firstBelow.date) + '.' });
    }
    return out;
  }

  FD.engine = { paydays: paydays, currentBalance: currentBalance, netToDate: netToDate, monthSummary: monthSummary, categoryRows: categoryRows,
    leaks: leaks, variableMonthly: variableMonthly, goalStatus: goalStatus, forecast: forecast, safeToSpend: safeToSpend,
    cashCalendar: cashCalendar, overdueBills: overdueBills, debtPlan: debtPlan, payoff: payoff, subscriptions: subscriptions, alerts: alerts,
    spentByCategory: spentByCategory, billPaid: billPaid };
  if (typeof module !== 'undefined' && module.exports) module.exports = FD;
})(typeof window !== 'undefined' ? window : globalThis);
