/* ideas-view.js - the Ideas tab and the small teaser on Home.
   Everything here is built from the person's own numbers by FD.ideas. It is education, not advice, and it never names a product. */
(function (root) {
  'use strict';
  var FD = (root.FD = root.FD || {});
  var U = FD.util, h = U.h, C = FD.catalog, UI = FD.ui, CH = FD.charts, I = FD.ideas;
  var money = U.money;

  function qIndex(id) { for (var i = 0; i < C.QUESTIONS.length; i++) if (C.QUESTIONS[i].id === id) return i; return -1; }
  function editAnswer(app, id) { var i = qIndex(id); if (i >= 0) app.editQuestion(i); }
  function plural(n, one, many) { return n + ' ' + (n === 1 ? one : many || one + 's'); }
  var DISMISS_RE = /^[a-z]+:[A-Za-z0-9._:-]{1,60}$/;
  function isDismissed(app, id) { return (app.S.settings.dismissed || []).indexOf(id) >= 0; }
  function dismiss(app, id) {
    if (!DISMISS_RE.test(id)) return;
    var d = app.S.settings.dismissed = app.S.settings.dismissed || [];
    if (d.indexOf(id) < 0) d.push(id);
    if (d.length > 100) d.splice(0, d.length - 100);
    app.commit();
  }

  /* ---------- 1. things that look different since you set up ---------- */
  var APPLY_LABEL = { pay: 'Update my pay', bill: 'Update the amount', var: 'Use as my estimate', newbill: 'Add as a bill', goto: 'Update balance' };
  function applyDrift(app, s) {
    var S = app.S, a = s.apply, A = S.answers, cfg = app.cfg();
    if (a.kind === 'goto') { app.go(a.tab); return; }
    if (a.kind === 'pay') {
      var p = A.pay || { amount: null, low: null, high: null, nextPayday: null };
      A.pay = { amount: a.amount, low: p.low, high: p.high, nextPayday: p.nextPayday };
    } else if (a.kind === 'bill') {
      A.bills = (A.bills || []).map(function (b) { return b.id === a.id ? Object.assign({}, b, { amount: a.amount }) : b; });
    } else if (a.kind === 'var') {
      if (!Array.isArray(A.variable)) A.variable = cfg.variable.map(function (v) { return { id: v.id, name: v.name, monthly: v.monthly }; }); // keep what the defaults were
      A.variable = A.variable.map(function (v) { return v.id === a.id ? Object.assign({}, v, { monthly: a.amount }) : v; });
    } else if (a.kind === 'newbill') {
      var nb = { id: U.uid('r'), name: U.cleanStr(a.name, 40) || 'Bill', amount: a.amount, due: Math.max(1, Math.min(31, a.due || 1)) };
      A.bills = (A.bills || []).concat([nb]);
      // the matching past charges were counted as everyday spending; point them at the new bill so nothing is counted twice
      var ids = Object.create(null); (a.txnIds || []).forEach(function (x) { ids[x] = true; });
      S.transactions.forEach(function (t) { if (ids[t.id] && !t.billId) { t.billId = nb.id; t.category = 'billpay'; } });
    }
    var msg = a.kind === 'var' ? 'Estimate updated. Your forecast already uses what you actually log; this changes your budget limits.'
      : a.kind === 'newbill' ? 'Added as a bill. The matching past charges now count as that bill, not as everyday spending.'
      : 'Updated. Your forecast uses the new number from today. Spending you already logged stays as it was.';
    if (app.commit()) UI.toast(msg, 6000);
  }
  function driftCard(app, list) {
    return UI.card('Things that look different', [
      h('p', { class: 'q-help' }, 'We compared what you log with what you told us when you set up.'),
      h('ul', { class: 'ideas' }, list.map(function (s) {
        return h('li', { class: 'idea' },
          h('div', { class: 'idea-main' }, h('strong', null, s.title), h('div', { class: 'hint' }, s.detail)),
          h('div', { class: 'idea-actions' },
            s.apply.kind === 'goto' && app.demoOnly ? null : UI.btn(APPLY_LABEL[s.apply.kind] || 'Update', function () { applyDrift(app, s); }, 'small primary', { 'aria-label': (APPLY_LABEL[s.apply.kind] || 'Update') + ': ' + s.title }),
            UI.btn('Not now', function () { dismiss(app, s.id); }, 'small', { 'aria-label': 'Dismiss: ' + s.title })));
      }))
    ], { cls: 'attention' });
  }

  /* ---------- 2. how much could you set aside ---------- */
  function stepBlurb(p, st) {
    if (st.id === 'cushion') {
      var c = p.cushion;
      if (c.done) return 'You have about ' + money(c.have) + ', roughly ' + (Math.floor(c.monthsCovered * 10) / 10) + ' months of the things you must pay. That is a solid cushion.';
      var line = 'A common first goal is about 3 months of must-pay costs: ' + money(c.target3) + '. ';
      if (c.have === null) return line + 'Tell us what you have saved (below) to see how close you are.';
      return line + 'You have about ' + money(c.have) + ' (' + (Math.floor(c.monthsCovered * 10) / 10) + ' months), so ' + money(c.gap) + ' to go.';
    }
    if (st.id === 'debt') return p.expensiveDebt.map(function (d) { return d.name + ' at ' + d.apr + '%' + (d.guess ? ' (typical rate)' : '') + ' costs about ' + money(d.yearlyInterest) + ' a year'; }).join('; ') + '. Every dollar you pay off stops costing that interest.';
    return 'Money you will not need for 5+ years. A broad index fund is one common way to hold it; see what it could grow into below.';
  }
  function setAsideCard(app) {
    var cfg = app.cfg(), S = app.S, p = I.plan(cfg, S, app.now()), body = [];
    if (p.status === 'unknown') {
      body.push(h('p', { class: 'q-help' }, 'Add what you earn and we can work out how much is left over each month. We won’t guess your pay.'), UI.btn('Add my pay', function () { editAnswer(app, 'pay'); }, 'primary'));
      return UI.card('How much could you set aside?', body);
    }
    var basis = 'Based on ' + money(p.income) + ' a month coming in' + (cfg.irregular ? ' (your slow-month pay)' : '') + ', minus ' + money(p.bills) + ' in bills, ' + money(p.variable) + ' of everyday spending' + (p.usingLogged ? ' (your logged average)' : ' (your estimate)') + (p.debtMin ? ', ' + money(p.debtMin) + ' in debt minimums' : '') + (p.annualMonthly >= 1 ? ', ' + money(p.annualMonthly) + ' set aside for yearly costs' : '') + (p.goalMonthly >= 1 ? ' and ' + money(Math.min(p.goalMonthly, Math.max(0, p.free))) + ' for your goals' : '') + '.';
    if (p.status === 'deficit') {
      body.push(h('p', { class: 'summary-line bad' }, 'Right now you plan to spend about ' + money(-p.free) + ' a month more than you bring in.'),
        h('p', { class: 'q-help' }, 'There is nothing to set aside yet. The ideas below for spending less are the place to start.'), h('p', { class: 'hint' }, basis), p.guessed.length ? h('p', { class: 'note' }, 'This uses typical amounts we filled in for ' + p.guessed.join(' and ') + '. Add yours under Settings, Your answers, for a number you can rely on.') : null);
      return UI.card('How much could you set aside?', body);
    }
    if (p.status === 'tight') {
      body.push(h('p', { class: 'summary-line' }, 'About ' + money(p.capacity) + ' a month is left over' + (p.goalMonthly >= 1 && p.free > 0 ? ' after about ' + money(Math.min(p.goalMonthly, p.free)) + ' for your goals' : '') + '.'),
        h('p', { class: 'q-help' }, 'That is tight. Even $10 to $25 a month can start the habit while you look for room below.'), h('p', { class: 'hint' }, basis), p.guessed.length ? h('p', { class: 'note' }, 'This uses typical amounts we filled in for ' + p.guessed.join(' and ') + '. Add yours under Settings, Your answers, for a number you can rely on.') : null, p.goalsOverCapacity ? h('p', { class: 'note' }, 'Your goals need ' + money(p.goalMonthly) + ' a month to hit their dates, which is more than the ' + money(Math.max(0, p.free)) + ' you have left over before goals. Move a goal date or lower a target on the Plan tab.') : null);
      return UI.card('How much could you set aside?', body);
    }
    body.push(h('div', { class: 'tiles' }, UI.tile('Comfortable', money(p.comfortable), 'good'), UI.tile('Stretch', money(p.stretch)), UI.tile('Left over', money(p.capacity))),
      h('p', { class: 'q-help' }, 'Per month. “Comfortable” is half of what is left over, so a surprise doesn’t knock you off track. “Stretch” is most of it.'), h('p', { class: 'hint' }, basis));
    if (p.guessed.length) body.push(h('p', { class: 'note' }, 'This uses typical amounts we filled in for ' + p.guessed.join(' and ') + '. Add yours under Settings, Your answers, for a number you can rely on.'));
    var sav; // undefined = untouched, null = cleared
    var steps = h('ol', { class: 'steps' }, p.steps.map(function (st, i) {
      return h('li', { class: 'step ' + st.status },
        h('span', { class: 'step-n', 'aria-hidden': 'true' }, st.status === 'done' ? '✓' : String(i + 1)),
        h('div', { class: 'idea-main' },
          h('div', { class: 'step-top' }, h('strong', null, st.title), h('span', { class: 'pill' + (st.status === 'done' ? ' good' : '') }, st.status === 'now' ? 'Start here' : st.status === 'done' ? 'Done' : 'Next')),
          h('div', { class: 'hint' }, stepBlurb(p, st)),
          st.status !== 'done' && st.amount > 0 ? h('div', { class: 'hint' }, 'About ' + money(st.amount) + ' a month.') : null));
    }));
    body.push(h('h3', null, 'One common order'), steps);
    var db = p.expensiveDebt.length ? I.debtBoost(cfg, p.comfortable) : null;
    if (db && !db.stuckAfter && !db.stuckBefore && db.monthsWithout > db.monthsWith) body.push(h('p', { class: 'q-help' }, 'Putting ' + money(p.comfortable) + ' a month on your debts on top of the minimums would clear them about ' + plural(db.monthsWithout - db.monthsWith, 'month') + ' sooner and save about ' + money(db.interestSaved) + ' in interest.'));
    body.push(h('div', { class: 'stack' },
      UI.field('Savings you already have (optional)', UI.moneyInput(S.settings.savingsBalance, function (v) { sav = v; }, { label: 'Savings you already have' }), 'Stays on this device. Used only to see how close you are to a cushion.'),
      UI.btn('Save savings amount', function () { if (sav === undefined) return; S.settings.savingsBalance = sav; app.commit(); }, 'small')));
    body.push(h('p', { class: 'hint' }, 'General education based on your numbers, not personal financial advice.'));
    return UI.card('How much could you set aside?', body);
  }

  /* ---------- 3. what could it grow into (illustration) ---------- */
  function projectionCard(app) {
    var S = app.S, ui = app.ui, p = I.plan(app.cfg(), S, app.now());
    if (!ui.proj) ui.proj = { monthly: null, start: 0, startEdited: false, years: 10, pick: 'blend', rates: Object.create(null) };
    var st = ui.proj;
    if (!st.startEdited) st.start = S.settings.savingsBalance === null || S.settings.savingsBalance === undefined ? 0 : S.settings.savingsBalance;   // follows your saved savings until you type a number here
    if (st.monthly === null) st.monthly = p.comfortable > 0 ? p.comfortable : 100;
    var result = h('div', { class: 'stack' }), controls = h('div', { class: 'stack' });

    function draw() {
      result.textContent = '';
      var rates = {}; Object.keys(st.rates).forEach(function (k) { rates[k] = st.rates[k]; });
      var proj = I.project({ monthly: st.monthly, start: st.start, years: st.years, rates: rates });
      var put = (st.start || 0) + (st.monthly || 0) * st.years * 12;
      result.appendChild(h('p', { class: 'summary-line' }, 'Putting in ' + money(st.monthly || 0) + ' a month for ' + st.years + ' years means ' + money(put) + ' from you' + (st.start ? ' (including ' + money(st.start) + ' to start)' : '') + '. Here is what it could become, in today’s money:'));
      var tableBox = h('div', { class: 'table-scroll', role: 'group', 'aria-label': 'Growth illustration by fund type' }, h('table', { class: 'compare' },
        h('thead', null, h('tr', null, h('th', null, 'If it were in'), h('th', null, 'Cautious'), h('th', null, 'Middle'), h('th', null, 'Hopeful'))),
        h('tbody', null, proj.map(function (r) {
          function end(s) { return money(s[s.length - 1].value); }
          return h('tr', null, h('td', null, r.name), h('td', null, end(r.low)), h('td', null, h('strong', null, end(r.mid))), h('td', null, end(r.high)));
        }))));
      result.appendChild(tableBox);
      (function keyboardScroll() {   // a scrolling box must be reachable by keyboard, but only when something really scrolls
        function fit() { if (tableBox.scrollWidth > tableBox.clientWidth + 1) tableBox.setAttribute('tabindex', '0'); else tableBox.removeAttribute('tabindex'); }
        fit(); if (root.ResizeObserver) { try { new root.ResizeObserver(fit).observe(tableBox); } catch (e) { /* fit() above is enough */ } }
      })();
      // one chart with every option (the middle case), so they can be compared at a glance; the chips only choose whose cautious-to-hopeful range is shaded
      function pts(s) { return s.map(function (x) { return { year: x.year, balance: x.value }; }); }
      function shortName(r) { return r.name.replace(/ \(.*\)$/, ''); }
      var step = st.years <= 10 ? 1 : 5, sel = proj.filter(function (r) { return r.id === st.pick; })[0] || null;
      var lines = proj.map(function (r, i) { return { id: r.id, name: shortName(r), cls: 's' + (i + 1), pts: pts(r.mid) }; });
      var summary = lines.map(function (l) { return l.name + ' about ' + money(l.pts[l.pts.length - 1].balance); }).join('; ');
      var reach = Math.max.apply(null, proj.map(function (r) { return r.high[r.high.length - 1].value; }));   // so choosing a different range never rescales the chart
      result.appendChild(CH.multiLine({ series: lines, value: money, reach: reach,
        band: sel ? { id: sel.id, cls: lines[proj.indexOf(sel)].cls, low: pts(sel.low), high: pts(sel.high) } : null,
        label: 'Possible growth of each option over ' + st.years + ' years, middle case, in today’s money. After ' + st.years + ' years: ' + summary + '.',
        xLabel: function (q) { return q.year === 0 ? 'Now' : q.year % step === 0 ? 'Yr ' + q.year : null; },
        tipTitle: function (i) { return i === 0 ? 'Now' : 'After ' + i + (i === 1 ? ' year' : ' years'); } }));
      result.appendChild(h('p', { class: 'q-help' }, 'Each line is the middle case. Tap a name below to shade its range from cautious to hopeful.'));
      result.appendChild(h('div', { class: 'seg', role: 'group', 'aria-label': 'Shade the cautious-to-hopeful range for' }, proj.map(function (r) {
        var label = shortName(r);
        return UI.chip(label, st.pick === r.id, function () {
          st.pick = st.pick === r.id ? null : r.id; draw();
          var again = Array.prototype.filter.call(result.querySelectorAll('button.chip'), function (b) { return b.textContent === label; })[0];
          if (again) again.focus({ preventScroll: true });   // draw() rebuilt the chips; keep keyboard focus where it was
        });
      })));
      result.appendChild(sel
        ? h('p', { class: 'hint' }, sel.blurb + ' The shaded area is ' + sel.rates.low + '% to ' + sel.rates.high + '% a year (middle ' + sel.rates.mid + '%), after inflation and fees.')
        : h('p', { class: 'hint' }, 'Middle yearly growth after inflation and fees: ' + proj.map(function (r) { return shortName(r) + ' ' + r.rates.mid + '%'; }).join(', ') + '.'));
    }

    var years = UI.select([[5, '5 years'], [10, '10 years'], [20, '20 years'], [30, '30 years']], st.years, function (v) { st.years = U.num(v, 10, 1, 60); draw(); }, 'How long');
    controls.appendChild(h('div', { class: 'fields' },
      UI.field('Put in each month', UI.moneyInput(st.monthly, function (v) { st.monthly = v === null ? 0 : v; draw(); }, { label: 'Amount to put in each month', max: 100000 })),
      UI.field('Starting amount', UI.moneyInput(st.start, function (v) { st.start = v === null ? 0 : v; st.startEdited = true; draw(); }, { label: 'Starting amount' })),
      UI.field('For', years)));
    var rateBox = h('div', { class: 'stack' });
    I.INSTRUMENTS.forEach(function (ins) {
      rateBox.appendChild(UI.field(ins.name + ': middle yearly growth', UI.moneyInput(st.rates[ins.id] !== undefined ? st.rates[ins.id] : ins.real.mid, function (v) {
        if (v === null) delete st.rates[ins.id]; else st.rates[ins.id] = v; draw();
      }, { label: ins.name + ' middle yearly growth percent', suffix: '% a year', min: -20, max: 30 })));
    });
    rateBox.appendChild(UI.btn('Reset to the defaults', function () { st.rates = Object.create(null); app.render(); }, 'link'));
    controls.appendChild(h('details', null, h('summary', null, 'Change the growth assumptions'), rateBox));
    draw();
    return UI.card('What could it grow into?', [
      h('p', { class: 'note' }, 'An illustration, not a prediction and not advice. Real returns change every year and can be negative, stocks most of all. Nothing here is a recommendation of any product, and an “index fund” is just a fund that tracks a broad group of investments.'),
      controls, result,
      h('p', { class: 'hint' }, 'The yearly rates are rough planning ranges after inflation and typical fund fees, so the dollars are in today’s buying power. Past results don’t guarantee future ones.')]);
  }

  /* ---------- 4. ways to spend less ---------- */
  function spendLessCard(app) {
    var list = I.opportunities(app.cfg(), app.S, app.now());
    var body = list.length ? h('ul', { class: 'ideas' }, list.map(function (o) {
      var go = o.kind === 'subs' ? UI.btn('Review subscriptions', function () { app.go('plan'); }, 'small') : o.kind === 'interest' ? UI.btn('See my debt plan', function () { app.go('plan'); }, 'small') : null;
      return h('li', { class: 'idea' },
        h('div', { class: 'idea-main' }, h('strong', null, o.title), h('div', { class: 'hint' }, o.detail), h('div', { class: 'hint' }, o.rule)),
        h('div', { class: 'idea-actions' }, h('span', { class: 'pill good' }, '≈ ' + money(o.saves) + ' a year'), go));
    })) : h('p', { class: 'empty' }, 'Nothing stands out yet. Log a few weeks of spending and check back.');
    return UI.card('Ways to spend less', [body, h('p', { class: 'hint' }, 'The yearly amounts are rough and overlap, so don’t add them up. They are possibilities, not promises.')]);
  }

  /* ---------- 5. possible duplicates ---------- */
  function dupesCard(app) {
    var S = app.S, list = I.duplicates(app.cfg(), S, app.now()).filter(function (d) { return !isDismissed(app, d.id); });
    var body = list.length ? h('ul', { class: 'ideas' }, list.map(function (d) {
      var act = null;
      if (d.kind === 'double') act = UI.btn('Remove the second charge', function () {
        var t = S.transactions.filter(function (x) { return x.id === d.txnId; })[0]; if (!t) return;
        if (!root.confirm('Remove the ' + money(t.amount, { cents: true }) + ' charge for “' + t.note + '” on ' + U.fmtDate(U.parseISO(t.date)) + '? If it was a real purchase, you can add it back in Activity.')) return;
        S.transactions = S.transactions.filter(function (x) { return x.id !== d.txnId; });
        if (app.commit()) UI.toast('Removed. Your balance went up by ' + money(t.amount, { cents: true }) + '.' + (app.demoOnly ? '' : ' If your bank balance already includes both charges, update it in Settings.'), 8000);   // the demo has no Settings
      }, 'small', { 'aria-label': 'Remove the second charge: ' + d.title });
      else if (d.kind === 'bill-dup') act = UI.btn('Edit my bills', function () { editAnswer(app, 'bills'); }, 'small');
      else act = UI.btn('Review subscriptions', function () { app.go('plan'); }, 'small');
      return h('li', { class: 'idea' },
        h('div', { class: 'idea-main' }, h('strong', null, d.title), h('div', { class: 'hint' }, d.detail)),
        h('div', { class: 'idea-actions' }, h('span', { class: 'pill good' }, '≈ ' + money(d.saves) + (d.oneOff ? '' : ' a year')), act,
          UI.btn('Not a duplicate', function () { dismiss(app, d.id); }, 'small', { 'aria-label': 'Not a duplicate: ' + d.title })));
    })) : h('p', { class: 'empty' }, 'No doubled-up charges found.');
    return UI.card('Possible duplicates', [body, h('p', { class: 'hint' }, 'We look for the same subscription or bill listed twice, two services of the same kind (like two music apps), and the same charge twice within three days. Only you know which are real.')]);
  }

  /* ---------- 6. when things change ---------- */
  function changesCard(app) {
    var q = function (label, id) { return UI.btn(label, function () { editAnswer(app, id); }, 'small'); };
    return UI.card('When something changes', [
      h('p', { class: 'q-help' }, 'New job, a raise, a rent or mortgage change, a new HOA fee, a new subscription, a new debt: update that one answer and the forecast, safe-to-spend and ideas all use it from today. Spending you already logged stays as it was. Nothing is lost by changing an answer.'),
      h('div', { class: 'chips' }, q('My pay changed', 'pay'), q('A bill changed', 'bills'), q('My spending changed', 'variable'), q('New debt', 'debts'), q('New goal', 'goals'),
        app.demoOnly ? null : UI.btn('Update my balance', function () { app.go('settings'); }, 'small')),   // Settings does not exist in the survey's demo
      h('p', { class: 'hint' }, 'Logging your spending keeps this honest. We compare it with what you told us and point out differences at the top of this page.')]);
  }

  function ideas(app) {
    var out = h('main', { class: 'screen', id: 'main' }, h('h1', { class: 'page-title', tabindex: '-1', id: 'q-title' }, 'Ideas'));
    out.appendChild(h('p', { class: 'q-help' }, 'Suggestions worked out from your own numbers. They change as your numbers do.'));
    var d = I.drift(app.cfg(), app.S, app.now());
    if (d.length) out.appendChild(driftCard(app, d));
    out.appendChild(setAsideCard(app));
    out.appendChild(projectionCard(app));
    out.appendChild(spendLessCard(app));
    out.appendChild(dupesCard(app));
    out.appendChild(changesCard(app));
    return out;
  }

  /* ---------- Home teaser ---------- */
  function teaser(app) {
    var cfg = app.cfg(), S = app.S, now = app.now(), p = I.plan(cfg, S, now);
    if (p.status === 'unknown') return null;
    var lines = [];
    if (p.status === 'ok' && p.guessed.length) lines.push('Add ' + p.guessed.join(' and ') + ' under Settings for a set-aside number you can rely on.');
    else if (p.status === 'ok') lines.push('You could comfortably set aside about ' + money(p.comfortable) + ' a month.');
    else if (p.status === 'tight') lines.push('Only about ' + money(p.capacity) + ' a month is left over after your bills and usual spending.');
    else lines.push('You plan to spend about ' + money(-p.free) + ' a month more than you bring in.');
    var top = I.opportunities(cfg, S, now)[0];
    if (top) lines.push('A place to look: ' + top.title.charAt(0).toLowerCase() + top.title.slice(1) + ' (≈ ' + money(top.saves) + ' a year).');
    var dr = I.drift(cfg, S, now).length, dup = I.duplicates(cfg, S, now).filter(function (x) { return !isDismissed(app, x.id); }).length;
    if (dr) lines.push(plural(dr, 'thing') + ' look' + (dr === 1 ? 's' : '') + ' different since you set up.');
    if (dup) lines.push(plural(dup, 'possible duplicate') + ' to check.');
    return UI.card('Ideas for you', [h('ul', { class: 'teaser' }, lines.map(function (l) { return h('li', null, l); })), UI.btn('See all ideas', function () { app.go('ideas'); }, 'link')]);
  }

  FD.views = FD.views || {};
  FD.views.ideas = ideas; FD.views.ideasTeaser = teaser;
  if (typeof module !== 'undefined' && module.exports) module.exports = FD;
})(typeof window !== 'undefined' ? window : globalThis);
