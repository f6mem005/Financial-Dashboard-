/* views.js — Home, Forecast, Plan, Activity and Settings screens. */
(function (root) {
  'use strict';
  var FD = (root.FD = root.FD || {});
  var U = FD.util, h = U.h, C = FD.catalog, E = FD.engine, UI = FD.ui, CH = FD.charts;
  var money = U.money;

  function empty(text) { return h('p', { class: 'empty' }, text); }

  /* ================= HOME WIDGETS ================= */
  function balanceForm(app, title) {
    var val = null;
    return h('div', { class: 'balance-form' },
      UI.field(title || 'What’s in your checking account today?', UI.moneyInput(null, function (v) { val = v; }, { label: 'Current balance', min: -1e8 }), 'Overdrawn? Enter it as a negative number, like -50.'),
      UI.btn('Save', function () { if (val === null) return; app.setBalance(val); }, 'primary'));
  }

  function safeWidget(app) {
    var cfg = app.cfg(), S = app.S, now = app.now();
    if (!S.settings.balanceSet) {
      return UI.card('Safe to spend until payday', [h('p', { class: 'q-help' }, 'Enter your balance and we’ll tell you how much you can spend before your next paycheck.'), balanceForm(app)], { cls: 'hero' });
    }
    var r = E.safeToSpend(cfg, S, now);
    var short = r.safe < 0;
    return UI.card(null, [
      h('div', { class: 'hero-label' }, 'Safe to spend until payday'),
      h('div', { class: 'hero-num' + (short ? ' bad' : '') }, money(r.safe)),
      h('p', { class: 'hero-sub' }, short
        ? 'You’re short by ' + money(-r.safe) + ' before payday on ' + U.fmtDate(r.next) + '.'
        : '≈ ' + money(r.perDay) + ' a day for ' + r.days + ' day' + (r.days === 1 ? '' : 's') + ' (payday: ' + U.fmtDate(r.next) + ')'),
      h('p', { class: 'hint' }, 'Your balance ' + money(r.balance) + (r.payToday ? ' (including today\u2019s paycheck)' : '') + ' minus ' + money(r.committed) + ' in bills due before payday.')
    ], { cls: 'hero' });
  }

  function calendarWidget(app) {
    if (!app.S.settings.balanceSet) return null;
    var cal = E.cashCalendar(app.cfg(), app.S, app.now());
    var rows = cal.rows.map(function (r) {
      return h('li', { class: 'cal-row ' + r.kind },
        h('span', { class: 'cal-date' }, r.kind === 'start' ? 'Today' : U.fmtDate(r.date)),
        h('span', { class: 'cal-label' }, r.kind === 'start' ? 'You have' : r.label),
        h('span', { class: 'cal-amt ' + (r.amount > 0 ? 'good' : '') }, r.kind === 'start' ? '' : (r.amount > 0 ? '+' : '-') + money(Math.abs(r.amount))),
        h('span', { class: 'cal-bal' + (r.balance < 0 ? ' bad' : '') }, money(r.balance)));
    });
    return UI.card('Payday to payday', h('ul', { class: 'cal' }, rows));
  }

  function styleExtras(app, ms) {
    var cfg = app.cfg(), nodes = [];
    var byCat = ms.byCategory;
    if (cfg.style === 'fifty') {
      var needs = 0, wants = 0, save = 0;
      Object.keys(byCat).forEach(function (id) {
        var c = C.find(C.CATEGORIES, id), k = c ? c.kind : 'var';
        if (k === 'bill' || id === 'groceries' || id === 'transport') needs += byCat[id];
        else if (k === 'debt' || k === 'savings') save += byCat[id];
        else wants += byCat[id];
      });
      var inc = Math.max(ms.income, 1);
      [['Needs', needs, 0.5], ['Wants', wants, 0.3], ['Savings & debt', save, 0.2]].forEach(function (r) {
        var pct = r[1] / inc;
        nodes.push(h('div', { class: 'split' }, h('div', { class: 'split-top' }, h('span', null, r[0]), h('span', null, Math.round(pct * 100) + '% (aim ' + Math.round(r[2] * 100) + '%)')), CH.bar(pct / r[2] > 1 ? 1 : pct / r[2], pct > r[2] && r[0] !== 'Savings & debt' ? 'warn' : '', r[0])));
      });
      nodes.unshift(h('h3', null, '50-30-20 check'));
    } else if (cfg.style === 'zero') {
      var planned = cfg.bills.reduce(function (s, b) { return s + b.amount; }, 0) + cfg.variable.reduce(function (s, v) { return s + v.monthly; }, 0) +
        cfg.debts.reduce(function (s, d) { return s + d.min; }, 0) + cfg.annual.reduce(function (s, a) { return s + a.amount / 12; }, 0);
      var un = cfg.baseMonthly + cfg.extraMonthly - planned;
      nodes.push(h('h3', null, 'Every dollar a job'), h('p', null, un >= 0 ? money(un) + ' per month is still unassigned — give it a job (savings, debt, goals).' : 'You’ve assigned ' + money(-un) + ' more than you earn each month. Trim something.'));
    } else if (cfg.style === 'envelopes') {
      nodes.push(h('h3', null, 'Spending envelopes'));
      cfg.variable.forEach(function (v) {
        var s = byCat[v.id] || 0, lim = cfg.limits[v.id] || v.monthly, left = lim - s;
        nodes.push(h('div', { class: 'split' }, h('div', { class: 'split-top' }, h('span', null, v.name), h('span', { class: left < 0 ? 'bad' : '' }, left >= 0 ? money(left) + ' left' : money(-left) + ' over')),
          CH.bar(Math.min(s / lim, 1), s > lim ? 'bad' : s / lim > 0.8 ? 'warn' : '', v.name + ' envelope')));
      });
    }
    return nodes.length ? h('div', { class: 'extras' }, nodes) : null;
  }

  function monthWidget(app) {
    var cfg = app.cfg(), S = app.S, now = app.now();
    var ms = E.monthSummary(cfg, S, now);
    var rows = E.categoryRows(cfg, S, now);
    return UI.card('This month · ' + U.MONTHS[now.getMonth()], [
      h('div', { class: 'tiles' }, UI.tile('Income', money(ms.income)), UI.tile('Spent', money(ms.spent)), UI.tile('Left', money(ms.remaining), ms.remaining < 0 ? 'bad' : 'good')),
      ms.received < ms.expected ? h('p', { class: 'hint' }, 'Income counts what you expect this month (' + money(ms.expected) + '); ' + money(ms.received) + ' received so far.') : null,
      rows.length ? CH.donut(rows, ms.spent) : empty('Nothing logged this month yet. Add spending in the Activity tab.'),
      styleExtras(app, ms)
    ]);
  }

  function leaksWidget(app) {
    var list = E.leaks(app.cfg(), app.S, app.now());
    var body = list.length ? h('ol', { class: 'leaks' }, list.map(function (l) {
      var note = l.early ? 'Too early in the month to tell' : l.usual === null ? 'No usual amount set' : (l.over > 5 ? 'On pace for ' + money(l.pace) + ' — ' + money(l.over) + ' over your usual ' + money(l.usual) : 'On pace for ' + money(l.pace) + ' (usual ' + money(l.usual) + ')');
      return h('li', null, h('div', { class: 'leak-top' }, h('strong', null, l.name), h('span', null, money(l.amount) + ' so far')), h('div', { class: 'hint' }, note));
    })) : empty('Log a few purchases and we’ll show where your money slips away.');
    return UI.card('Top 3 spending leaks', body);
  }

  function billsWidget(app) {
    var cfg = app.cfg(), S = app.S, now = app.now();
    var ms = E.monthSummary(cfg, S, now);
    var paid = ms.bills.filter(function (b) { return b.paid; }), open = ms.bills.filter(function (b) { return !b.paid; }).sort(function (a, b) { return a.due - b.due; });
    var left = open.reduce(function (s, b) { return s + b.bill.amount; }, 0);
    function paidRow(b) {
      var key = b.bill.id + ':' + U.monthKey(now);
      var undoable = S.billsPaid[key] || S.transactions.some(function (t) { return t.billId === b.bill.id && t.date.slice(0, 7) === U.monthKey(now); });
      var undo = undoable ? UI.btn('Undo', function () {
        delete S.billsPaid[key];
        S.transactions = S.transactions.filter(function (t) { return !(t.billId === b.bill.id && t.date.slice(0, 7) === U.monthKey(now)); });
        app.commit();
      }, 'small', { 'aria-label': 'Undo paid for ' + b.bill.name }) : null;
      return h('li', null, h('span', { class: 'bill-name' }, '\u2713 ' + b.bill.name), h('span', { class: 'bill-amt' }, money(b.bill.amount)), undo);
    }
    var body = ms.bills.length ? [
      h('p', { class: 'summary-line' }, paid.length + ' of ' + ms.bills.length + ' paid · ' + money(left) + ' still to pay'),
      CH.bar(ms.bills.length ? paid.length / ms.bills.length : 0, '', 'Bills paid this month'),
      h('ul', { class: 'bill-list' }, open.slice(0, 6).map(function (b) {
        var days = U.diffDays(now, b.due);
        return h('li', { class: b.overdue ? 'overdue' : '' },
          h('span', { class: 'bill-name' }, b.bill.name), h('span', { class: 'bill-due' }, b.overdue ? 'was due ' + U.fmtDate(b.due) : days === 0 ? 'due today' : days <= 3 ? 'in ' + days + ' day' + (days === 1 ? '' : 's') : U.fmtDate(b.due)),
          h('span', { class: 'bill-amt' }, money(b.bill.amount)),
          UI.btn('Mark paid', function () {
            // paying a bill moves real money, so record it as an expense (keeps balance and safe-to-spend honest)
            var pt = FD.store.sanitizeTxn({ id: U.uid('t'), date: U.iso(now), type: 'expense', amount: b.bill.amount,
              category: C.find(C.CATEGORIES, b.bill.id) ? b.bill.id : 'billpay', billId: b.bill.id, note: b.bill.name + ' (marked paid)' });
            if (pt) S.transactions.push(pt);
            if (app.commit()) UI.toast(b.bill.name + ' marked paid \u2014 ' + money(b.bill.amount) + ' taken from your balance');
          }, 'small', { 'aria-label': 'Mark ' + b.bill.name + ' paid' }),
          b.overdue ? UI.btn('Already paid', function () {
            // already reflected in the balance you entered: just clear the reminder, don't take the money out again
            S.billsPaid[b.bill.id + ':' + U.monthKey(now)] = true; app.commit();
          }, 'small', { 'aria-label': b.bill.name + ' was already paid before I set my balance' }) : null);
      })),
      open.length > 6 ? h('p', { class: 'hint' }, '+ ' + (open.length - 6) + ' more later this month') : null,
      paid.length ? h('details', null, h('summary', null, 'Paid this month (' + paid.length + ')'), h('ul', { class: 'bill-list paid' }, paid.map(paidRow))) : null
    ] : empty('No fixed bills yet. Add some in Settings → Edit answers.');
    return UI.card('Bills this month', body);
  }

  function goalStatusEl(st) {
    if (st.status === 'done') return h('span', { class: 'pill good' }, '✓ Done');
    if (st.status === 'on') return h('span', { class: 'pill good' }, '✓ On track');
    if (st.pastDue) return h('span', { class: 'pill bad' }, 'Past due — ' + money(st.remaining) + ' to go');
    if (st.status === 'new') return h('span', { class: 'pill' }, 'Needs ' + money(st.needed) + '/mo');
    return h('span', { class: 'pill bad' }, 'Behind by ' + money(st.behindBy) + '/mo');
  }
  function goalsWidget(app, detailed) {
    var cfg = app.cfg(), S = app.S, now = app.now();
    var body = cfg.goals.length ? cfg.goals.map(function (g) {
      var st = E.goalStatus(g, S, now);
      var node = h('div', { class: 'goal' },
        h('div', { class: 'goal-top' }, h('strong', null, g.name), goalStatusEl(st)),
        CH.bar(st.pct, st.status === 'behind' ? 'warn' : st.status === 'new' ? '' : 'good', g.name + ' progress'),
        h('div', { class: 'goal-sub' }, money(st.saved) + ' of ' + money(g.target) + ' by ' + U.fmtDate(U.parseISO(g.date)) + (st.remaining > 0 ? ' · needs ' + money(st.needed) + '/mo' : '')));
      if (detailed && st.remaining > 0) {
        var amt = null;
        node.appendChild(h('div', { class: 'inline add-money' }, UI.moneyInput(null, function (v) { amt = v; }, { label: 'Add to ' + g.name }),
          UI.btn('Add', function () {
            if (!amt || amt <= 0) return;
            var gt = FD.store.sanitizeTxn({ id: U.uid('t'), date: U.iso(now), type: 'expense', amount: amt, category: 'savings', note: 'Goal: ' + g.name, goalId: g.id });
            if (!gt) { UI.toast('Enter an amount first.'); return; }
            S.transactions.push(gt);
            if (app.commit()) UI.toast('Added ' + money(amt) + ' to ' + g.name);
          }, 'small')));
      }
      return node;
    }) : empty('No goals yet. Add one in Settings → Edit answers.');
    var sugg = detailed ? cfg.suggestions.filter(function (s) { return s.type === 'goal'; }).map(function (s) {
      return h('div', { class: 'suggest' }, h('span', null, s.text), UI.btn('Start a $500 cushion', function () {
        S.answers.goals = (S.answers.goals || []).concat([{ id: 'g-emergency', type: 'emergency', target: 500, date: U.iso(U.addMonths(app.now(), 6)), created: U.iso(app.now()), saved0: 0 }]);
        app.commit();
      }, 'small'));
    }) : null;
    return UI.card('Goals', [body, sugg]);
  }

  function forecastMini(app) {
    var fc = E.forecast(app.cfg(), app.S, app.now(), { days: 90, includeGoals: app.S.settings.includeGoals });
    return UI.card('Where your balance is heading', [
      CH.lineChart({ points: fc.points, min: app.cfg().minBalance, label: 'Projected balance, next 3 months' }),
      h('p', { class: 'summary-line' }, forecastHeadline(app, fc)),
      UI.btn('See full forecast', function () { app.go('forecast'); }, 'link')
    ]);
  }

  function forecastHeadline(app, fc) {
    var min = app.cfg().minBalance;
    if (fc.firstNegative) return 'Heads up: projected to go below $0 on ' + U.fmtDate(fc.firstNegative.date) + ' (lowest ' + money(fc.lowest.balance) + ').';
    if (min > 0 && fc.firstBelow) return 'Projected to dip below your ' + money(min) + ' minimum on ' + U.fmtDate(fc.firstBelow.date) + '.';
    return 'Looks OK: lowest point ' + money(fc.lowest.balance) + ', ending at ' + money(fc.end.balance) + '.';
  }

  /* ================= HOME ================= */
  function home(app) {
    var cfg = app.cfg(), S = app.S, now = app.now();
    var out = h('main', { class: 'screen', id: 'main' }, h('h1', { class: 'sr-only', tabindex: '-1', id: 'q-title' }, 'Home'));
    var al = E.alerts(cfg, S, now);
    if (al.length) out.appendChild(h('ul', { class: 'alerts', 'aria-label': 'Alerts' }, al.slice(0, 4).map(function (a) {
      return h('li', { class: 'alert ' + a.level }, h('span', { class: 'alert-icon', 'aria-hidden': 'true' }, a.level === 'bad' ? '!' : '▲'), h('span', null, a.text));
    })));
    cfg.notes.forEach(function (n) { out.appendChild(h('p', { class: 'note' }, n)); });
    if (!S.settings.balanceSet && !cfg.features.safeToSpend) out.appendChild(UI.card(null, balanceForm(app)));
    var map = { safe: safeWidget, calendar: calendarWidget, month: monthWidget, leaks: leaksWidget, bills: billsWidget, forecast: forecastMini, goals: function (a) { return goalsWidget(a, false); } };
    cfg.order.forEach(function (id) {
      if (!map[id]) return;
      var node = map[id](app);
      if (node) out.appendChild(node);
    });
    var tz = FD.views.ideasTeaser && app.S.mode !== 'fresh' ? FD.views.ideasTeaser(app) : null;
    if (tz) out.appendChild(tz);
    return out;
  }

  /* ================= FORECAST ================= */
  function assumptions(app, fc) {
    var cfg = app.cfg(), S = app.S, now = app.now();
    var vm = E.variableMonthly(cfg, S, now);
    var items = [];
    var freq = C.find(C.PAY_FREQ, cfg.freq).label.toLowerCase();
    if (cfg.irregular) items.push('Income: ' + money(cfg.payLow) + ' in a slow month (line) up to ' + money(cfg.payHigh) + ' in a good month (shaded range).');
    else items.push('Income: ' + money(cfg.payAmount) + ' per paycheck, paid ' + freq + '.');
    if (cfg.extraMonthly) items.push('Other income: ' + money(cfg.extraMonthly) + '/mo, arriving on the 1st.');
    items.push('Starting balance: ' + money(E.currentBalance(S)) + (S.settings.balanceSet ? '.' : ' (you haven’t set it — add it in Settings).'));
    var bills = cfg.bills.reduce(function (s, b) { return s + b.amount; }, 0);
    items.push('Fixed bills: ' + money(bills) + '/mo, paid on their due dates.');
    vm.rows.filter(function (r) { return r.monthly > 0; }).forEach(function (r) {
      var cut = U.num(app.ui.whatIf.cut[r.id], 0);
      items.push(money(r.monthly - cut) + '/mo ' + r.name.toLowerCase() + (cut ? ' (after your ' + money(cut) + ' cut)' : '') + (vm.usingLogged ? ' (your logged average)' : ' (your estimate)'));
    });
    if (fc.debtMin) items.push('Debt minimum payments: ' + money(fc.debtMin) + '/mo on the 1st (we assume the 1st).');
    if (cfg.annual.length) items.push('Yearly costs: ' + money(cfg.annual.reduce(function (s, a) { return s + a.amount; }, 0)) + '/yr, taken in the month they usually hit.');
    if (fc.goalMonthly) items.push('Goal savings: ' + money(fc.goalMonthly) + '/mo to hit your goal dates.');
    if (fc.extraSave) items.push('Extra savings (what-if): ' + money(fc.extraSave) + '/mo.');
    cfg.assumed.forEach(function (a) { items.push('Estimated: ' + a); });
    return UI.card('What this forecast assumes', h('ul', { class: 'assume' }, items.map(function (i) { return h('li', null, i); })));
  }

  function forecastView(app) {
    var cfg = app.cfg(), S = app.S, now = app.now(), ui = app.ui;
    var out = h('main', { class: 'screen', id: 'main' }, h('h1', { class: 'page-title', tabindex: '-1', id: 'q-title' }, 'Balance forecast'));
    var result = h('div'), sliders = h('div', { class: 'stack' });
    var HZ = [[1, '1 mo'], [3, '3 mo'], [6, '6 mo'], [12, '12 mo']];

    function draw() {
      result.textContent = '';
      var days = Math.round(ui.horizon * 30.4);
      var o = { days: days, whatIf: ui.whatIf, includeGoals: S.settings.includeGoals };
      var fc = E.forecast(cfg, S, now, o);
      var hi = cfg.irregular ? E.forecast(cfg, S, now, { days: days, whatIf: ui.whatIf, includeGoals: S.settings.includeGoals, income: 'high' }) : null;
      var whatIfOn = ui.whatIf.extraSavings > 0 || Object.keys(ui.whatIf.cut).some(function (k) { return ui.whatIf.cut[k] > 0; });
      var base = whatIfOn ? E.forecast(cfg, S, now, { days: days, includeGoals: S.settings.includeGoals }) : null;
      result.appendChild(h('div', { class: 'seg', role: 'group', 'aria-label': 'Forecast length' }, HZ.map(function (z) {
        return UI.chip(z[1], ui.horizon === z[0], function () { ui.horizon = z[0]; draw(); });
      })));
      result.appendChild(CH.lineChart({ points: fc.points, high: hi ? hi.points : null, min: cfg.minBalance, label: 'Projected balance for the next ' + ui.horizon + ' months' }));
      var key = h('p', { class: 'chart-key' }, h('span', { class: 'key-line ok' }), ' Balance  ', h('span', { class: 'key-line bad' }), ' Below ' + (cfg.minBalance > 0 ? money(cfg.minBalance) + ' minimum' : '$0'));
      result.appendChild(key);
      result.appendChild(h('p', { class: 'summary-line' + (fc.firstNegative ? ' bad' : '') }, forecastHeadline(app, fc)));
      if (base) {
        var diff = fc.end.balance - base.end.balance;
        result.appendChild(h('p', { class: 'whatif-result' }, 'With your what-if changes you end ' + money(Math.abs(diff)) + (diff >= 0 ? ' higher' : ' lower') + ' by ' + U.fmtDate(fc.end.date) + (fc.setAside ? ', and set aside ' + money(fc.setAside) + ' in savings.' : '.')));
      }
      if (hi) result.appendChild(h('p', { class: 'hint' }, 'The line uses your slow-month income. The shaded area is the range up to a good month.'));
      // table view
      var rows = fc.points.filter(function (p, i) { return p.date.getDate() === 1 || i === 0 || i === fc.points.length - 1; });
      result.appendChild(h('details', { class: 'table-view' }, h('summary', null, 'View as table'),
        h('table', null, h('thead', null, h('tr', null, h('th', null, 'Date'), h('th', null, 'Balance'))),
          h('tbody', null, rows.map(function (p) { return h('tr', null, h('td', null, U.fmtDate(p.date) + ', ' + p.date.getFullYear()), h('td', { class: p.balance < cfg.minBalance ? 'bad' : '' }, money(p.balance))); })))));
      result.appendChild(assumptions(app, fc));
    }

    // what-if sliders (updating the result without redrawing the sliders keeps dragging smooth)
    function slider(label, max, step, get, set, fmt) {
      var out = h('output', { class: 'slider-val' }, fmt(get()));
      var r = h('input', { type: 'range', class: 'range', min: 0, max: max, step: step, value: get(), 'aria-label': label });
      r.addEventListener('input', function () { set(U.num(r.value, 0)); out.textContent = fmt(get()); draw(); });
      return h('div', { class: 'slider' }, h('div', { class: 'slider-top' }, h('span', null, label), out), r);
    }
    var top = cfg.variable.slice().sort(function (a, b) { return b.monthly - a.monthly; }).slice(0, 3);
    top.forEach(function (v) {
      var max = Math.max(Math.min(Math.round(v.monthly / 10) * 10, 300), 10);
      sliders.appendChild(slider('Cut ' + v.name.toLowerCase() + ' by', max, 10, function () { return ui.whatIf.cut[v.id] || 0; }, function (x) { ui.whatIf.cut[v.id] = x; }, function (x) { return money(x) + '/mo'; }));
    });
    sliders.appendChild(slider('Add to savings', 500, 25, function () { return ui.whatIf.extraSavings; }, function (x) { ui.whatIf.extraSavings = x; }, function (x) { return money(x) + '/mo'; }));
    sliders.appendChild(UI.btn('Reset what-if', function () { ui.whatIf = { cut: Object.create(null), extraSavings: 0 }; app.render(); }, 'link'));

    out.appendChild(result);
    out.appendChild(UI.card('What if…', sliders));
    var goalToggle = h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: S.settings.includeGoals, onchange: function (e) { S.settings.includeGoals = e.target.checked; app.commit(); } }), ' Include saving for my goals in the forecast');
    out.appendChild(goalToggle);
    draw();
    return out;
  }

  /* ================= PLAN ================= */
  function addMonths(n) { return U.fmtMonth(U.addMonths(U.today(), n)); }

  function debtCard(app) {
    var cfg = app.cfg(), ui = app.ui;
    var body = h('div'), out;
    function draw() {
      body.textContent = '';
      var plan = FD.engine.debtPlan(cfg, ui.debtExtra);
      var total = cfg.debts.reduce(function (t, d) { return t + d.balance; }, 0);
      body.appendChild(h('p', { class: 'summary-line' }, 'You owe ' + money(total) + ' across ' + cfg.debts.length + (cfg.debts.length === 1 ? ' debt' : ' debts') + '.'));
      var r = h('input', { type: 'range', class: 'range', min: 0, max: 500, step: 25, value: ui.debtExtra, 'aria-label': 'Extra payment per month' });
      var o = h('output', { class: 'slider-val' }, money(ui.debtExtra) + '/mo');
      r.addEventListener('input', function () { ui.debtExtra = U.num(r.value, 0); o.textContent = money(ui.debtExtra) + '/mo'; table.textContent = ''; table.appendChild(compare(FD.engine.debtPlan(cfg, ui.debtExtra))); });
      body.appendChild(h('div', { class: 'slider' }, h('div', { class: 'slider-top' }, h('span', null, 'Extra payment on top of minimums'), o), r));
      var table = h('div'); table.appendChild(compare(plan)); body.appendChild(table);
      cfg.debts.forEach(function (d) {
        if (d.aprGuess || d.minGuess) body.appendChild(h('p', { class: 'hint warn-text' }, '⚠ ' + d.name + ': using an estimated ' + (d.aprGuess ? d.apr + '% rate' : '') + (d.aprGuess && d.minGuess ? ' and ' : '') + (d.minGuess ? money(d.min) + ' minimum' : '') + '. Check your statement and update it in Settings.'));
      });
    }
    function cap(n) { return n > 1e9 ? 'Too large to show' : money(n); }
    function fmt(p) { return p.stuck ? 'Never at these payments' : p.months + ' mo (' + addMonths(p.months) + ')'; }
    function compare(plan) {
      var a = plan.avalanche, s = plan.snowball;
      var diff = s.interest - a.interest;
      var firstA = a.debts.map(function (d) { return d.paidOffAt || 9999; }).sort(function (x, y) { return x - y; })[0];
      var firstS = s.debts.map(function (d) { return d.paidOffAt || 9999; }).sort(function (x, y) { return x - y; })[0];
      return h('div', null,
        h('table', { class: 'compare' }, h('thead', null, h('tr', null, h('th', null, 'Strategy'), h('th', null, 'Debt-free'), h('th', null, 'Interest paid'))),
          h('tbody', null,
            h('tr', null, h('td', null, h('strong', null, 'Avalanche'), h('div', { class: 'hint' }, 'Highest rate first')), h('td', null, fmt(a)), h('td', null, cap(a.interest))),
            h('tr', null, h('td', null, h('strong', null, 'Snowball'), h('div', { class: 'hint' }, 'Smallest balance first')), h('td', null, fmt(s)), h('td', null, cap(s.interest))))),
        h('p', { class: 'hint' }, diff > 1 && diff < 1e9 ? 'Avalanche saves about ' + money(diff) + ' in interest.' + (firstS < firstA ? ' Snowball clears your first debt sooner (month ' + firstS + ' vs ' + firstA + ').' : '') : 'Both strategies cost about the same for your debts.'));
    }
    draw();
    return UI.card('Debt payoff', body);
  }

  function subsCard(app) {
    var cfg = app.cfg(), S = app.S;
    var sub = E.subscriptions(cfg, S);
    var draft = { name: '', amount: null, cycle: 'monthly' };
    var list = sub.items.map(function (i) {
      return h('li', null, h('span', { class: 'bill-name' }, i.name), h('span', { class: 'bill-due' }, i.cycle === 'yearly' ? 'yearly' : 'monthly'), h('span', { class: 'bill-amt' }, money(i.amount, { cents: true })),
        UI.btn('Remove', function () { S.subs = S.subs.filter(function (x) { return x.id !== i.id; }); app.commit(); }, 'small', { 'aria-label': 'Remove ' + i.name }));
    });
    if (sub.unlisted > 0.5 && sub.items.length) list.push(h('li', { class: 'muted' }, h('span', { class: 'bill-name' }, 'Not itemized yet'), h('span', { class: 'bill-amt' }, money(sub.unlisted, { cents: true }))));
    var nameIn = h('input', { type: 'text', class: 'input', maxlength: 40, placeholder: 'e.g. Streaming', 'aria-label': 'Subscription name' });
    nameIn.addEventListener('input', function () { draft.name = nameIn.value; });
    var form = h('div', { class: 'inline add-sub' }, nameIn, UI.moneyInput(null, function (v) { draft.amount = v; }, { label: 'Subscription price' }),
      UI.select([['monthly', 'per month'], ['yearly', 'per year']], 'monthly', function (v) { draft.cycle = v; }, 'Billing cycle'),
      UI.btn('Add', function () {
        if (!draft.amount) return;
        S.subs.push({ id: U.uid('s'), name: U.cleanStr(draft.name, 40) || 'Subscription', amount: draft.amount, cycle: draft.cycle });
        app.commit();
      }, 'small'));
    return UI.card('Subscriptions', [
      h('div', { class: 'tiles two' }, UI.tile('Per month', money(sub.monthly, { cents: sub.monthly % 1 !== 0 })), UI.tile('Per year', money(sub.yearly))),
      list.length ? h('ul', { class: 'bill-list' }, list) : empty('List each one to see which to cancel.'), form]);
  }

  function plan(app) {
    var cfg = app.cfg(), S = app.S, all = S.settings.showAll;
    var out = h('main', { class: 'screen', id: 'main' }, h('h1', { class: 'page-title', tabindex: '-1', id: 'q-title' }, 'Your plan'));
    var any = false;
    if (cfg.features.goals || all || cfg.suggestions.length) { out.appendChild(goalsWidget(app, true)); any = true; }
    if (cfg.features.debtPlan) { out.appendChild(debtCard(app)); any = true; }
    else if (all) out.appendChild(UI.card('Debt payoff', empty('No debts added.')));
    if (cfg.features.subscriptions || all || S.subs.length) { out.appendChild(subsCard(app)); any = true; }
    if (!any) out.appendChild(empty('Nothing to plan yet. Add goals, debts or subscriptions in Settings → Edit answers.'));
    return out;
  }

  /* ================= ACTIVITY ================= */
  function addForm(app) {
    var S = app.S, now = app.now();
    var d = { type: 'expense', amount: null, category: 'groceries', note: '', date: U.iso(now) };
    var box = h('div', { class: 'stack' });
    function draw() {
      box.textContent = '';
      box.appendChild(h('div', { class: 'seg', role: 'group', 'aria-label': 'Type' },
        UI.chip('Spent', d.type === 'expense', function () { d.type = 'expense'; d.category = 'groceries'; draw(); }),
        UI.chip('Got paid', d.type === 'income', function () { d.type = 'income'; d.category = 'pay'; draw(); })));
      var amt = UI.moneyInput(d.amount, function (v) { d.amount = v; }, { label: 'Amount' });
      var cats = (d.type === 'expense' ? C.CATEGORIES : C.INCOME_CATEGORIES).map(function (c) { return [c.id, c.name]; });
      var note = h('input', { type: 'text', class: 'input', maxlength: 80, placeholder: 'Optional note', 'aria-label': 'Note', value: d.note });
      note.addEventListener('input', function () { d.note = note.value; });
      var date = h('input', { type: 'date', class: 'input', value: d.date, 'aria-label': 'Date' });
      date.addEventListener('change', function () { if (U.parseISO(date.value)) d.date = date.value; });
      box.appendChild(UI.field('Amount', amt));
      box.appendChild(UI.field('Category', UI.select(cats, d.category, function (v) { d.category = v; }, 'Category')));
      box.appendChild(h('div', { class: 'fields' }, UI.field('Note', note), UI.field('Date', date)));
      box.appendChild(UI.btn('Add', function () {
        var t = FD.store.sanitizeTxn({ id: U.uid('t'), date: d.date, type: d.type, amount: d.amount, category: d.category, note: d.note });
        if (!t) { UI.toast('Enter an amount first.'); return; }
        S.transactions.push(t); if (app.commit()) UI.toast('Added ' + money(t.amount, { cents: true }));
      }, 'primary'));
    }
    draw();
    return UI.card('Add spending', box);
  }

  function importCard(app) {
    var S = app.S, opts = { dateFormat: 'mdy', spendingPositive: false, alreadyCounted: true };
    var body = h('div', { class: 'stack' }), preview = h('div');
    var file = h('input', { type: 'file', accept: '.csv,.txt,text/csv', class: 'input', 'aria-label': 'Choose a bank CSV file' });
    var parsed = null, rows = null;
    function analyze() {
      preview.textContent = '';
      if (!rows) return;
      try { parsed = FD.csv.toTransactions(rows, { dateFormat: opts.dateFormat, spendingPositive: opts.spendingPositive, existing: S.transactions }); }
      catch (e) { preview.appendChild(h('p', { class: 'bad' }, e.message)); parsed = null; return; }
      preview.appendChild(h('p', { class: 'summary-line' }, 'Found ' + parsed.txns.length + ' new transaction' + (parsed.txns.length === 1 ? '' : 's') + (parsed.dupes ? ', ' + parsed.dupes + ' already imported' : '') + (parsed.skipped ? ', ' + parsed.skipped + ' unreadable row(s) skipped' : '') + '.'));
      if (parsed.txns.length) {
        preview.appendChild(h('ul', { class: 'txn-list' }, parsed.txns.slice(0, 5).map(txnRow)));
        preview.appendChild(h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: opts.alreadyCounted, onchange: function (e) { opts.alreadyCounted = e.target.checked; } }), ' These are already part of my current balance'));
        preview.appendChild(UI.btn('Import ' + parsed.txns.length, function () {
          var add = parsed.txns, todayIso = U.iso(app.now());
          var net = add.reduce(function (s, t) { return t.date <= todayIso ? s + (t.type === 'income' ? t.amount : -t.amount) : s; }, 0); // future-dated rows don't touch today's balance
          if (S.transactions.length + add.length > FD.store.MAX_TXNS) { UI.toast('Too many transactions stored.'); return; }
          if (opts.alreadyCounted && S.settings.balanceSet) S.settings.openingBalance = U.round2(S.settings.openingBalance - net);
          S.transactions = S.transactions.concat(add); rows = null; parsed = null; if (app.commit()) UI.toast('Imported ' + add.length + ' transactions.');
        }, 'primary'));
      }
    }
    file.addEventListener('change', function () {
      var f = file.files && file.files[0]; rows = null; preview.textContent = '';
      if (!f) return;
      if (f.size > 2000000) { preview.appendChild(h('p', { class: 'bad' }, 'That file is too big (limit about 2 MB).')); return; }
      var rd = new FileReader();
      rd.onload = function () { try { rows = FD.csv.parse(String(rd.result)); } catch (e) { preview.appendChild(h('p', { class: 'bad' }, e.message)); return; } analyze(); };
      rd.onerror = function () { preview.appendChild(h('p', { class: 'bad' }, 'Couldn’t read that file.')); };
      rd.readAsText(f);
    });
    body.appendChild(h('p', { class: 'q-help' }, 'Download a CSV from your bank’s website and choose it here. It stays on your device — nothing is uploaded.'));
    body.appendChild(file);
    body.appendChild(h('div', { class: 'fields' },
      UI.field('Dates look like', UI.select([['mdy', 'MM/DD/YYYY'], ['dmy', 'DD/MM/YYYY']], 'mdy', function (v) { opts.dateFormat = v; analyze(); }, 'Date format')),
      h('label', { class: 'check' }, h('input', { type: 'checkbox', onchange: function (e) { opts.spendingPositive = e.target.checked; analyze(); } }), ' My bank shows spending as positive numbers')));
    body.appendChild(preview);
    return UI.card('Import from your bank (CSV)', body);
  }

  function txnRow(t) {
    return h('li', { class: 'txn' },
      h('span', { class: 'txn-date' }, U.fmtDate(U.parseISO(t.date))),
      h('span', { class: 'txn-main' }, h('span', { class: 'txn-note' }, t.note || (t.type === 'income' ? C.nameOf(C.INCOME_CATEGORIES, t.category) : C.nameOf(C.CATEGORIES, t.category))),
        h('span', { class: 'hint' }, t.type === 'income' ? C.nameOf(C.INCOME_CATEGORIES, t.category) : C.nameOf(C.CATEGORIES, t.category))),
      h('span', { class: 'txn-amt ' + (t.type === 'income' ? 'good' : '') }, (t.type === 'income' ? '+' : '-') + money(t.amount, { cents: true })));
  }

  function activity(app) {
    var cfg = app.cfg(), S = app.S;
    var out = h('main', { class: 'screen', id: 'main' }, h('h1', { class: 'page-title', tabindex: '-1', id: 'q-title' }, 'Activity'));
    var forms = cfg.addMode === 'csv' ? [importCard(app), addForm(app)] : cfg.addMode === 'type' ? [addForm(app), importCard(app)] : [addForm(app), importCard(app)];
    forms.forEach(function (f) { out.appendChild(f); });
    var shown = S.transactions.slice().sort(function (a, b) { return a.date < b.date ? 1 : a.date > b.date ? -1 : 0; }).slice(0, app.ui.txnLimit);
    var list = shown.length ? h('ul', { class: 'txn-list' }, shown.map(function (t) {
      var li = txnRow(t);
      li.appendChild(h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Delete transaction ' + (t.note || ''), onclick: function () { S.transactions = S.transactions.filter(function (x) { return x.id !== t.id; }); app.commit(); } }, '✕'));
      return li;
    })) : empty('No transactions yet.');
    out.appendChild(UI.card('Recent activity', [list, S.transactions.length > shown.length ? UI.btn('Show more', function () { app.ui.txnLimit += 50; app.render(); }, 'link') : null]));
    return out;
  }

  /* ================= SETTINGS ================= */
  function summarize(app, q) {
    var a = app.S.answers[q.id];
    if (a === undefined || a === null) return 'Skipped (using defaults)';
    function names(list) { return list.length ? list.map(function (r) { return r.name || (C.find(q.catalog, r.id) || {}).label || 'Other'; }).join(', ') : (q.noneLabel || 'None'); }
    if (q.kind === 'single') return (C.find(q.options, a) || { label: 'Skipped' }).label;
    if (q.kind === 'multi') return a.length ? a.map(function (id) { return (C.find(q.options, id) || {}).label; }).join('; ') : 'None picked';
    if (q.kind === 'pay') return a.amount ? money(a.amount) + ' per paycheck' : a.low ? money(a.low) + '–' + money(a.high || a.low) + ' per month' : 'Skipped';
    return names(a);
  }

  function settings(app) {
    var S = app.S, cfg = app.cfg();
    var out = h('main', { class: 'screen', id: 'main' }, h('h1', { class: 'page-title', tabindex: '-1', id: 'q-title' }, 'Settings'));
    if (S.mode === 'demo') out.appendChild(h('p', { class: 'note' }, 'You’re looking at sample data. Changes here aren’t saved.'));

    // money basics
    var bal = null, minv = null, sav; // sav: undefined = untouched, null = cleared
    out.appendChild(UI.card('Money basics', h('div', { class: 'stack' },
      UI.field('Current balance (checking)', UI.moneyInput(S.settings.balanceSet ? app.balance() : null, function (v) { bal = v; }, { label: 'Current balance', min: -1e8 }), 'Tell us what’s in your account today; we track changes from your logged transactions.'),
      UI.field('Savings I already have (optional)', UI.moneyInput(S.settings.savingsBalance, function (v) { sav = v; }, { label: 'Savings I already have' }), 'Used by the Ideas tab to see how close you are to a cushion. Clear the box and save to go back to \u201cnot given\u201d.'),
      UI.field('Minimum balance I want to stay above', UI.moneyInput(S.settings.minBalance || null, function (v) { minv = v; }, { label: 'Minimum balance' }), 'The forecast turns red below this. Enter 0 to clear it.'),
      UI.btn('Save', function () {
        if (bal !== null) app.setBalance(bal, true);
        if (minv !== null) S.settings.minBalance = minv;
        if (sav !== undefined) S.settings.savingsBalance = sav;
        var od = E.overdueBills(app.cfg(), S, app.now()).length;
        if (app.commit()) UI.toast(od ? 'Saved. ' + od + ' bill' + (od === 1 ? '' : 's') + ' still show as unpaid \u2014 tap \u201cAlready paid\u201d on Home if your new balance already includes ' + (od === 1 ? 'it' : 'them') + '.' : 'Saved', od ? 8000 : 3500);
      }, 'primary'),
      h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: S.settings.showAll, onchange: function (e) { S.settings.showAll = e.target.checked; app.commit(); } }), ' Show every tool, even ones my answers didn’t need')
    )));

    // edit answers
    out.appendChild(UI.card('Your answers', h('ul', { class: 'answers' }, C.QUESTIONS.map(function (q, i) {
      return h('li', null, h('div', { class: 'ans-main' }, h('div', { class: 'ans-q' }, q.title), h('div', { class: 'hint' }, summarize(app, q))),
        UI.btn('Edit', function () { app.editQuestion(i); }, 'small', { 'aria-label': 'Edit answer: ' + q.title }));
    }))));

    if (cfg.assumed.length) out.appendChild(UI.card('Estimates in use', h('ul', null, cfg.assumed.map(function (a) { return h('li', null, a); }))));

    // moving to another device
    out.appendChild(FD.transfer.exportCard(app));
    out.appendChild(UI.card('Restore from a backup', FD.transfer.restoreCard(app)));

    // data
    var dataBody = h('div', { class: 'stack' },
      h('p', { class: 'q-help' }, 'Your numbers are saved only in this browser \u2014 no account, nothing is sent anywhere. They are stored unencrypted, so anyone who can open this browser profile on this device (or a browser extension with access to this site) could read them. If your saved data ever becomes unreadable, a raw copy is kept (keys fd.v1.bak and fd.v1.bak2) until you delete it below; copies use extra browser storage. Private windows won\u2019t keep them, and clearing browser data erases them. Backup files are yours to look after: a plain one can be read by anyone who gets it, a locked one only with its passphrase. \u201cDelete all my data\u201d doesn\u2019t remove files you already saved.'));
    if (S.mode !== 'demo' && FD.store.hasBackups()) dataBody.appendChild(UI.btn('Delete the unreadable-data copies (fd.v1.bak, fd.v1.bak2)', function () {
      if (root.confirm('Delete the saved copies of unreadable data? Your current data is not touched.')) { FD.store.clearBackups(); app.render(); }
    }, 'ghost'));
    if (S.mode === 'demo') dataBody.appendChild(UI.btn('Use my own numbers', function () { app.startReal(); }, 'primary'));
    else dataBody.appendChild(UI.btn('Delete all my data', function () {
      if (root.confirm('Delete everything stored in this browser? This can\u2019t be undone.')) app.wipe();
    }, 'danger'));
    out.appendChild(UI.card('Your data', dataBody));
    return out;
  }

  FD.views = { home: home, forecast: forecastView, plan: plan, activity: activity, settings: settings };
  if (typeof module !== 'undefined' && module.exports) module.exports = FD;
})(typeof window !== 'undefined' ? window : globalThis);
