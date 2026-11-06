/* results.js - the results page. Runs entirely on your own computer: it reads the file you pick and sends nothing anywhere. */
(function (root) {
  'use strict';
  var SV = root.SV, h = SV.h, A = SV.analyze, doc = root.document, mount = doc.getElementById('app');
  var MAX_BYTES = 5000000, MAX_TEXTS = 500;
  var state = { data: null, fake: false, error: '', sort: 'votes', filter: '' };

  function pct(x) { return x === null ? 'n/a' : Math.round(x) + '%'; }
  function one(x) { return x === null ? 'n/a' : (Math.round(x * 10) / 10).toFixed(1); }
  function btn(text, onclick, cls) { return h('button', { type: 'button', class: 'btn ' + (cls || ''), onclick: onclick }, text); }
  function meter(p) { var i = h('span', { class: 'fill' }); i.style.width = Math.max(0, Math.min(100, p || 0)) + '%'; return h('span', { class: 'meter', role: 'img', 'aria-label': pct(p) }, i); }

  function download(name, text, type) {
    var blob = new root.Blob([text], { type: type }), url = root.URL.createObjectURL(blob), a = doc.createElement('a');
    a.href = url; a.download = name; doc.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { root.URL.revokeObjectURL(url); }, 1000);
  }
  function load(text, fake) {
    try { state.data = A.analyze(text); state.fake = !!fake; state.error = ''; }
    catch (e) { state.data = null; state.error = e && e.message ? e.message : 'That file could not be read.'; }
    render();
  }
  function loadFile(file) {
    if (!file) return;
    if (file.size > MAX_BYTES) { state.error = 'That file is too big (limit about 5 MB).'; state.data = null; render(); return; }
    var rd = new root.FileReader();
    rd.onload = function () { load(String(rd.result), false); };
    rd.onerror = function () { state.error = 'That file could not be read.'; render(); };
    rd.readAsText(file);
  }
  function loadSample() { // fake answers, produced locally, labelled as fake everywhere
    load(JSON.stringify(SV.sampleRows(60)), true);
  }

  /* ---------- sections ---------- */
  function intro() {
    return h('div', { class: 'stack' },
      h('p', { class: 'help' }, 'Choose the file you downloaded from your survey form. It is read on this computer only; nothing is uploaded.'),
      h('input', { type: 'file', class: 'input', accept: '.csv,.json,.txt', 'aria-label': 'Choose the exported results file', onchange: function (e) { loadFile(e.target.files && e.target.files[0]); } }),
      h('div', { class: 'toolbar' }, btn('Show me with fake sample data', loadSample, 'ghost')),
      h('h2', null, 'Where do I get the file?'),
      h('ol', { class: 'steps' },
        h('li', null, 'Open your survey site in Netlify and go to Forms.'),
        h('li', null, 'Open the form called "survey" (the answers). The "survey-contact" form only holds email addresses; keep it separate.'),
        h('li', null, 'Use the export option to download the submissions as a CSV file, then choose that file above.'),
        h('li', null, 'Also look at the Spam tab. Netlify\'s spam filter sometimes flags real people; mark those as verified and export again.')));
  }
  function summary(d) {
    var s = d.stats, out = [];
    if (state.fake) out.push(h('p', { class: 'banner fake', role: 'status' }, 'FAKE SAMPLE DATA. These answers were made up by the computer to show what the page looks like. They say nothing about real people.'));
    if (s.smallSample) out.push(h('p', { class: 'banner', role: 'status' }, 'Small sample (' + s.n + ' responses). Treat these percentages as hints, not findings. About 30 or more makes them steadier.'));
    (d.info.warnings || []).forEach(function (w) { out.push(h('p', { class: 'banner', role: 'status' }, w)); });
    out.push(h('div', { class: 'cards' },
      card(s.n, 'people answered'), card(d.info.duplicatesRemoved, 'duplicate sends removed'),
      card(s.contact.tryYes, 'would try an early version'), card(s.contact.quote, 'OK with an anonymous quote')));
    return out;
  }
  function card(n, label) { return h('div', { class: 'card' }, h('div', { class: 'big' }, String(n)), h('div', { class: 'lbl' }, label)); }

  var SORTS = { votes: ['Home-screen votes (best summary)', null], important: ['Rated 4-5 (importance)', 'top2Pct'], picked: ['Chosen in top 3', 'pickedPct'], mean: ['Average rating', 'mean'], unsure: ['Not sure what it is', 'unsurePct'], never: ['Would never use', 'neverPct'] };
  function featureTable(d) {
    var s = d.stats, byId = Object.create(null); s.features.forEach(function (f) { byId[f.id] = f; });
    var ids = s.order.slice(), key = SORTS[state.sort] && SORTS[state.sort][1];
    if (key) ids.sort(function (a, b) { return ((byId[b][key] === null ? -1 : byId[b][key]) - (byId[a][key] === null ? -1 : byId[a][key])) || (s.order.indexOf(a) - s.order.indexOf(b)); });
    var select = h('select', { class: 'sel', 'aria-label': 'Sort the table by', onchange: function (e) { state.sort = e.target.value; render(); var again = doc.querySelector('select'); if (again) again.focus(); } },
      Object.keys(SORTS).map(function (k) { var o = h('option', { value: k }, SORTS[k][0]); if (k === state.sort) o.selected = true; return o; }));
    var head = ['#', 'Feature', 'Votes', '#1 picks', 'In top 3', 'Rated 4-5', 'Rated by', 'Average', 'Not sure', 'Never use'];
    var rows = ids.map(function (id, i) {
      var f = byId[id];
      return h('tr', null, h('td', null, String(i + 1)), h('td', null, h('strong', null, f.label), f.desc ? h('div', { class: 'desc' }, f.desc) : null),
        h('td', null, String(f.rankPoints)), h('td', null, String(f.rank1)), h('td', null, meter(f.pickedPct), pct(f.pickedPct)),
        h('td', null, meter(f.top2Pct), pct(f.top2Pct)), h('td', null, String(f.rated)), h('td', null, one(f.mean)), h('td', null, pct(f.unsurePct)), h('td', null, pct(f.neverPct)));
    });
    return [h('h2', null, 'What matters most'),
      h('p', { class: 'help' }, 'Votes: each person\'s top three are worth 3, 2 and 1 points (#1, #2, #3). "Rated 4-5" is the share who rated it 4 or 5, out of those who rated it. "In top 3" is the share who put it in their three. This table is ordered by votes unless you change it.'),
      h('p', { class: 'help' }, A.basesLine(s)),
      h('div', { class: 'toolbar' }, h('label', null, 'Sort by', select)),
      h('div', { class: 'tablewrap' }, h('table', null, h('thead', null, h('tr', null, head.map(function (t) { return h('th', { scope: 'col' }, t); }))), h('tbody', null, rows)))];
  }
  function distributions(d) {
    return Object.keys(d.stats.questions).filter(function (k) { return d.stats.questions[k].answered > 0; }).map(function (k) {
      var q = d.stats.questions[k];
      return h('section', null, h('h2', null, q.title), h('p', { class: 'help' }, q.answered + ' answered' + (q.type === 'multi' ? ' (they could choose several, so the percentages add to more than 100)' : '')),
        h('div', { class: 'dist' }, q.options.map(function (o) {
          var fill = h('span', { class: 'fill' }); fill.style.width = Math.max(0, Math.min(100, o.pct || 0)) + '%';
          return h('div', { class: 'dist-row' }, h('span', null, o.label), h('span', { class: 'track', role: 'img', 'aria-label': pct(o.pct) }, fill), h('span', { class: 'num' }, o.count + ' (' + pct(o.pct) + ')'));
        })));
    });
  }
  var TEXTS = [['q12', 'The ONE thing they wish a dashboard would tell them'], ['q13', 'Missing features and ideas'], ['q14', 'Apps they loved or hated'], ['q16', 'Anything else they wanted to say'], ['q11_other', 'Other reasons they would stop using an app']];
  function openText(d) {
    var listBox = h('div');
    function draw() { // only the lists are rebuilt while typing; the search box itself is never replaced
      var f = state.filter.toLowerCase();
      listBox.textContent = '';
      TEXTS.forEach(function (p) {
        var all = d.stats.texts[p[0]], shown = all.filter(function (t) { return !f || t.toLowerCase().indexOf(f) >= 0; });
        listBox.appendChild(h('section', null, h('h2', null, p[1] + ' (' + shown.length + (shown.length !== all.length ? ' of ' + all.length : '') + ')'),
          shown.length ? h('ul', { class: 'texts' }, shown.slice(0, MAX_TEXTS).map(function (t) { return h('li', null, t); })) : h('p', { class: 'help' }, 'Nothing to show.'),
          shown.length > MAX_TEXTS ? h('p', { class: 'help' }, 'Showing the first ' + MAX_TEXTS + '. Download the full results below for the rest.') : null));
      });
    }
    var box = h('input', { type: 'text', class: 'input', maxlength: 100, placeholder: 'Search the written answers', 'aria-label': 'Search the written answers', value: state.filter,
      oninput: function (e) { state.filter = e.target.value; draw(); } });
    draw();
    return [h('div', { class: 'stack' }, h('h2', null, 'In their own words'), box), listBox];
  }
  function downloads(d) {
    var stamp = new Date().toISOString().slice(0, 10), tag = state.fake ? 'FAKE-sample-' : '';
    return [h('h2', null, 'Take it with you'),
      h('p', { class: 'help' }, 'Spreadsheet files have a safety prefix added to any text that begins with = + - or @, so a stray answer cannot run as a formula when you open them in Excel or Sheets.'),
      h('div', { class: 'toolbar' },
        btn('Download summary (Markdown)', function () { download(tag + 'survey-summary-' + stamp + '.md', A.toMarkdown(d.stats, d.info), 'text/markdown'); }, 'ghost'),
        btn('Download feature table (CSV)', function () { download(tag + 'survey-features-' + stamp + '.csv', A.excelCsv(A.featuresCsv(d.stats)), 'text/csv;charset=utf-8'); }, 'ghost'),
        btn('Download every response (CSV)', function () { download(tag + 'survey-responses-' + stamp + '.csv', A.excelCsv(A.responsesCsv(d.responses)), 'text/csv;charset=utf-8'); }, 'ghost'))];
  }

  function render() {
    mount.textContent = '';
    var kids = [h('h1', { tabindex: '-1', id: 'title' }, 'Survey results')];
    if (state.error) kids.push(h('p', { class: 'error', role: 'alert' }, state.error));
    if (!state.data) kids.push(intro());
    else {
      kids.push(h('div', { class: 'toolbar' }, btn('Load a different file', function () { state.data = null; state.fake = false; state.filter = ''; render(); }, 'ghost')));
      kids = kids.concat(summary(state.data), featureTable(state.data), distributions(state.data), openText(state.data), downloads(state.data));
    }
    mount.appendChild(h('main', { class: 'screen wide', id: 'main' }, kids));
  }
  render();
})(typeof window !== 'undefined' ? window : globalThis);
