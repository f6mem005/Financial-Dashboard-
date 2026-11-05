/* store.js — app state shape, validation of anything loaded from disk/localStorage, persistence.
   Everything read back from storage is re-built field-by-field (never trusted or merged as-is). */
(function (root) {
  'use strict';
  var FD = (root.FD = root.FD || {});
  var U = FD.util, C = FD.catalog;
  var KEY = 'fd.v1';
  var MAX_TXNS = 20000, MAX_ROWS = 40;
  var ID_RE = /^(?!(?:__proto__|constructor|prototype|toString|valueOf|hasOwnProperty)$)[A-Za-z0-9_-]{1,60}$/;
  var BAK_KEY = 'fd.v1.bak';
  var EXPENSE_CATS = C.CATEGORIES.map(function (c) { return c.id; });
  var INCOME_CATS = C.INCOME_CATEGORIES.map(function (c) { return c.id; });

  function defaultState() {
    return {
      v: 1, mode: 'fresh', // 'fresh' | 'demo' | 'real'
      answers: {}, onboarded: false,
      settings: { openingBalance: 0, balanceSet: false, minBalance: 0, includeGoals: true, showAll: false },
      transactions: [], billsPaid: {}, subs: []
    };
  }

  function arr(v, max) { return Array.isArray(v) ? v.slice(0, max || MAX_ROWS) : []; }
  function id(v, prefix) { return typeof v === 'string' && ID_RE.test(v) ? v : U.uid(prefix); }
  function optNum(v, min, max) { return v === null || v === undefined || v === '' ? null : U.num(v, 0, min, max); }
  function isObj(v) { return v && typeof v === 'object' && !Array.isArray(v); }
  function oneOf(v, list) { return list.indexOf(v) >= 0 ? v : null; }

  function sanitizeAnswers(a) {
    var out = {};
    if (!isObj(a)) return out;
    if (oneOf(a.payFreq, C.PAY_FREQ.map(function (x) { return x.id; }))) out.payFreq = a.payFreq;
    if (isObj(a.pay)) {
      out.pay = { amount: optNum(a.pay.amount, 0, 1e6), low: optNum(a.pay.low, 0, 1e6), high: optNum(a.pay.high, 0, 1e6),
        nextPayday: U.parseISO(a.pay.nextPayday) ? a.pay.nextPayday : null };
    }
    function rows(list, fields) {
      return arr(list).filter(isObj).map(function (r) {
        var o = { id: id(r.id, 'r'), name: U.cleanStr(r.name, 40) };
        fields.forEach(function (f) {
          if (f.t === 'num') o[f.k] = optNum(r[f.k], f.min || 0, f.max || 1e8);
          else if (f.t === 'date') o[f.k] = U.parseISO(r[f.k]) ? r[f.k] : null;
          else if (f.t === 'bool') o[f.k] = r[f.k] !== false;
          else if (f.t === 'str') o[f.k] = U.cleanStr(r[f.k], 20);
        });
        return o;
      });
    }
    if (Array.isArray(a.otherIncome)) out.otherIncome = rows(a.otherIncome, [{ k: 'monthly', t: 'num' }]);
    if (Array.isArray(a.bills)) out.bills = rows(a.bills, [{ k: 'amount', t: 'num' }, { k: 'due', t: 'num', min: 1, max: 31 }]);
    if (Array.isArray(a.variable)) out.variable = rows(a.variable, [{ k: 'monthly', t: 'num' }]);
    if (Array.isArray(a.annual)) out.annual = rows(a.annual, [{ k: 'amount', t: 'num' }, { k: 'month', t: 'num', min: 1, max: 12 }]);
    if (Array.isArray(a.debts)) out.debts = rows(a.debts, [{ k: 'type', t: 'str' }, { k: 'balance', t: 'num' }, { k: 'min', t: 'num' }, { k: 'apr', t: 'num', max: 100 }, { k: 'aprKnown', t: 'bool' }]);
    if (Array.isArray(a.goals)) out.goals = rows(a.goals, [{ k: 'type', t: 'str' }, { k: 'target', t: 'num' }, { k: 'date', t: 'date' }, { k: 'created', t: 'date' }, { k: 'saved0', t: 'num' }]);
    if (Array.isArray(a.pain)) out.pain = a.pain.filter(function (p) { return !!C.find(C.PAIN, p); });
    ['style', 'checkin', 'addMode', 'homeFirst'].forEach(function (k) {
      var list = { style: C.STYLES, checkin: C.CHECKIN, addMode: C.ADDMODE, homeFirst: C.HOMEFIRST }[k];
      if (typeof a[k] === 'string' && C.find(list, a[k])) out[k] = a[k];
    });
    return out;
  }

  function sanitizeTxn(t) {
    if (!isObj(t) || !U.parseISO(t.date)) return null;
    var amount = U.round2(U.num(t.amount, 0, 0, 1e7));
    if (amount <= 0) return null;
    var type = t.type === 'income' ? 'income' : 'expense';
    var okCats = type === 'income' ? INCOME_CATS : EXPENSE_CATS;
    var o = {
      id: id(t.id, 't'), date: t.date, amount: amount, type: type,
      category: okCats.indexOf(t.category) >= 0 ? t.category : (type === 'income' ? 'extra' : 'other'), note: U.cleanStr(t.note, 80)
    };
    if (typeof t.goalId === 'string' && ID_RE.test(t.goalId)) o.goalId = t.goalId;
    return o;
  }

  function sanitize(raw) {
    var s = defaultState();
    if (!isObj(raw)) return s;
    s.mode = raw.mode === 'real' ? 'real' : 'fresh'; // demo is never loaded from disk
    s.onboarded = !!raw.onboarded && s.mode === 'real';
    s.answers = sanitizeAnswers(raw.answers);
    if (isObj(raw.settings)) {
      s.settings.openingBalance = U.num(raw.settings.openingBalance, 0, -1e8, 1e8);
      s.settings.balanceSet = !!raw.settings.balanceSet;
      s.settings.minBalance = U.num(raw.settings.minBalance, 0, 0, 1e7);
      s.settings.includeGoals = raw.settings.includeGoals !== false;
      s.settings.showAll = !!raw.settings.showAll;
    }
    s.transactions = arr(raw.transactions, MAX_TXNS).map(sanitizeTxn).filter(Boolean);
    if (isObj(raw.billsPaid)) {
      Object.keys(raw.billsPaid).slice(0, 2000).forEach(function (k) {
        if (/^[A-Za-z0-9_-]{1,60}:\d{4}-\d{2}$/.test(k) && raw.billsPaid[k] === true) s.billsPaid[k] = true;
      });
    }
    s.subs = arr(raw.subs, 60).filter(isObj).map(function (x) {
      return { id: id(x.id, 's'), name: U.cleanStr(x.name, 40) || 'Subscription', amount: U.num(x.amount, 0, 0, 1e5), cycle: x.cycle === 'yearly' ? 'yearly' : 'monthly' };
    }).filter(function (x) { return x.amount > 0; });
    return s;
  }

  var lastLoadError = false;
  /* Unreadable data is never silently thrown away: a raw copy is kept under fd.v1.bak before anything can overwrite it. */
  function load() {
    lastLoadError = false;
    var raw = null;
    try {
      raw = root.localStorage && root.localStorage.getItem(KEY);
      if (!raw) return defaultState();
      if (raw.length > 8e6) throw new Error('too large');
      return sanitize(JSON.parse(raw));
    } catch (e) {
      lastLoadError = true;
      try { if (raw && !root.localStorage.getItem(BAK_KEY)) root.localStorage.setItem(BAK_KEY, raw.slice(0, 8e6)); } catch (e2) { /* ignore */ }
      return defaultState();
    }
  }
  function hasData() { try { return !!root.localStorage.getItem(KEY); } catch (e) { return false; } }
  function loadFailed() { return lastLoadError; }
  /* returns true on success; demo data is never written to disk */
  function save(state) {
    if (state.mode !== 'real') return true;
    try { root.localStorage.setItem(KEY, JSON.stringify(state)); return true; } catch (e) { return false; }
  }
  function clear() { try { root.localStorage.removeItem(KEY); root.localStorage.removeItem(BAK_KEY); } catch (e) { /* ignore */ } }

  FD.store = { KEY: KEY, defaultState: defaultState, sanitize: sanitize, sanitizeAnswers: sanitizeAnswers, sanitizeTxn: sanitizeTxn,
    load: load, save: save, clear: clear, hasData: hasData, loadFailed: loadFailed, MAX_TXNS: MAX_TXNS };
  if (typeof module !== 'undefined' && module.exports) module.exports = FD;
})(typeof window !== 'undefined' ? window : globalThis);
