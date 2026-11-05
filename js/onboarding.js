/* onboarding.js — the questionnaire: one question per screen, every question skippable. */
(function (root) {
  'use strict';
  var FD = (root.FD = root.FD || {});
  var U = FD.util, h = U.h, C = FD.catalog, UI = FD.ui;
  var Q = C.QUESTIONS;

  function dueOptions() {
    var o = []; for (var i = 1; i <= 31; i++) o.push([i, U.ordinal(i)]); return o;
  }
  function monthOptions() { return U.MONTHS.map(function (m, i) { return [i + 1, m]; }); }

  /* ----- renderers by question kind ----- */
  function singleBody(app, q, advance, editing) {
    var cur = app.S.answers[q.id];
    return h('div', { class: 'options' }, q.options.map(function (o) {
      return h('button', { type: 'button', class: 'option' + (cur === o.id ? ' on' : ''), 'aria-pressed': cur === o.id ? 'true' : 'false',
        onclick: function () { app.S.answers[q.id] = o.id; if (editing) app.render(); else { app.save(); advance(true); } } },
        h('span', { class: 'option-label' }, o.label), o.help ? h('span', { class: 'option-help' }, o.help) : null);
    }));
  }

  function multiBody(app, q) {
    var box = h('div', { class: 'options' });
    function draw() {
      box.textContent = '';
      var list = app.S.answers[q.id] || [];
      q.options.forEach(function (o) {
        var on = list.indexOf(o.id) >= 0;
        box.appendChild(h('button', { type: 'button', class: 'option' + (on ? ' on' : ''), 'aria-pressed': on ? 'true' : 'false',
          onclick: function () {
            var l = (app.S.answers[q.id] || []).slice(), i = l.indexOf(o.id);
            if (i >= 0) l.splice(i, 1); else l.push(o.id);
            app.S.answers[q.id] = l; draw();
          } }, h('span', { class: 'option-label' }, (on ? '✓ ' : '') + o.label)));
      });
    }
    draw();
    return box;
  }

  function payBody(app) {
    var a = app.S.answers; a.pay = a.pay || {};
    var varies = a.payFreq === 'varies';
    var wrap = h('div', { class: 'stack' });
    if (varies) {
      wrap.appendChild(UI.field('A slow month (what you can count on)', UI.moneyInput(a.pay.low, function (v) { a.pay.low = v; }, { label: 'Slow month income' }), 'We plan with this number so surprises are good ones.'));
      wrap.appendChild(UI.field('A good month', UI.moneyInput(a.pay.high, function (v) { a.pay.high = v; }, { label: 'Good month income' })));
    } else {
      var range = h('input', { type: 'range', min: 0, max: 6000, step: 50, class: 'range', 'aria-label': 'Paycheck amount slider', value: a.pay.amount || 0 });
      var money = UI.moneyInput(a.pay.amount, function (v) { a.pay.amount = v; range.value = v || 0; }, { label: 'Paycheck amount' });
      range.addEventListener('input', function () {
        a.pay.amount = U.num(range.value, 0);
        var inp = money.querySelector('input'); inp.value = String(a.pay.amount || '');
      });
      wrap.appendChild(UI.field('Per paycheck, after taxes', money));
      wrap.appendChild(range);
    }
    var date = h('input', { type: 'date', class: 'input', 'aria-label': 'Next payday', value: a.pay.nextPayday || '', min: U.iso(app.now()) });
    date.addEventListener('change', function () { a.pay.nextPayday = U.parseISO(date.value) ? date.value : null; });
    wrap.appendChild(UI.field('When is your next payday? (optional)', date, 'Skip this and we’ll assume a week from today.'));
    return wrap;
  }

  /* chips + a detail card per selected item */
  function rowsBody(app, q) {
    var box = h('div', { class: 'stack' });
    function rows() { return app.S.answers[q.id]; }
    function setRows(r) { app.S.answers[q.id] = r; draw(); }
    function has(id) { return (rows() || []).some(function (r) { return r.id === id; }); }

    function defaultRow(cat) {
      var r = { id: q.debt ? 'd-' + cat.id : q.goal ? 'g-' + cat.id : cat.id, name: cat.short || cat.label };
      if (q.debt) { r.type = cat.id; r.aprKnown = true; }
      if (q.goal) { r.type = cat.id; r.created = U.iso(app.now()); r.date = U.iso(U.addMonths(app.now(), cat.months)); r.saved0 = 0; }
      if (q.dueKey) r.due = cat.due;
      if (q.monthKey) r.month = cat.month;
      return r;
    }
    function toggle(cat) {
      var cur = (rows() || []).slice();
      var rid = q.debt ? 'd-' + cat.id : q.goal ? 'g-' + cat.id : cat.id;
      var i = cur.map(function (r) { return r.id; }).indexOf(rid);
      if (i >= 0) cur.splice(i, 1); else cur.push(defaultRow(cat));
      setRows(cur);
    }
    function addOther() {
      var cur = (rows() || []).slice();
      if (cur.length >= 30) return;
      var r = { id: U.uid('x'), name: '', custom: true };
      if (q.debt) { r.type = 'other'; r.aprKnown = true; }
      if (q.goal) { r.type = 'other'; r.created = U.iso(app.now()); r.date = U.iso(U.addMonths(app.now(), 12)); r.saved0 = 0; }
      if (q.dueKey) r.due = 1;
      if (q.monthKey) r.month = 6;
      cur.push(r); setRows(cur);
    }

    function rowCard(r) {
      var cat = C.find(q.catalog, q.debt ? r.type : q.goal ? r.type : r.id);
      var title = r.custom || !cat
        ? h('input', { type: 'text', class: 'input name-input', maxlength: 40, placeholder: 'Name it', 'aria-label': 'Name', value: r.name || '' })
        : h('strong', null, cat.short || cat.label);
      if (r.custom || !cat) title.addEventListener('input', function () { r.name = title.value; });
      var rm = h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Remove ' + (r.name || 'item'), onclick: function () { setRows(rows().filter(function (x) { return x !== r; })); } }, '✕');
      var fields = h('div', { class: 'fields' });
      var typical = cat && (cat.d !== undefined) ? cat.d : null;

      if (q.debt) {
        fields.appendChild(UI.field('What you owe', UI.moneyInput(r.balance, function (v) { r.balance = v; }, { label: 'Balance' })));
        fields.appendChild(UI.field('Smallest monthly payment', UI.moneyInput(r.min, function (v) { r.min = v; }, { label: 'Minimum payment' })));
        var aprIn = UI.moneyInput(r.aprKnown === false ? null : r.apr, function (v) { r.apr = v; r.aprKnown = true; unknown.classList.remove('on'); unknown.setAttribute('aria-pressed', 'false'); note.textContent = ''; }, { label: 'Interest rate percent', suffix: '%', placeholder: '0', max: 100 });
        var note = h('span', { class: 'hint warn-text' }, r.aprKnown === false ? 'We’ll use a typical rate and mark it as an estimate.' : '');
        var unknown = h('button', { type: 'button', class: 'chip small' + (r.aprKnown === false ? ' on' : ''), 'aria-pressed': r.aprKnown === false ? 'true' : 'false', onclick: function () {
          r.aprKnown = false; r.apr = null; aprIn.querySelector('input').value = '';
          unknown.classList.add('on'); unknown.setAttribute('aria-pressed', 'true');
          note.textContent = 'We’ll use a typical ' + (cat ? cat.apr : 15) + '% and mark it as an estimate.';
        } }, 'I don’t know');
        fields.appendChild(h('div', { class: 'field' }, h('span', { class: 'field-label' }, 'Yearly interest rate'), h('div', { class: 'inline' }, aprIn, unknown), note));
      } else if (q.goal) {
        fields.appendChild(UI.field('Target amount', UI.moneyInput(r.target, function (v) { r.target = v; }, { label: 'Target amount', placeholder: cat ? String(cat.d) : '0' }), cat ? 'Typical: ' + U.money(cat.d) + ' — used if blank' : null));
        var d = h('input', { type: 'date', class: 'input', 'aria-label': 'Target date', value: r.date || '', min: U.iso(app.now()) });
        d.addEventListener('change', function () { r.date = U.parseISO(d.value) ? d.value : null; });
        fields.appendChild(UI.field('By when', d));
        fields.appendChild(UI.field('Already saved (optional)', UI.moneyInput(r.saved0 || null, function (v) { r.saved0 = v || 0; }, { label: 'Already saved' })));
      } else {
        fields.appendChild(UI.field(q.amountLabel, UI.moneyInput(r[q.amountKey], function (v) { r[q.amountKey] = v; }, { label: q.amountLabel, placeholder: typical !== null ? String(typical) : '0' }),
          typical !== null ? 'Typical: ' + U.money(typical) + ' — used if blank' : null));
        if (q.dueKey) fields.appendChild(UI.field('Due on the', UI.select(dueOptions(), r.due || 1, function (v) { r.due = +v; }, 'Day of month due')));
        if (q.monthKey) fields.appendChild(UI.field('Usually in', UI.select(monthOptions(), r.month || 6, function (v) { r.month = +v; }, 'Month')));
      }
      return h('div', { class: 'row-card' }, h('div', { class: 'row-head' }, title, rm), fields);
    }

    function draw() {
      box.textContent = '';
      var list = rows();
      var chips = h('div', { class: 'chips' });
      q.catalog.forEach(function (cat) {
        var rid = q.debt ? 'd-' + cat.id : q.goal ? 'g-' + cat.id : cat.id;
        chips.appendChild(UI.chip(cat.short || cat.label, has(rid), function () { toggle(cat); }));
      });
      if (q.other) chips.appendChild(UI.chip('Other', false, addOther));
      if (q.noneLabel) chips.appendChild(UI.chip(q.noneLabel, Array.isArray(list) && list.length === 0, function () { setRows([]); }));
      box.appendChild(chips);
      (list || []).forEach(function (r) { box.appendChild(rowCard(r)); });
    }
    draw();
    return box;
  }

  /* ----- one question screen ----- */
  function screen(app, qi, opts) {
    opts = opts || {};
    var q = Q[qi], total = Q.length;
    function next() { opts.onNext ? opts.onNext() : app.goStep(qi + 1); }
    function advance(auto) {
      app.save();
      if (!auto) { next(); return; }
      clearTimeout(app._adv);
      app._adv = setTimeout(function () { if (app.ui.step === qi) next(); }, 180); // ignored if you already tapped Back
    }

    var body;
    if (q.kind === 'single') body = singleBody(app, q, advance, opts.editing);
    else if (q.kind === 'multi') body = multiBody(app, q);
    else if (q.kind === 'pay') body = payBody(app);
    else body = rowsBody(app, q);

    var progress = opts.editing ? null : h('div', { class: 'progress' },
      h('div', { class: 'progress-top' }, h('span', null, q.section), h('span', null, (qi + 1) + ' of ' + total)),
      FD.charts.bar((qi + 1) / total, '', 'Questionnaire progress'));

    var footer = opts.editing
      ? h('div', { class: 'nav-row' }, UI.btn('Cancel', function () { opts.onCancel(); }, 'ghost'),
        UI.btn('Use defaults', function () { delete app.S.answers[q.id]; app.save(); opts.onNext(); }, 'link'),
        UI.btn('Save', function () { app.save(); opts.onNext(); }, 'primary'))
      : h('div', { class: 'nav-row' },
        UI.btn('Back', function () { clearTimeout(app._adv); app.save(); app.goStep(qi - 1); }, 'ghost', qi === 0 ? { disabled: true } : null),
        UI.btn('Skip', function () { delete app.S.answers[q.id]; app.save(); next(); }, 'link'),
        UI.btn(qi === total - 1 ? 'Finish' : 'Next', function () { advance(false); }, 'primary'));

    return h('main', { class: 'screen onboarding', id: 'main' }, progress,
      h('h1', { class: 'q-title', tabindex: '-1', id: 'q-title' }, q.title),
      q.help ? h('p', { class: 'q-help' }, q.help) : null, body, footer);
  }

  /* ----- "here's what we set up" ----- */
  function summary(app) {
    var cfg = app.cfg();
    var bal = h('div');
    var s = app.S.settings;
    bal.appendChild(UI.field('What’s in your checking account right now? (optional)', UI.moneyInput(s.balanceSet ? app.balance() : null, function (v) { app._pendingBalance = v; }, { label: 'Current balance', min: -1e8 }), 'Used as the starting point for your forecast. Overdrawn? Enter a negative number. Skip and we’ll start from $0.'));
    var why = cfg.why.length ? h('ul', { class: 'why' }, cfg.why.map(function (w) { return h('li', null, w); })) : h('p', { class: 'q-help' }, 'Basic dashboard: your month at a glance and a balance forecast.');
    var assumed = cfg.assumed.length ? h('div', { class: 'flag' }, h('strong', null, 'Estimates we filled in for you'), h('ul', null, cfg.assumed.map(function (a) { return h('li', null, a); })), h('p', { class: 'hint' }, 'Change any of these later in Settings.')) : null;
    return h('main', { class: 'screen onboarding', id: 'main' },
      h('div', { class: 'progress' }, h('div', { class: 'progress-top' }, h('span', null, 'All done'), h('span', null, Q.length + ' of ' + Q.length)), FD.charts.bar(1, '', 'Questionnaire progress')),
      h('h1', { class: 'q-title', tabindex: '-1', id: 'q-title' }, 'Your dashboard is ready'),
      why, assumed, bal,
      h('div', { class: 'nav-row' }, UI.btn('Back', function () { app.goStep(Q.length - 1); }, 'ghost'),
        UI.btn('Open my dashboard', function () { app.finishOnboarding(); }, 'primary')));
  }

  FD.onboarding = { screen: screen, summary: summary, total: Q.length };
  if (typeof module !== 'undefined' && module.exports) module.exports = FD;
})(typeof window !== 'undefined' ? window : globalThis);
