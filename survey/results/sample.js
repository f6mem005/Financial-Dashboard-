/* sample.js - FAKE responses so you can see what the results page looks like before any real answers exist.
   They are made up by a random-number recipe and are clearly labelled as fake on the page. Nothing here is real data. */
(function (root) {
  'use strict';
  var SV = (root.SV = root.SV || {});
  function rng(seed) { var a = seed >>> 0; return function () { a = (a + 0x6D2B79F5) | 0; var t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  var WEIGHT = { safe: 0.9, where: 0.8, bills: 0.75, alerts: 0.6, goals: 0.55, forecast: 0.5, leaks: 0.5, subs: 0.45, debt: 0.4, whatif: 0.35, yearly: 0.35, terms: 0.3, lowmonth: 0.25, invest: 0.25, shared: 0.2 };
  var WISH = ['Tell me if I can afford to go out this weekend (sample)', 'How much can I spend before payday (sample)', 'Whether my rent is going to put me at zero (sample)', 'Which subscription I should cancel (sample)',
    'If I am on track for my trip (sample)', 'Where all my money went (sample)', 'When I will be out of debt (sample)'];
  var IDEAS = ['A way to split bills with my roommate (sample)', 'Let me add cash spending quickly (sample)', 'Dark mode please (sample)', 'Explain what the numbers mean (sample)'];
  var MORE = ['Thanks for asking, I would use this (sample)', 'Please keep it simple (sample)', 'Can I use it offline? (sample)'];
  var APPS = ['Liked one with simple charts, hated the ads (sample)', 'Too much typing, I quit after a week (sample)', 'Loved the weekly summary email (sample)'];
  function pick(r, list) { return list[Math.floor(r() * list.length)]; }
  SV.sampleRows = function (count) {
    var r = rng(20260101), ids = SV.features.map(function (f) { return f.id; }), rows = [], base = Date.UTC(2026, 0, 5, 9);
    function scored() { return ids.map(function (id) { return { id: id, s: WEIGHT[id] + (r() - 0.5) * 0.5 }; }).sort(function (a, b) { return b.s - a.s; }); }
    for (var i = 0; i < count; i++) {
      var row = { response_id: 'sample-' + i, created_at: new Date(base + i * 3600000).toISOString() };
      ids.forEach(function (id) { row['q1_' + id] = r() < 0.06 ? 'unsure' : String(Math.max(1, Math.min(5, Math.round(1 + 4 * (WEIGHT[id] + (r() - 0.5) * 0.7))))); });
      var top = scored().map(function (x) { return x.id; }); row.q2 = top.slice(0, 3).join(','); row.q3 = top.slice(0, 3).join(',');
      if (r() < 0.7) row.q4 = r() < 0.15 ? 'all' : ids[ids.length - 1 - Math.floor(r() * 5)];
      row.q5 = pick(r, ['daily', 'few', 'weekly', 'weekly', 'payday', 'trouble']); row.q6 = pick(r, ['phone', 'phone', 'phone', 'computer', 'both']);
      row.q7 = r() < 0.15 ? 'unsure' : ['type', 'file', 'photo'].filter(function (x, k) { return k === 0 || r() < 0.4; }).join(',');
      row.q8 = pick(r, ['simple', 'tap', 'tap', 'lots']); row.q9 = pick(r, ['track', 'split', 'zero', 'envelopes', 'pick', 'pick']);
      row.q10 = r() < 0.12 ? 'none' : ['bill', 'weekly', 'payday', 'over'].filter(function () { return r() < 0.45; }).join(',');
      row.q11 = ['typing', 'judged', 'complex', 'upsell', 'reallife', 'forget'].filter(function () { return r() < 0.3; }).join(',');
      if (r() < 0.8) row.q12 = pick(r, WISH); if (r() < 0.4) row.q13 = pick(r, IDEAS); if (r() < 0.3) row.q14 = pick(r, APPS); if (r() < 0.25) row.q16 = pick(r, MORE);
      row.q15_try = r() < 0.3 ? 'yes' : 'no'; if (r() < 0.4) row.q15_quote = 'yes';
      rows.push(row);
      if (i % 11 === 10) { var copy = {}; Object.keys(row).forEach(function (k) { copy[k] = row[k]; }); copy.created_at = new Date(base + i * 3600000 + 60000).toISOString(); rows.push(copy); } // a retry: same id sent twice
    }
    return rows;
  };
})(typeof window !== 'undefined' ? window : globalThis);
