/* config.js — maps questionnaire answers (+ user overrides) to a dashboard configuration.
   Pure and deterministic: buildConfig(answers, settings, now) -> config.
   Anything the user skipped falls back to a typical default and is listed in config.assumed. */
(function (root) {
  'use strict';
  var FD = (root.FD = root.FD || {});
  var U = FD.util, C = FD.catalog;

  var DEFAULT_PAY = { weekly: 600, biweekly: 1200, twice: 1300, monthly: 2600 };
  var DEFAULT_VARIABLE = ['groceries', 'dining', 'transport', 'shopping'];
  var STYLE_IDS = ['track', 'fifty', 'zero', 'envelopes', 'pick'];

  function validId(list, id) { return !!C.find(list, id); }
  function arr(v) { return Array.isArray(v) ? v : []; }

  function perMonth(freq) {
    var f = C.find(C.PAY_FREQ, freq);
    return (f ? f.perYear : 12) / 12;
  }

  function buildConfig(answers, settings, now) {
    answers = answers || {};
    settings = settings || {};
    now = now || U.today();
    var assumed = [];
    var why = [];

    /* ---- income ---- */
    var freq = validId(C.PAY_FREQ, answers.payFreq) ? answers.payFreq : null;
    if (!freq) { freq = 'biweekly'; assumed.push('Paid every 2 weeks'); }
    var irregular = freq === 'varies';
    var pay = answers.pay || {};
    var amount = 0, low = 0, high = 0;
    var blank = function (v) { return v === null || v === undefined || v === ''; };
    if (irregular) {
      var lowGiven = !blank(pay.low), highGiven = !blank(pay.high);
      low = U.num(pay.low, 0, 0, 1e6); high = U.num(pay.high, 0, 0, 1e6);
      // anything the user actually typed (even 0) is a real answer; only a fully blank screen gets the typical default
      if (pay.none) { low = 0; high = 0; }   // chosen on purpose: no pay right now
      else if (!lowGiven && !highGiven) { low = 1000; high = 1800; assumed.push('Income of $1,000 (slow month) to $1,800 (good month)'); }
      else if (lowGiven && !highGiven) { high = low; if (low > 0) assumed.push('No good-month income given, so we used your slow-month number for both'); }
      else if (highGiven && !lowGiven) { low = high; if (high > 0) assumed.push('No slow-month income given, so we used your good-month number for both'); }
      if (high < low) { var t = high; high = low; low = t; }
    } else {
      amount = U.num(pay.amount, 0, 0, 1e6);
      if (amount <= 0 && !pay.none && blank(pay.amount)) { amount = DEFAULT_PAY[freq]; assumed.push('Paychecks of ' + U.money(amount) + ' (typical)'); }   // an explicit "no pay" stays $0
    }
    var anchor = U.parseISO(pay.nextPayday);
    if (!anchor) { anchor = U.addDays(now, 7); if (!pay.none && amount > 0) assumed.push('Next payday in a week'); }   // no pay on purpose: no payday to assume

    var otherIncome = arr(answers.otherIncome).map(function (o) {
      var cat = C.find(C.OTHER_INCOME, o && o.id);
      var m = o && o.monthly != null ? U.num(o.monthly, 0, 0, 1e6) : (cat ? cat.d : 0);
      return { id: U.cleanStr(o && o.id, 40) || 'other', name: U.cleanStr(o && o.name, 40) || (cat ? cat.label : 'Other income'), monthly: m };
    }).filter(function (o) { return o.monthly > 0; });

    var baseMonthly = irregular ? low : amount * perMonth(freq);
    var extraMonthly = otherIncome.reduce(function (s, o) { return s + o.monthly; }, 0);

    /* ---- bills / spending / annual ---- */
    var bills = arr(answers.bills).map(function (b) {
      var cat = C.find(C.BILLS, b && b.id);
      var amt = b && b.amount != null && b.amount !== '' ? U.num(b.amount, 0, 0, 1e6) : (cat ? cat.d : 0);
      var due = Math.round(U.num(b && b.due, cat ? cat.due : 1, 1, 31));
      return { id: U.cleanStr(b && b.id, 40) || U.uid('bill'), name: U.cleanStr(b && b.name, 40) || (cat ? (cat.short || cat.label) : 'Bill'), amount: amt, due: due };
    }).filter(function (b) { return b.amount > 0; });

    var variable;
    if (answers.variable === undefined || answers.variable === null) {
      variable = DEFAULT_VARIABLE.map(function (id) { var c = C.find(C.VARIABLE, id); return { id: id, name: c.short || c.label, monthly: c.d }; });
      assumed.push('Typical spending on groceries, eating out, transport and shopping');
    } else {
      variable = arr(answers.variable).map(function (v) {
        var cat = C.find(C.VARIABLE, v && v.id);
        var m = v && v.monthly != null && v.monthly !== '' ? U.num(v.monthly, 0, 0, 1e6) : (cat ? cat.d : 0);
        return { id: U.cleanStr(v && v.id, 40) || U.uid('var'), name: U.cleanStr(v && v.name, 40) || (cat ? (cat.short || cat.label) : 'Spending'), monthly: m };
      }).filter(function (v) { return v.monthly > 0; });
    }

    var annual = arr(answers.annual).map(function (a) {
      var cat = C.find(C.ANNUAL, a && a.id);
      var amt = a && a.amount != null && a.amount !== '' ? U.num(a.amount, 0, 0, 1e6) : (cat ? cat.d : 0);
      return { id: U.cleanStr(a && a.id, 40) || U.uid('ann'), name: U.cleanStr(a && a.name, 40) || (cat ? cat.label : 'Yearly cost'), amount: amt, month: Math.round(U.num(a && a.month, cat ? cat.month : 6, 1, 12)) };
    }).filter(function (a) { return a.amount > 0; });

    /* ---- debts ---- */
    var debts = arr(answers.debts).map(function (d) {
      var cat = C.find(C.DEBTS, d && d.type);
      var balance = U.num(d && d.balance, 0, 0, 1e8);
      var aprGuess = !d || d.aprKnown === false || d.apr === null || d.apr === undefined || d.apr === '';
      var apr = aprGuess ? (cat ? cat.apr : 15) : U.num(d.apr, 0, 0, 100);
      var minGuess = !d || d.min === null || d.min === undefined || d.min === '';
      var min = minGuess ? Math.max(25, Math.ceil(balance * (d && d.type === 'card' ? 0.03 : 0.02))) : U.num(d.min, 0, 0, 1e7);
      return { id: U.cleanStr(d && d.id, 40) || U.uid('debt'), type: U.cleanStr(d && d.type, 20) || 'other',
        name: U.cleanStr(d && d.name, 40) || (cat ? cat.label : 'Debt'), balance: balance, min: min, apr: apr, aprGuess: aprGuess, minGuess: minGuess };
    }).filter(function (d) { return d.balance > 0; });
    if (debts.some(function (d) { return d.aprGuess; })) assumed.push('Typical interest rates for debts you weren’t sure about');

    /* ---- goals ---- */
    var goals = arr(answers.goals).map(function (g) {
      var cat = C.find(C.GOALS, g && g.type);
      var target = g && g.target != null && g.target !== '' ? U.num(g.target, 0, 0, 1e8) : (cat ? cat.d : 0);
      var created = U.parseISO(g && g.created) ? g.created : U.iso(now);
      var date = U.parseISO(g && g.date) ? g.date : U.iso(U.addMonths(now, cat ? cat.months : 12));
      return { id: U.cleanStr(g && g.id, 40) || U.uid('goal'), type: U.cleanStr(g && g.type, 20) || 'other',
        name: U.cleanStr(g && g.name, 40) || (cat ? cat.label : 'Goal'), target: target, date: date,
        saved0: U.num(g && g.saved0, 0, 0, 1e8), created: created };
    }).filter(function (g) { return g.target > 0; });

    /* ---- pain points -> features ---- */
    var pain = arr(answers.pain).filter(function (p) { return validId(C.PAIN, p); });
    var flag = {}; pain.forEach(function (p) { flag[p] = true; });
    var hasSubs = bills.some(function (b) { return b.id === 'subs'; });

    var f = {
      safeToSpend: !!flag.runout || answers.homeFirst === 'safe' || pain.length === 0,
      cashCalendar: !!flag.runout,
      leaks: !!flag.dontknow,
      debtPlan: debts.length > 0,
      goals: goals.length > 0,
      subscriptions: hasSubs,
      incomeRange: irregular
    };
    if (flag.runout) why.push('You run out before payday → we added a “safe to spend” number and a payday-to-payday calendar.');
    if (flag.dontknow) why.push('You don’t know where it goes → we added a category chart and your top 3 spending leaks.');
    if (irregular) why.push('Your pay varies → the forecast uses your slow-month income and shows a range.');
    if (f.debtPlan) why.push('You have debt → we added a payoff timeline comparing two strategies.');
    if (f.goals) why.push('You’re saving for something → we added goal progress with an on-track check.');
    if (hasSubs) why.push('You pay for subscriptions → we added a subscription list with monthly and yearly totals.');
    var suggestions = [];
    if (flag.nocushion && !goals.some(function (g) { return g.type === 'emergency'; })) {
      suggestions.push({ type: 'goal', goalType: 'emergency', text: 'No cushion yet — start a small emergency fund?' });
      why.push('You have no cushion → we suggest starting a small emergency fund.');
    }
    if (flag.debt && !debts.length) why.push('You mentioned debt, but didn’t add any — add one in Settings to see a payoff plan.');

    /* ---- budget style ---- */
    var style = STYLE_IDS.indexOf(answers.style) >= 0 ? answers.style : 'pick';
    if (style === 'pick') {
      style = flag.runout ? 'envelopes' : flag.dontknow ? 'track' : (flag.debt || flag.goal || flag.nocushion) ? 'fifty' : 'track';
      why.push('Budget style: ' + C.find(C.STYLES, style).label.toLowerCase() + ' (picked for you).');
    }
    var limits = Object.create(null);
    if (style !== 'track') variable.forEach(function (v) { limits[v.id] = v.monthly; });

    /* ---- home screen order ---- */
    var hero = validId(C.HOMEFIRST, answers.homeFirst) ? answers.homeFirst : 'pick';
    if (hero === 'pick') {
      hero = flag.runout ? 'safe' : flag.dontknow ? 'month' : flag.goal && f.goals ? 'goals' : (flag.nocushion || flag.debt) ? 'forecast' : 'safe';
    }
    if (hero === 'goals' && !f.goals) hero = 'month';
    var order = [];
    var all = !!settings.showAll;
    var allWidgets = [
      ['safe', f.safeToSpend || all], ['calendar', f.cashCalendar || all], ['month', true], ['leaks', f.leaks || all],
      ['bills', true], ['forecast', true], ['goals', f.goals || all], ['debt', f.debtPlan], ['subs', f.subscriptions]
    ];
    var heroKey = hero === 'safe' && !f.safeToSpend && !all ? 'month' : hero;
    order.push(heroKey);
    allWidgets.forEach(function (w) { if (w[1] && order.indexOf(w[0]) < 0) order.push(w[0]); });

    var checkin = validId(C.CHECKIN, answers.checkin) ? answers.checkin : 'weekly';
    var addMode = validId(C.ADDMODE, answers.addMode) ? answers.addMode : 'both';

    var minBalance = U.num(settings.minBalance, 0, 0, 1e7);
    return {
      freq: freq, irregular: irregular, payAmount: amount, payLow: low, payHigh: high, anchor: U.iso(anchor),
      baseMonthly: baseMonthly, extraMonthly: extraMonthly, otherIncome: otherIncome,
      bills: bills, variable: variable, annual: annual, debts: debts, goals: goals,
      pain: pain, features: f, suggestions: suggestions, style: style, limits: limits,
      hero: heroKey, order: order, checkin: checkin, addMode: addMode, minBalance: minBalance,
      assumed: assumed, why: why,
      notes: bills.length === 0 ? ['No fixed bills added yet — the forecast will look rosier than reality until you add them.'] : []
    };
  }

  FD.config = { buildConfig: buildConfig, perMonth: perMonth };
  if (typeof module !== 'undefined' && module.exports) module.exports = FD;
})(typeof window !== 'undefined' ? window : globalThis);
