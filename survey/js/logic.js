/* logic.js — pure survey logic (no DOM): ordering, toggling, validation, answer cleaning. Testable in Node. */
(function (root) {
  'use strict';
  var SV = (root.SV = root.SV || {});

  /* ---------- random order (stable per respondent via a saved seed) ---------- */
  function makeRng(seed) { // mulberry32
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function hash(str) { var h = 2166136261; for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  function shuffle(arr, rng) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(rng() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; }
    return a;
  }
  /* item ids in this respondent's order; items marked fixedLast always stay at the end */
  function orderFor(q, seed) {
    var movable = q.items.filter(function (i) { return !i.fixedLast; }).map(function (i) { return i.id; });
    var fixed = q.items.filter(function (i) { return i.fixedLast; }).map(function (i) { return i.id; });
    var ids = q.shuffle ? shuffle(movable, makeRng((seed ^ hash(q.id)) >>> 0)) : movable;
    return ids.concat(fixed);
  }

  /* ---------- tap / untap helpers ---------- */
  function toggleSingle(cur, id) { return cur === id ? null : id; }
  function togglePick(list, id, max) { // choose up to `max`; tapping a chosen one unchooses it
    var i = list.indexOf(id);
    if (i >= 0) { var c = list.slice(); c.splice(i, 1); return c; }
    return list.length >= max ? list : list.concat([id]);
  }
  function toggleMulti(list, id, exclusive) { // `exclusive` ids (e.g. "None") can't be combined with others
    var i = list.indexOf(id);
    if (i >= 0) { var c = list.slice(); c.splice(i, 1); return c; }
    if (exclusive.indexOf(id) >= 0) return [id];
    return list.filter(function (x) { return exclusive.indexOf(x) < 0; }).concat([id]);
  }
  function reorder(list, from, to) {
    if (from === to || from < 0 || to < 0 || from >= list.length || to >= list.length) return list.slice();
    var c = list.slice(), item = c.splice(from, 1)[0];
    c.splice(to, 0, item);
    return c;
  }
  /* keep the existing ranking order for items still chosen, append newly chosen ones, drop unchosen ones */
  function syncRank(prev, picks) {
    var kept = (prev || []).filter(function (id) { return picks.indexOf(id) >= 0; });
    return kept.concat(picks.filter(function (id) { return kept.indexOf(id) < 0; }));
  }

  /* ---------- text cleaning ---------- */
  // Invisible formatting characters (zero-width, direction marks, variation selectors, soft hyphen, tag characters...) are
  // DELETED, so ordinary text keeps its shape. Control, separator, private-use and unassigned characters become a space.
  // Property classes mean the lists can't go out of date. Side effect: emoji lose their emoji-style selector/joiners.
  var DELETE_CHARS = /[\p{Cf}\p{Default_Ignorable_Code_Point}]/gu;
  var SPACE_CHARS = /[\p{Cc}\p{Zl}\p{Zp}\p{Co}\p{Cn}]/gu;
  var BRAILLE_BLANK = new RegExp(String.fromCharCode(0x2800), 'g'); // invisible but in none of the classes above
  var HI = '[' + String.fromCharCode(0xD800) + '-' + String.fromCharCode(0xDBFF) + ']', LO = '[' + String.fromCharCode(0xDC00) + '-' + String.fromCharCode(0xDFFF) + ']';
  var LONE_SURROGATE = new RegExp(HI + '(?!' + LO + ')|(?<!' + HI + ')' + LO, 'g'); // half of an emoji: not valid text
  function cleanText(v, max) {
    var limit = max || 1000;
    var s = typeof v === 'string' ? v.slice(0, limit * 4 + 16) : ''; // bound the work first; real input is capped by the form anyway
    s = s.replace(LONE_SURROGATE, ' ').replace(/\r\n?/g, '\n').replace(/\t/g, ' ');
    s = s.split('\n').map(function (line) { return line.replace(DELETE_CHARS, '').replace(SPACE_CHARS, ' ').replace(BRAILLE_BLANK, ' '); }).join('\n');
    s = s.normalize('NFC').trim();                                   // normalise AFTER deleting, so cleaning twice gives the same result
    var chars = Array.from(s);                                       // cut on whole characters, never inside a surrogate pair
    return chars.length > limit ? chars.slice(0, limit).join('').replace(/\s+$/, '') : s;
  }
  /* Results opened in a spreadsheet can run text that starts with = + - @ (or a tab/return) as a formula.
     Use this on every text cell when exporting to CSV/Excel/Sheets. It is NOT applied to the stored answers. */
  function spreadsheetSafe(text) {
    var t = typeof text === 'string' ? text : '';
    return /^\s*[=+\-@]|^[\t\r\n]/.test(t) ? "'" + t : t; // also catches a formula hidden behind leading spaces or a line break
  }
  function validEmail(s) {
    if (typeof s !== 'string' || s.length > 254) return false;
    var at = s.indexOf('@');
    if (at < 1 || at !== s.lastIndexOf('@')) return false;
    var local = s.slice(0, at), domain = s.slice(at + 1);
    // first character must be a letter or digit, so an address can never start like a spreadsheet formula
    if (local.length > 64 || !/^[A-Za-z0-9][A-Za-z0-9.!#%&'+\/=?^_~-]*$/.test(local) || local.indexOf('..') >= 0 || local.charAt(local.length - 1) === '.') return false;
    return /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)*\.(?:[A-Za-z]{2,}|xn--[A-Za-z0-9]+(?:-[A-Za-z0-9]+)*)$/.test(domain);
  }

  /* ---------- which questions are shown ---------- */
  function visibleIds(questions, answers) {
    return questions.filter(function (q) {
      if (q.type !== 'rank') return true;
      var src = questions.filter(function (x) { return x.id === q.from; })[0];
      return !!src && Array.isArray(answers[src.id]) && answers[src.id].length === src.exact;
    }).map(function (q) { return q.id; });
  }

  function itemIds(q) { return q.items ? q.items.map(function (i) { return i.id; }) : []; }
  function inList(list, id) { return list.indexOf(id) >= 0; }

  /* ---------- validation ---------- */
  function validate(q, answers) {
    var a = answers[q.id], ids = itemIds(q), n;
    switch (q.type) {
      case 'grid': {
        var done = ids.filter(function (id) { return a && a[id] !== undefined; }).length;
        n = ids.length - done;
        return q.required && n > 0 ? { ok: false, msg: n === 1 ? 'One row still needs a rating.' : n + ' rows still need a rating.' } : { ok: true };
      }
      case 'pick':
        n = Array.isArray(a) ? a.length : 0;
        return q.required && n !== q.exact ? { ok: false, msg: 'Please pick exactly ' + q.exact + ' (you have ' + n + ').' } : { ok: true };
      case 'rank':
        return { ok: true };
      case 'single':
        return q.required && !inList(ids, a) ? { ok: false, msg: 'Please choose one.' } : { ok: true };
      case 'multi':
        return q.required && !(Array.isArray(a) && a.length) ? { ok: false, msg: 'Please choose at least one.' } : { ok: true };
      case 'text': {
        var t = cleanText(a, q.max || 1000);
        return q.required && t.length < 3 ? { ok: false, msg: 'Please write a few words.' } : { ok: true };
      }
      case 'contact': {
        var c = a || {};
        if (c.try === 'yes' && !validEmail(typeof c.email === 'string' ? c.email.trim() : '')) return { ok: false, msg: 'Please enter a valid email, or choose "No, thanks".' };
        return { ok: true };
      }
    }
    return { ok: true };
  }

  /* every shown question, checked again: used before sending, and reusable server-side */
  function validateAll(questions, answers) {
    var ids = visibleIds(questions, answers), problems = [];
    questions.forEach(function (q) {
      if (ids.indexOf(q.id) < 0) return;
      var v = validate(q, answers);
      if (!v.ok) problems.push({ id: q.id, msg: v.msg });
    });
    return problems;
  }

  /* ---------- final payload: whitelist every id, clean every string ---------- */
  function sanitizeAnswers(questions, answers) {
    var out = {};
    answers = answers || {};
    questions.forEach(function (q) {
      var a = answers[q.id], ids = itemIds(q), r;
      if (q.type === 'grid') {
        r = {};
        ids.forEach(function (id) {
          var v = a && Object.prototype.hasOwnProperty.call(a, id) ? a[id] : undefined;
          if (v === 'unsure' || (typeof v === 'number' && v >= 1 && v <= q.scale && Math.floor(v) === v)) r[id] = v;
        });
        if (Object.keys(r).length) out[q.id] = r;
      } else if (q.type === 'pick' || q.type === 'rank' || q.type === 'multi') {
        var allowed = q.type === 'rank' ? itemIds(questions.filter(function (x) { return x.id === q.from; })[0]) : ids;
        var seenId = Object.create(null); // a map, not indexOf: a hostile list of thousands of items stays fast
        r = Array.isArray(a) ? a.slice(0, 200).filter(function (id) { if (typeof id !== 'string' || !inList(allowed, id) || seenId[id]) return false; seenId[id] = true; return true; }) : [];
        if (q.type === 'pick') r = r.slice(0, q.exact);
        if (q.type === 'rank') {
          var src = out[q.from] || []; // compare with the CLEANED picks (questions are processed in order, so these exist already)
          r = r.length === src.length && r.every(function (id) { return src.indexOf(id) >= 0; }) ? r : [];
        }
        if (r.length) out[q.id] = r;
        if (q.type === 'multi' && q.otherText && inList(r, 'other')) {
          var ot = cleanText(answers[q.id + '_other'], 120);
          if (ot) out[q.id + '_other'] = ot;
        }
      } else if (q.type === 'single') {
        if (typeof a === 'string' && inList(ids, a)) out[q.id] = a;
      } else if (q.type === 'text') {
        var t = cleanText(a, q.max || 1000);
        if (t) out[q.id] = t;
      } else if (q.type === 'contact') {
        var c = a || {}, o = {};
        if (c.try === 'yes' || c.try === 'no') o.try = c.try;
        var em = typeof c.email === 'string' ? c.email.trim() : '';
        if (o.try === 'yes' && validEmail(em)) o.email = em;
        if (c.quote === true) o.quote = true;
        if (Object.keys(o).length) out[q.id] = o;
      }
    });
    return out;
  }

  /* ---------- flat form fields (what the form service stores: one column per answer) ---------- */
  // Every field name this survey can ever send. The page's hidden form must declare exactly these (a test checks it),
  // because the form service rejects fields it wasn't told about.
  function fieldNames(questions) {
    var names = ['response_id', 'bot-field'];
    questions.forEach(function (q) {
      if (q.type === 'grid') q.items.forEach(function (i) { names.push(q.id + '_' + i.id); });
      else if (q.type === 'contact') { names.push(q.id + '_try'); names.push(q.id + '_quote'); }
      else { names.push(q.id); if (q.type === 'multi' && q.otherText) names.push(q.id + '_other'); }
    });
    return names;
  }
  /* The cleaned payload as flat text fields. The email is NOT in here: it goes in a separate submission (toContactFields)
     so the answers stay anonymous. A list becomes "a,b,c" in the respondent's order (so q3 is their ranking). */
  function toFields(questions, payload) {
    var a = (payload && payload.answers) || {}, f = { 'form-name': 'survey', 'bot-field': '', response_id: String(payload && payload.meta && payload.meta.id || '') };
    questions.forEach(function (q) {
      var v = a[q.id];
      if (q.type === 'grid') { if (v) q.items.forEach(function (i) { if (v[i.id] !== undefined) f[q.id + '_' + i.id] = String(v[i.id]); }); }
      else if (q.type === 'contact') { if (v) { if (v.try) f[q.id + '_try'] = v.try; if (v.quote) f[q.id + '_quote'] = 'yes'; } }
      else if (Array.isArray(v)) { f[q.id] = v.join(','); if (q.otherText && a[q.id + '_other']) f[q.id + '_other'] = a[q.id + '_other']; }
      else if (typeof v === 'string') f[q.id] = v;
    });
    return f;
  }
  function toContactFields(payload) {
    var c = payload && payload.answers && payload.answers.q15;
    return c && c.try === 'yes' && c.email ? { 'form-name': 'survey-contact', 'bot-field': '', email: c.email } : null;
  }

  /* progress through the questions that are actually shown */
  function position(questions, answers, qid) {
    var ids = visibleIds(questions, answers);
    // A ranking screen that is hidden only because its (required) source question isn't answered yet WILL appear,
    // so it counts toward the total from the start and the progress counter never changes under the respondent.
    var pending = questions.filter(function (q) {
      if (q.type !== 'rank' || ids.indexOf(q.id) >= 0) return false;
      var src = questions.filter(function (x) { return x.id === q.from; })[0];
      return !!src && src.required;
    }).length;
    return { index: ids.indexOf(qid), total: ids.length + pending, ids: ids };
  }

  SV.logic = { makeRng: makeRng, shuffle: shuffle, orderFor: orderFor, toggleSingle: toggleSingle, togglePick: togglePick,
    toggleMulti: toggleMulti, reorder: reorder, syncRank: syncRank, cleanText: cleanText, validEmail: validEmail,
    visibleIds: visibleIds, validate: validate, validateAll: validateAll, sanitizeAnswers: sanitizeAnswers, position: position,
    spreadsheetSafe: spreadsheetSafe, fieldNames: fieldNames, toFields: toFields, toContactFields: toContactFields };
  if (typeof module !== 'undefined' && module.exports) module.exports = SV;
})(typeof window !== 'undefined' ? window : globalThis);
