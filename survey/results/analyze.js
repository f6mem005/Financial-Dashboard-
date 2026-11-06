/* analyze.js - turns survey submissions into the numbers you need. Pure logic, no DOM, runs in the browser page and in Node.
   Input: rows exported from the form service (CSV or JSON). Output: per-feature scores, answer distributions, open text.
   The export is UNTRUSTED (anyone can submit the public form): only known columns are read, everything is re-validated. */
(function (root) {
  'use strict';
  var SV = (root.SV = root.SV || {});
  var L = SV.logic, Q = SV.questions, F = SV.features;
  var MAX_CHARS = 5000000, MAX_ROWS = 50000, MAX_COLS = 300, MAX_LIST = 50;
  var BOM = new RegExp('^' + String.fromCharCode(0xFEFF)); // a spreadsheet may put an invisible marker at the start of a CSV

  // The only columns that are ever read (maps without a prototype, so a column called "__proto__" is just a name).
  var FIELD = Object.create(null); L.fieldNames(Q).forEach(function (n) { if (n !== 'bot-field') FIELD[n] = true; });
  var STAMP = Object.create(null); ['created_at', 'created at', 'created', 'date', 'submission date', 'submitted_at', 'submitted at', 'submitted'].forEach(function (n) { STAMP[n] = true; });
  var FIELD_LC = Object.create(null); Object.keys(FIELD).forEach(function (n) { FIELD_LC[n.toLowerCase()] = n; }); // headers are matched ignoring upper/lower case

  /* ---------- reading the export ---------- */
  function detectDelimiter(text) { // comma, semicolon (European spreadsheets) or tab: the one that splits the first line into the most survey column names
    var line = text.split(/\r?\n/, 1)[0] || '', best = ',', bestScore = -1;
    [',', ';', '\t'].forEach(function (d) {
      var parts = line.split(d), score = parts.filter(function (h) { return FIELD_LC[h.trim().replace(/^"|"$/g, '').toLowerCase()]; }).length * 1000 + (parts.length - 1);
      if (score > bestScore) { bestScore = score; best = d; }
    });
    return best;
  }
  function parseCsv(text, delim) { // RFC-4180 style: quotes, doubled quotes, line breaks inside quotes, CRLF, BOM
    if (typeof text !== 'string') throw new Error('That is not a text file.');
    if (text.length > MAX_CHARS) throw new Error('That file is too big (limit about 5 MB).');
    text = text.replace(BOM, '');
    delim = delim || detectDelimiter(text);
    var rows = [], row = [], field = '', q = false;
    function endRow() { row.push(field); field = ''; if (row.length > 1 || row[0] !== '') rows.push(row); row = []; if (rows.length > MAX_ROWS + 1) throw new Error('Too many rows (limit ' + MAX_ROWS + ').'); }
    for (var i = 0; i < text.length; i++) {
      var c = text[i];
      if (q) { if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else q = false; } else field += c; }
      else if (c === '"') q = true;
      else if (c === delim) { row.push(field); field = ''; }
      else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; endRow(); }
      else field += c;
    }
    if (q) throw new Error('The file has an unclosed quote, so some rows could not be read. Re-export it and try again.');
    endRow();
    return rows;
  }
  /* Keep ONLY the columns the survey uses (plus one timestamp). A header with thousands of invented columns can't use up memory. */
  function readTable(rows) {
    if (!rows.length) return { rows: [], recognised: 0 };
    var head = rows[0];
    if (head.length > MAX_COLS) throw new Error('That file has too many columns (limit ' + MAX_COLS + '). Is it the right export?');
    var map = [], stamps = 0, recognised = 0;
    head.forEach(function (h, i) {
      h = h.trim();
      if (FIELD_LC[h.toLowerCase()]) { map.push([i, FIELD_LC[h.toLowerCase()]]); recognised++; }
      else if (stamps < 4 && STAMP[h.toLowerCase()]) { map.push([i, 'created_at']); stamps++; } // up to four timestamp-like columns; each row uses the first one it can read
    });
    var one = head.length === 1;
    var out = rows.slice(1).map(function (r) {
      if (one && r.length > 1) r = [r.join(',')];
      var o = Object.create(null);
      map.forEach(function (m) {
        var v = r[m[0]] === undefined ? '' : r[m[0]].trim(), k = m[1];
        if (k === 'created_at') { if (o[k] === undefined || (parseWhen(o[k]) === null && parseWhen(v) !== null)) o[k] = v; } // the first timestamp column this row can actually read
        else if (o[k] === undefined || (o[k] === '' && v !== '')) o[k] = v; // a repeated column name: the first non-empty value wins
      });
      return o;
    });
    return { rows: out, recognised: recognised };
  }
  /* accepts: CSV text, a JSON array of flat rows, a JSON array of {data:{...}} (the form service's API shape), or {submissions:[...]} */
  function readExportInfo(text) {
    if (typeof text !== 'string') throw new Error('That is not a text file.');
    var t = text.replace(BOM, '').trim();
    if (!t) throw new Error('The file is empty.');
    if (t[0] === '[' || t[0] === '{') {
      var j;
      try { j = JSON.parse(t); } catch (e) { throw new Error('That looks like JSON but could not be read.'); }
      var list = Array.isArray(j) ? j : (j && Array.isArray(j.submissions) ? j.submissions : null);
      if (!list) throw new Error('Could not find a list of submissions in that JSON.');
      if (list.length > MAX_ROWS) throw new Error('Too many rows (limit ' + MAX_ROWS + ').');
      var seen = Object.create(null);
      var rows = list.map(function (s) {
        var d = s && typeof s === 'object' && s.data && typeof s.data === 'object' ? s.data : s, o = Object.create(null);
        if (d && typeof d === 'object') {
          Object.keys(d).forEach(function (k) {
            var v = d[k];
            if (FIELD[k] && (typeof v === 'string' || typeof v === 'number')) { o[k] = String(v).trim(); seen[k] = true; }
            else if (STAMP[k.toLowerCase()] && (typeof v === 'string' || typeof v === 'number')) { var sv = String(v).trim(); if (o.created_at === undefined || (parseWhen(o.created_at) === null && parseWhen(sv) !== null)) o.created_at = sv; } // the first one that can be read
          });
        }
        if (s && typeof s === 'object' && (typeof s.created_at === 'string' || typeof s.created_at === 'number')) { var top = String(s.created_at).trim(); if (parseWhen(top) !== null || o.created_at === undefined || parseWhen(o.created_at) === null) o.created_at = top; } // the service's own timestamp wins, unless it is unreadable and another one is not
        return o;
      });
      return { rows: rows, recognised: Object.keys(seen).length };
    }
    return readTable(parseCsv(t));
  }
  function readExport(text) { return readExportInfo(text).rows; }

  /* ---------- one flat row -> cleaned answers (same shape the survey produces) ---------- */
  function list(v) { return typeof v === 'string' && v ? v.split(',', MAX_LIST).map(function (x) { return x.trim(); }).filter(Boolean) : undefined; }
  function parseWhen(v) { // only unambiguous timestamps: ISO 8601 with a zone, or a 10/13-digit epoch. Anything else = unknown.
    if (typeof v !== 'string') return null;
    v = v.trim();
    if (/^\d{13}$/.test(v)) return Number(v);
    if (/^\d{10}$/.test(v)) return Number(v) * 1000;
    var m = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?)\s?(Z|UTC|[+-]\d{2}:?\d{2})$/.exec(v);
    if (!m) return null;
    var z = m[3] === 'Z' || m[3] === 'UTC' ? 'Z' : (m[3].length === 5 ? m[3].slice(0, 3) + ':' + m[3].slice(3) : m[3]), t = Date.parse(m[1] + 'T' + m[2] + z);
    return isNaN(t) ? null : t;
  }
  function fromFlat(row) {
    var a = {};
    Q.forEach(function (q) {
      if (q.type === 'grid') {
        var g = {};
        q.items.forEach(function (i) { var v = row[q.id + '_' + i.id]; if (v === 'unsure') g[i.id] = 'unsure'; else if (typeof v === 'string' && /^[1-9]$/.test(v)) g[i.id] = Number(v); });
        if (Object.keys(g).length) a[q.id] = g;
      } else if (q.type === 'pick' || q.type === 'rank' || q.type === 'multi') {
        var l = list(row[q.id]); if (l) a[q.id] = l;
        if (q.otherText && row[q.id + '_other']) a[q.id + '_other'] = row[q.id + '_other'];
      } else if (q.type === 'single' || q.type === 'text') { if (typeof row[q.id] === 'string' && row[q.id]) a[q.id] = row[q.id]; }
      else if (q.type === 'contact') {
        var c = {}; if (row[q.id + '_try'] === 'yes' || row[q.id + '_try'] === 'no') c.try = row[q.id + '_try']; if (row[q.id + '_quote'] === 'yes') c.quote = true;
        if (Object.keys(c).length) a[q.id] = c;
      }
    });
    // response ids are random browser-made ids; anything else (too long, odd characters) is treated as "no id"
    return { id: typeof row.response_id === 'string' && /^[A-Za-z0-9_-]{8,64}$/.test(row.response_id) ? row.response_id : null, createdAt: parseWhen(row.created_at), answers: L.sanitizeAnswers(Q, a) };
  }

  /* One person may appear twice (a retry after a slow connection reuses the same response id): keep the earliest copy,
     and say so when the copies disagree. Rows with no readable answers are skipped. */
  function prepare(rows) {
    var all = rows.map(fromFlat).filter(function (r) { return Object.keys(r.answers).length > 0; });
    var empty = rows.length - all.length;
    var sorted = all.map(function (r, i) { return { r: r, i: i, k: r.createdAt === null ? Infinity : r.createdAt }; }).sort(function (x, y) {
      if (x.k !== y.k) return x.k < y.k ? -1 : 1; return x.i - y.i; // unknown times go last, then file order
    }).map(function (x) { return x.r; });
    var first = Object.create(null), when = Object.create(null), kept = [], dupes = 0, conflicts = 0, undated = 0;
    sorted.forEach(function (r) {
      var sig = JSON.stringify(r.answers);
      if (r.id) {
        if (first[r.id] !== undefined) { dupes++; if (first[r.id] !== sig) conflicts++; if (r.createdAt === null || when[r.id] === null) undated++; return; }
        first[r.id] = sig; when[r.id] = r.createdAt;
      }
      r.sig = sig; kept.push(r);
    });
    var freq = Object.create(null), identical = 0;
    kept.forEach(function (r) { freq[r.sig] = (freq[r.sig] || 0) + 1; });
    Object.keys(freq).forEach(function (k) { if (freq[k] > 1) identical += freq[k] - 1; });
    kept.forEach(function (r) { delete r.sig; });
    return { responses: kept, duplicatesRemoved: dupes, emptyRows: empty, conflicts: conflicts, undatedDupes: undated, identical: kept.length >= 5 ? identical : 0 };
  }

  /* ---------- the numbers ---------- */
  function pct(a, b) { return b > 0 ? (a / b) * 100 : null; }
  function aggregate(responses) {
    var n = responses.length, byId = Object.create(null);
    var feats = F.map(function (f) { var o = { id: f.id, label: f.label, desc: f.desc, counts: [0, 0, 0, 0, 0], unsure: 0, picked: 0, rankPoints: 0, rank1: 0, never: 0 }; byId[f.id] = o; return o; });
    var base = { q1: 0, q2: 0, q3: 0, q4: 0 };
    var out = { n: n, smallSample: n < 30, features: null, order: null, questions: {}, texts: { q12: [], q13: [], q14: [], q16: [], q11_other: [] }, contact: { tryYes: 0, tryNo: 0, quote: 0 } };
    responses.forEach(function (r) {
      var a = r.answers;
      if (a.q1) { base.q1++; F.forEach(function (f) { var v = a.q1[f.id], o = byId[f.id]; if (v === 'unsure') o.unsure++; else if (typeof v === 'number') o.counts[v - 1]++; }); }
      if (a.q2) { base.q2++; a.q2.forEach(function (id) { if (byId[id]) byId[id].picked++; }); }
      if (a.q3) { base.q3++; a.q3.forEach(function (id, i) { if (byId[id]) { byId[id].rankPoints += 3 - i; if (i === 0) byId[id].rank1++; } }); }
      if (a.q4) { base.q4++; if (byId[a.q4]) byId[a.q4].never++; }
      Object.keys(out.texts).forEach(function (k) { if (typeof a[k] === 'string' && a[k]) out.texts[k].push(a[k]); });
      if (a.q15) { if (a.q15.try === 'yes') out.contact.tryYes++; if (a.q15.try === 'no') out.contact.tryNo++; if (a.q15.quote) out.contact.quote++; }
    });
    out.base = base;
    out.features = feats.map(function (o) {
      var rated = o.counts.reduce(function (s, c) { return s + c; }, 0), sum = o.counts.reduce(function (s, c, i) { return s + c * (i + 1); }, 0);
      return { id: o.id, label: o.label, desc: o.desc, counts: o.counts, rated: rated, unsure: o.unsure, top2: o.counts[3] + o.counts[4],
        top2Pct: pct(o.counts[3] + o.counts[4], rated), mean: rated ? sum / rated : null, unsurePct: pct(o.unsure, rated + o.unsure),
        picked: o.picked, pickedPct: pct(o.picked, base.q2), rankPoints: o.rankPoints, rank1: o.rank1, never: o.never, neverPct: pct(o.never, base.q4) };
    });
    out.order = out.features.slice().sort(function (x, y) {
      return (y.rankPoints - x.rankPoints) || ((y.top2Pct || 0) - (x.top2Pct || 0)) || (x.label < y.label ? -1 : 1);
    }).map(function (f) { return f.id; });
    Q.forEach(function (q) {
      if (q.type !== 'single' && q.type !== 'multi') return;
      var answered = 0, counts = Object.create(null);
      responses.forEach(function (r) {
        var v = r.answers[q.id]; if (v === undefined) return; answered++;
        (Array.isArray(v) ? v : [v]).forEach(function (id) { counts[id] = (counts[id] || 0) + 1; });
      });
      out.questions[q.id] = { id: q.id, title: q.title, type: q.type, answered: answered,
        options: q.items.map(function (i) { return { id: i.id, label: i.label, count: counts[i.id] || 0, pct: pct(counts[i.id] || 0, answered) }; }) };
    });
    return out;
  }

  /* Percentages are out of the people who answered each question. Say what those bases are, and flag thin ones. */
  function basesLine(stats) {
    var b = stats.base, parts = [['ratings', b.q1], ['top-3 picks', b.q2], ['ranking', b.q3], ['"never use"', b.q4]];
    var thin = parts.filter(function (p) { return p[1] > 0 && p[1] < 30; }).map(function (p) { return p[0]; });
    return 'People who answered: ' + parts.map(function (p) { return p[0] + ' ' + p[1]; }).join(', ') + '.' + (thin.length && stats.n >= 30 ? ' Under 30 for ' + thin.join(' and ') + ': treat those percentages as hints.' : '');
  }

  /* ---------- reports and exports ---------- */
  function f1(x) { return x === null ? 'n/a' : (Math.round(x * 10) / 10).toFixed(1); }
  function p0(x) { return x === null ? 'n/a' : Math.round(x) + '%'; }
  // Answers are other people's text. Escape Markdown so a viewer that renders it can't show images, links, headings or HTML from them.
  function mdText(t) {
    return String(t).replace(/\r\n|\r|\n/g, ' ').replace(/[\\`*_\[\]()<>!#~&|@]/g, '\\$&').replace(/^([-+>])/, '\\$1')
      .replace(/\b(https?|ftp):/gi, '$1\\:').replace(/\bwww\./gi, 'www\\.'); // no clickable links or addresses from other people's text
  }
  function toMarkdown(stats, info) {
    info = info || {};
    var o = ['# Survey results', '', '**' + stats.n + ' responses**' + (info.duplicatesRemoved ? ' (' + info.duplicatesRemoved + ' duplicate' + (info.duplicatesRemoved === 1 ? '' : 's') + ' removed)' : '') + '.'];
    if (stats.smallSample) o.push('', '> Small sample (under 30). Treat percentages as hints, not findings.');
    (info.warnings || []).forEach(function (w) { o.push('', '> ' + mdText(w)); });
    o.push('', basesLine(stats), '', '## What matters most (ordered by home-screen votes)', '',
      'Votes = 3 points for a respondent\'s #1 choice, 2 for #2, 1 for #3. Rated 4-5 = share rating it 4 or 5 of those who rated it.', '',
      '| # | Feature | Votes | #1 picks | Chose in top 3 | Rated 4-5 | Rated by | Avg (1-5) | Not sure | Would never use |', '|---|---|---|---|---|---|---|---|---|---|');
    var byId = Object.create(null); stats.features.forEach(function (f) { byId[f.id] = f; });
    stats.order.forEach(function (id, i) {
      var f = byId[id];
      o.push('| ' + (i + 1) + ' | ' + mdText(f.label) + ' | ' + f.rankPoints + ' | ' + f.rank1 + ' | ' + p0(f.pickedPct) + ' | ' + p0(f.top2Pct) + ' | ' + f.rated + ' | ' + f1(f.mean) + ' | ' + p0(f.unsurePct) + ' | ' + p0(f.neverPct) + ' |');
    });
    Object.keys(stats.questions).forEach(function (k) {
      var qq = stats.questions[k]; o.push('', '## ' + mdText(qq.title), '', '_' + qq.answered + ' answered_', '');
      qq.options.forEach(function (op) { o.push('- ' + mdText(op.label) + ': ' + op.count + ' (' + p0(op.pct) + ')'); });
    });
    o.push('', '## Early-version interest', '', '- Said yes: ' + stats.contact.tryYes + ', said no: ' + stats.contact.tryNo + '. Emails are in the separate "survey-contact" form.', '- OK to quote anonymously: ' + stats.contact.quote);
    [['q12', 'The ONE thing they wish a dashboard would tell them'], ['q13', 'Missing features and ideas'], ['q14', 'Apps they loved or hated'], ['q16', 'Anything else they wanted to say'], ['q11_other', 'Other reasons they would stop using an app']].forEach(function (p) {
      var t = stats.texts[p[0]]; o.push('', '## ' + p[1] + ' (' + t.length + ')', ''); t.forEach(function (x) { o.push('- ' + mdText(x)); });
    });
    return o.join('\n') + '\n';
  }
  function csvCell(v) { var s = L.spreadsheetSafe(String(v === null || v === undefined ? '' : v)); return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }
  function csvLine(cells) { return cells.map(csvCell).join(','); }
  function r1(x) { return x === null ? '' : Math.round(x * 10) / 10; }
  function featuresCsv(stats) {
    var byId = Object.create(null); stats.features.forEach(function (f) { byId[f.id] = f; });
    var lines = [csvLine(['rank', 'feature', 'home_screen_votes', 'number_one_picks', 'chose_in_top3_pct', 'rated_4_or_5_pct', 'average_1_to_5', 'not_sure_pct', 'would_never_use_pct', 'rated_by'])];
    stats.order.forEach(function (id, i) {
      var f = byId[id];
      lines.push(csvLine([i + 1, f.label, f.rankPoints, f.rank1, r1(f.pickedPct), r1(f.top2Pct), r1(f.mean), r1(f.unsurePct), r1(f.neverPct), f.rated]));
    });
    return lines.join('\n') + '\n';
  }
  function responsesCsv(responses) {
    var names = L.fieldNames(Q).filter(function (n) { return n !== 'bot-field' && n !== 'response_id'; });
    var lines = [csvLine(['response_id'].concat(names))];
    responses.forEach(function (r) {
      var flat = L.toFields(Q, { answers: r.answers, meta: { id: r.id || '' } });
      lines.push(csvLine([flat.response_id].concat(names.map(function (n) { return flat[n] === undefined ? '' : flat[n]; }))));
    });
    return lines.join('\n') + '\n';
  }
  // Excel on Windows (and often Mac) shows non-English text as garbage in a CSV unless it starts with an invisible marker.
  function excelCsv(text) { return String.fromCharCode(0xFEFF) + text; }

  function analyze(text) {
    var ex = readExportInfo(text), p = prepare(ex.rows), stats = aggregate(p.responses), w = [];
    if (ex.rows.length > 0 && ex.recognised === 0) w.push('None of the columns look like survey answers. Check this is the export of the "survey" form (not "survey-contact") and that it is the whole file.');
    else if (p.emptyRows > 0) w.push(p.emptyRows + ' of ' + ex.rows.length + ' rows had no readable survey answers and were skipped.');
    if (p.undatedDupes > 0) w.push('For ' + p.undatedDupes + ' repeated send' + (p.undatedDupes === 1 ? '' : 's') + ' the time could not be read, so the copy with a readable time was kept, or if none had one, the first copy listed in the file. That may not be the earliest copy.');
    if (p.conflicts > 0) w.push(p.conflicts + ' repeated send' + (p.conflicts === 1 ? '' : 's') + ' had DIFFERENT answers from the first copy. ' + (p.undatedDupes > 0 ? 'The copy with a readable time, or else the first one listed, was kept.' : 'The earliest copy was kept.'));
    if (p.identical > 0) w.push(p.identical + ' response' + (p.identical === 1 ? '' : 's') + ' have answers identical to another response. A script filling in the form can cause this; look at them before trusting the totals.');
    return { stats: stats, responses: p.responses, info: { duplicatesRemoved: p.duplicatesRemoved, emptyRows: p.emptyRows, rows: ex.rows.length, conflicts: p.conflicts, identical: p.identical, recognisedColumns: ex.recognised, undatedDupes: p.undatedDupes, warnings: w } };
  }

  SV.analyze = { parseCsv: parseCsv, readExport: readExport, readExportInfo: readExportInfo, fromFlat: fromFlat, prepare: prepare, aggregate: aggregate, toMarkdown: toMarkdown,
    featuresCsv: featuresCsv, responsesCsv: responsesCsv, excelCsv: excelCsv, basesLine: basesLine, analyze: analyze, csvCell: csvCell };
  if (typeof module !== 'undefined' && module.exports) module.exports = SV;
})(typeof window !== 'undefined' ? window : globalThis);
