/* csv.js — bank CSV parsing and mapping. Hard limits on size/rows; output goes through store.sanitizeTxn. */
(function (root) {
  'use strict';
  var FD = (root.FD = root.FD || {});
  var U = FD.util;
  var MAX_CHARS = 2000000, MAX_ROWS = 5000;

  function detectDelimiter(line) {
    var best = ',', bestN = 0;
    [',', ';', '\t'].forEach(function (d) { var n = line.split(d).length; if (n > bestN) { bestN = n; best = d; } });
    return best;
  }

  /* RFC-4180-style parser: quoted fields, escaped quotes, CRLF/LF, embedded newlines. */
  function parse(text) {
    if (typeof text !== 'string') throw new Error('Not a text file.');
    if (text.length > MAX_CHARS) throw new Error('That file is too big (limit about 2 MB).');
    text = text.replace(/^﻿/, '');
    var delim = detectDelimiter(text.split(/\r?\n/, 1)[0] || '');
    var rows = [], row = [], field = '', q = false;
    for (var i = 0; i < text.length; i++) {
      var c = text[i];
      if (q) {
        if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else q = false; } else field += c;
      } else if (c === '"') q = true;
      else if (c === delim) { row.push(field); field = ''; }
      else if (c === '\n' || c === '\r') {
        if (c === '\r' && text[i + 1] === '\n') i++;
        row.push(field); field = '';
        if (row.length > 1 || row[0] !== '') rows.push(row);
        row = [];
        if (rows.length > MAX_ROWS + 1) throw new Error('Too many rows (limit ' + MAX_ROWS + ').');
      } else field += c;
    }
    row.push(field);
    if (row.length > 1 || row[0] !== '') rows.push(row);
    if (rows.length > MAX_ROWS + 1) throw new Error('Too many rows (limit ' + MAX_ROWS + ').');
    return rows;
  }

  function findCol(header, names, exclude) {
    var i, j, h;
    for (i = 0; i < header.length; i++) { // exact header names win over looser substring matches
      h = header[i].toLowerCase().trim();
      if (exclude && exclude.test(h)) continue;
      for (j = 0; j < names.length; j++) if (h === names[j]) return i;
    }
    for (i = 0; i < header.length; i++) {
      h = header[i].toLowerCase().trim();
      if (exclude && exclude.test(h)) continue;
      for (j = 0; j < names.length; j++) if (h.indexOf(names[j]) >= 0) return i;
    }
    return -1;
  }
  function findExact(header, names) {
    for (var i = 0; i < header.length; i++) if (names.indexOf(header[i].toLowerCase().trim()) >= 0) return i;
    return -1;
  }

  /* Strict: anything we can't read unambiguously returns null (row is counted as skipped, never guessed). */
  function parseAmount(s) {
    s = String(s == null ? '' : s);
    if (s.length > 40) return null; // real amounts are short; also keeps every regex below linear on hostile input
    s = s.replace(/[\u2212\u2013\u2012]/g, '-').replace(/[$\u20ac\u00a3\s]/g, '').replace(/^\+/, '');
    if (!s) return null;
    var neg = /^\(.*\)$/.test(s) || /^-/.test(s) || /-$/.test(s);
    var core = s;
    while (core.length && (core[0] === '(' || core[0] === '-')) core = core.slice(1);
    while (core.length && (core[core.length - 1] === ')' || core[core.length - 1] === '-')) core = core.slice(0, -1);
    if (/^\d{1,3}(\.\d{3})*,\d{1,2}$/.test(core) || /^\d+,\d{1,2}$/.test(core)) core = core.replace(/\./g, '').replace(',', '.');
    else if (/^[1-9]\d{0,2}\.\d{3}$/.test(core)) return null; // '1.234' could be 1,234 or 1.234: never guess with money
    else if (/^[1-9]\d{0,2}(\.\d{3}){2,}$/.test(core)) core = core.replace(/\./g, ''); // 1.234.567 can only be thousands
    else core = core.replace(/,/g, '');
    if (!/^(\d+(\.\d+)?|\.\d+)$/.test(core)) return null;
    var n = parseFloat(core);
    if (!isFinite(n) || n > 1e7) return null;
    return neg ? -n : n;
  }

  function parseDate(s, fmt) {
    s = String(s || '').trim();
    var m;
    if ((m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s))) return mk(+m[1], +m[2], +m[3]);
    if ((m = /^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})/.exec(s))) {
      var a = +m[1], b = +m[2], y = +m[3];
      if (y < 100) y += 2000;
      return fmt === 'dmy' ? mk(y, b, a) : mk(y, a, b);
    }
    return null;
    function mk(y, mo, d) { var dt = new Date(y, mo - 1, d); return dt.getFullYear() === y && dt.getMonth() === mo - 1 && dt.getDate() === d ? U.iso(dt) : null; }
  }

  var RULES = [
    // housing first: specific phrases beat loose words below (a mortgage servicer called Shellpoint is not gas, Tacoma HVAC is not tacos)
    [/mortgage|home loan|home lending/i, 'mortgage'],
    [/\bhoa\s*(dues|fees?|assess\w*|pmt|payment)|\bhoa\s*$|homeowners? assoc|association dues|condo (fee|dues)|property owners assoc/i, 'hoa'],   // 'Hoa' alone is also a common name (Hoa Binh Market), so it needs dues-style words or to end the line
    [/property tax|county tax|tax collector/i, 'proptax'],
    [/homeowners? ins|home insurance|hazard ins|renters? insurance|property owners ins/i, 'homeins'],
    [/home depot|\blowe.?s\b|ace hardware|plumb|roofing|hvac|handyman/i, 'homerepair'],
    [/uber eats|doordash|grubhub|chipotle|mcdonald|starbucks|restaurant|\bcafe\b|coffee|pizza|taco|burger|dunkin/i, 'dining'],
    [/kroger|safeway|whole foods|trader joe|aldi|walmart grocery|grocery|publix|costco|\bmarket\b/i, 'groceries'],
    [/shell|chevron|exxon|bp |gas station|metro|transit|uber|lyft|parking/i, 'transport'],
    [/netflix|spotify|hulu|disney|apple\.com\/bill|youtube|prime video|subscription/i, 'subs'],
    [/amazon|target|walmart|etsy|best buy|ebay/i, 'shopping'],
    [/steam|playstation|xbox|nintendo/i, 'gaming'],
    [/petco|petsmart|\bvet\b/i, 'pets'],
    [/\brent\b|landlord|property mgmt/i, 'rent'],
    [/geico|state farm|progressive|allstate|auto insurance|car insurance/i, 'carins'],
    [/navient|nelnet|sallie mae|student loan|loan payment|\bloan\b/i, 'debt'],
    [/verizon|t-mobile|at&t|mint mobile/i, 'phone'],
    [/comcast|xfinity|spectrum/i, 'internet'],
    [/electric|water util|power co|pg&e|con ed/i, 'utilities'],
    [/planet fitness|gym|ymca/i, 'gym']
  ];
  function categorize(desc) {
    for (var i = 0; i < RULES.length; i++) if (RULES[i][0].test(desc)) return RULES[i][1];
    return 'other';
  }

  /* opts: {dateFormat:'mdy'|'dmy', spendingPositive:bool, existing:[txns]} */
  function toTransactions(rows, opts) {
    opts = opts || {};
    if (rows.length < 2) throw new Error('No transactions found in that file.');
    var header = rows[0];
    var cDate = findCol(header, ['transaction date', 'posted', 'date']);
    var cDesc = findCol(header, ['description', 'memo', 'payee', 'merchant', 'name', 'details']);
    var cAmt = findCol(header, ['amount'], /debit|credit|withdraw|deposit/);
    var cDebit = findCol(header, ['debit', 'withdrawal']);
    var cCredit = findCol(header, ['credit', 'deposit']);
    if (cDebit >= 0 && cDebit === cCredit) { if (cAmt < 0) cAmt = cDebit; cDebit = -1; cCredit = -1; } // one signed 'Debit/Credit' column
    var cInd = cAmt >= 0 ? findExact(header, ['debit/credit', 'credit/debit', 'dr/cr', 'cr/dr', 'transaction type', 'type']) : -1;
    if (cInd === cAmt) cInd = -1;
    if (cDate < 0 || (cAmt < 0 && cDebit < 0 && cCredit < 0)) {
      throw new Error('Couldn’t find a Date column and an Amount column. Check the first row of your file has headers.');
    }
    // Duplicates are matched against what is already stored, one-for-one, so two identical same-day purchases in one file both import.
    var seen = Object.create(null);
    (opts.existing || []).forEach(function (t) { var k = t.date + '|' + t.amount + '|' + t.type + '|' + t.note; seen[k] = (seen[k] || 0) + 1; });
    var out = [], skipped = 0, dupes = 0;
    for (var i = 1; i < rows.length; i++) {
      var r = rows[i];
      var date = parseDate(r[cDate], opts.dateFormat);
      var amt;
      if (cAmt >= 0) {
        amt = parseAmount(r[cAmt]);
        var ind = cInd >= 0 ? String(r[cInd] || '').trim().toLowerCase() : '';
        if (amt !== null && /^(dr|debit|withdrawal)s?$/.test(ind)) amt = -Math.abs(amt);       // an explicit indicator column wins
        else if (amt !== null && /^(cr|credit|deposit)s?$/.test(ind)) amt = Math.abs(amt);
        else if (amt !== null && opts.spendingPositive) amt = -amt;
      } else {
        var dr = parseAmount(r[cDebit]), cr = parseAmount(r[cCredit]);
        amt = dr && cr ? null : cr ? Math.abs(cr) : dr ? -Math.abs(dr) : null;                // both filled is ambiguous: skip the row
      }
      if (!date || amt === null || amt === 0) { skipped++; continue; }
      var note = U.cleanStr(cDesc >= 0 ? r[cDesc] : '', 80);
      var t = FD.store.sanitizeTxn({
        id: U.uid('t'), date: date, type: amt > 0 ? 'income' : 'expense', amount: Math.abs(amt),
        category: amt > 0 ? (/payroll|direct dep|salary|paycheck/i.test(note) ? 'pay' : 'extra') : categorize(note), note: note
      });
      if (!t) { skipped++; continue; }
      var k = t.date + '|' + t.amount + '|' + t.type + '|' + t.note;
      if (seen[k] > 0) { seen[k]--; dupes++; continue; }
      out.push(t);
    }
    return { txns: out, skipped: skipped, dupes: dupes };
  }

  FD.csv = { parse: parse, toTransactions: toTransactions, parseAmount: parseAmount, parseDate: parseDate, categorize: categorize, MAX_ROWS: MAX_ROWS };
  if (typeof module !== 'undefined' && module.exports) module.exports = FD;
})(typeof window !== 'undefined' ? window : globalThis);
