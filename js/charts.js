/* charts.js — dependency-free SVG charts built with the safe DOM builder (no innerHTML). */
(function (root) {
  'use strict';
  var FD = (root.FD = root.FD || {});
  var U = FD.util, h = U.h;

  /* ---------- donut (categories). Legend carries names + amounts, so identity never relies on colour alone ---------- */
  function donut(rows, total) {
    var MAX = 7, size = 160, r = 62, cx = 80, cy = 80, sw = 26;
    var shown = rows.slice(0, MAX), rest = rows.slice(MAX);
    if (rest.length) shown.push({ id: 'rest', name: 'Everything else', amount: rest.reduce(function (s, x) { return s + x.amount; }, 0), muted: true });
    var svg = h('svg', { viewBox: '0 0 ' + size + ' ' + size, class: 'donut', role: 'img', 'aria-label': 'Spending by category this month' });
    var start = -Math.PI / 2;
    if (total <= 0) {
      svg.appendChild(h('circle', { cx: cx, cy: cy, r: r, class: 'donut-empty', fill: 'none', 'stroke-width': sw }));
    }
    shown.forEach(function (row, i) {
      var frac = total > 0 ? row.amount / total : 0;
      if (frac <= 0) return;
      var end = start + Math.min(frac, 0.9999) * Math.PI * 2;
      var large = end - start > Math.PI ? 1 : 0;
      var p = 'M' + (cx + r * Math.cos(start)) + ' ' + (cy + r * Math.sin(start)) +
        ' A' + r + ' ' + r + ' 0 ' + large + ' 1 ' + (cx + r * Math.cos(end)) + ' ' + (cy + r * Math.sin(end));
      svg.appendChild(h('path', { d: p, fill: 'none', 'stroke-width': sw, class: row.muted ? 'slice slice-rest' : 'slice slice-' + (i + 1) },
        h('title', null, row.name + ': ' + U.money(row.amount))));
      start = end;
    });
    var legend = h('ul', { class: 'legend' }, shown.map(function (row, i) {
      return h('li', null,
        h('span', { class: 'swatch ' + (row.muted ? 'sw-rest' : 'sw-' + (i + 1)), 'aria-hidden': 'true' }),
        h('span', { class: 'lg-name' }, row.name),
        h('span', { class: 'lg-amt' }, U.money(row.amount)),
        h('span', { class: 'lg-pct' }, total > 0 ? Math.round(row.amount / total * 100) + '%' : ''));
    }));
    return h('div', { class: 'donut-wrap' }, svg, legend);
  }

  /* ---------- progress bar ---------- */
  function bar(pct, cls, label) {
    var fill = h('div', { class: 'bar-fill ' + (cls || '') });
    fill.style.width = Math.max(0, Math.min(100, pct * 100)) + '%';
    return h('div', { class: 'bar', role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-valuenow': Math.round(pct * 100), 'aria-label': label || 'progress' }, fill);
  }

  /* ---------- balance line chart ----------
     opts: {points, high (optional range points), low (optional: with high, the band runs from low to high), min, label,
            xLabel(p, i) -> text or null (default: month names), tipLabel(p, i) -> hover text (default: date and balance), noDanger: true to skip the tint below the minimum}
     Segments below `min` are drawn red and the zone below is tinted; a dashed line marks the minimum. */
  function lineChart(opts) {
    var pts = opts.points, W = 640, H = 280, L = 52, R = 14, T = 12, B = 30;
    var min = opts.min || 0;
    var all = pts.map(function (p) { return p.balance; });
    if (opts.high) opts.high.forEach(function (p) { all.push(p.balance); });
    if (opts.low) opts.low.forEach(function (p) { all.push(p.balance); });
    all.push(0, min);
    var lo = Math.min.apply(null, all), hi = Math.max.apply(null, all);
    var pad = (hi - lo) * 0.08 || 50; lo -= pad; hi += pad;
    var n = pts.length - 1 || 1;
    function X(i) { return L + (W - L - R) * i / n; }
    function Y(v) { return T + (H - T - B) * (1 - (v - lo) / (hi - lo)); }

    var svg = h('svg', { viewBox: '0 0 ' + W + ' ' + H, class: 'linechart', role: 'img', 'aria-label': opts.label || 'Projected account balance' });
    // y ticks
    var step = niceStep((hi - lo) / 4), t0 = Math.ceil(lo / step) * step;
    for (var v = t0; v <= hi; v += step) {
      svg.appendChild(h('line', { x1: L, x2: W - R, y1: Y(v), y2: Y(v), class: 'grid' }));
      svg.appendChild(h('text', { x: L - 6, y: Y(v) + 4, 'text-anchor': 'end', class: 'axis' }, shortMoney(v)));
    }
    // x ticks (month starts)
    var lastLabelX = -99;
    pts.forEach(function (p, i) {
      var lab = opts.xLabel ? opts.xLabel(p, i) : (p.date.getDate() === 1 || i === 0 ? U.MONTHS[p.date.getMonth()] + (p.date.getMonth() === 0 ? " '" + String(p.date.getFullYear()).slice(2) : '') : null);
      if (lab === null || lab === undefined) return;
      var x = X(i);
      if (x - lastLabelX < 48) return;
      lastLabelX = x;
      svg.appendChild(h('text', { x: x, y: H - 8, 'text-anchor': i === 0 ? 'start' : 'middle', class: 'axis' }, lab));
    });
    // danger zone
    if (lo < min && !opts.noDanger) {
      svg.appendChild(h('rect', { x: L, y: Y(min), width: W - L - R, height: Math.max(0, Y(lo) - Y(min)), class: 'danger-zone' }));
    }
    svg.appendChild(h('line', { x1: L, x2: W - R, y1: Y(min), y2: Y(min), class: min > 0 ? 'minline' : 'zeroline' }));
    if (min > 0) svg.appendChild(h('text', { x: W - R, y: Y(min) - 4, 'text-anchor': 'end', class: 'axis' }, 'Your minimum ' + shortMoney(min)));

    // range band (irregular income)
    if (opts.high) {
      var up = opts.high.map(function (p, i) { return X(i) + ',' + Y(p.balance); });
      var down = (opts.low || pts).map(function (p, i) { return X(i) + ',' + Y(p.balance); }).reverse();
      svg.appendChild(h('polygon', { points: up.concat(down).join(' '), class: 'band' }));
    }
    // the line, split into normal / below-minimum runs
    var run = [], runBad = null;
    function flush() {
      if (run.length > 1) svg.appendChild(h('polyline', { points: run.join(' '), class: 'line ' + (runBad ? 'line-bad' : 'line-ok'), fill: 'none' }));
    }
    pts.forEach(function (p, i) {
      var bad = p.balance < min;
      var prevBad = i > 0 && pts[i - 1].balance < min;
      var segBad = bad || prevBad;
      var pt = X(i) + ',' + Y(p.balance);
      if (runBad === null) { runBad = segBad; run.push(pt); return; }
      if (segBad !== runBad) { // close current run at this point, start the next from the previous point
        run.push(pt); flush();
        run = [X(i - 1) + ',' + Y(pts[i - 1].balance), pt]; runBad = segBad; return;
      }
      run.push(pt);
    });
    flush();

    // hover layer
    var cross = h('line', { class: 'cross', y1: T, y2: H - B, x1: 0, x2: 0 });
    var dot = h('circle', { class: 'dot', r: 5, cx: 0, cy: 0 });
    cross.style.display = 'none'; dot.style.display = 'none';
    svg.appendChild(cross); svg.appendChild(dot);
    var tip = h('div', { class: 'tip', role: 'status' });
    tip.style.display = 'none';
    var wrap = h('div', { class: 'chart-wrap', tabindex: '0', 'aria-label': (opts.label || 'Projected balance') + '. Use left and right arrow keys to read values.' }, svg, tip);
    var cur = -1;
    function show(i) {
      i = Math.max(0, Math.min(n, i)); cur = i;
      var p = pts[i], x = X(i), y = Y(p.balance);
      cross.setAttribute('x1', x); cross.setAttribute('x2', x); dot.setAttribute('cx', x); dot.setAttribute('cy', y);
      cross.style.display = ''; dot.style.display = '';
      var txt = opts.tipLabel ? opts.tipLabel(p, i) : U.fmtDate(p.date) + ': ' + U.money(p.balance);
      if (opts.high && !opts.tipLabel) txt += ' (up to ' + U.money(opts.high[i].balance) + ')';
      tip.textContent = txt;
      tip.style.display = '';
      var wrapW = tip.parentNode ? tip.parentNode.clientWidth : 0, tw = tip.offsetWidth;   // centre it on the point, but never past either edge of the chart
      tip.style.left = wrapW && tw ? Math.max(tw / 2 + 4, Math.min(x / W * wrapW, wrapW - tw / 2 - 4)) + 'px' : Math.max(16, Math.min(x / W * 100, 84)) + '%';
    }
    function hide() { cross.style.display = 'none'; dot.style.display = 'none'; tip.style.display = 'none'; }
    function fromEvent(e) {
      var rect = svg.getBoundingClientRect();
      var x = (e.clientX - rect.left) / rect.width * W;
      show(Math.round((x - L) / (W - L - R) * n));
    }
    wrap.addEventListener('pointermove', fromEvent);
    wrap.addEventListener('pointerdown', fromEvent);
    wrap.addEventListener('pointerleave', function (e) { if (e.pointerType === 'mouse') hide(); });
    wrap.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowRight') { show((cur < 0 ? 0 : cur) + (e.shiftKey ? 7 : 1)); e.preventDefault(); }
      else if (e.key === 'ArrowLeft') { show((cur < 0 ? 0 : cur) - (e.shiftKey ? 7 : 1)); e.preventDefault(); }
      else if (e.key === 'Escape') hide();
    });
    return wrap;
  }

  /* ---------- several lines in one chart (e.g. the growth of every fund type) ----------
     opts: series [{ name, cls ('s1'..'s4': colour AND line style, see the CSS), pts: [{ year, balance }] }], band { cls, low: pts, high: pts } (optional range
     around one series), reach (the largest amount that could be shown, so the scale does not jump when the band changes), xLabel(p, i), tipTitle(i) (the
     caption for a year), label (the chart's text description), value(v) (how a number is written).
     Identity never rests on colour alone: each line also has its own dash pattern, an end dot, and a legend (HTML text, ordered by where the lines end)
     with the end value; reading a year switches that legend to the year's amounts (there is no floating tooltip to cover the lines). */
  function multiLine(opts) {
    var series = opts.series, W = 640, H = 400, L = 66, R = 24, T = 14, B = 40, band = opts.band || null;
    var all = [0];
    if (opts.reach > 0 && isFinite(opts.reach)) all.push(opts.reach);
    series.forEach(function (s) { s.pts.forEach(function (p) { all.push(p.balance); }); });
    if (band) { band.high.forEach(function (p) { all.push(p.balance); }); band.low.forEach(function (p) { all.push(p.balance); }); }
    var lo = Math.min.apply(null, all), hi = Math.max.apply(null, all);
    if (hi <= lo) hi = lo + 100;
    hi += (hi - lo) * 0.06;
    var n = series[0].pts.length - 1 || 1;
    function X(i) { return L + (W - L - R) * i / n; }
    function Y(v) { return T + (H - T - B) * (1 - (v - lo) / (hi - lo)); }
    var money = opts.value || U.money;

    var svg = h('svg', { viewBox: '0 0 ' + W + ' ' + H, class: 'linechart multi', role: 'img', 'aria-label': opts.label || 'Growth of each option over time' });
    var step = niceStep((hi - lo) / 4), t0 = Math.ceil(lo / step) * step;
    for (var v = t0; v <= hi; v += step) {
      svg.appendChild(h('line', { x1: L, x2: W - R, y1: Y(v), y2: Y(v), class: 'grid' }));
      svg.appendChild(h('text', { x: L - 6, y: Y(v) + 4, 'text-anchor': 'end', class: 'axis' }, shortMoney(v)));
    }
    var lastLabelX = -99;
    series[0].pts.forEach(function (p, i) {
      var lab = opts.xLabel ? opts.xLabel(p, i) : null;
      if (lab === null || lab === undefined) return;
      var x = X(i);
      if (x - lastLabelX < 60) return;
      lastLabelX = x;
      svg.appendChild(h('text', { x: x, y: H - 10, 'text-anchor': i === 0 ? 'start' : i === series[0].pts.length - 1 ? 'end' : 'middle', class: 'axis' }, lab));
    });
    svg.appendChild(h('line', { x1: L, x2: W - R, y1: Y(0), y2: Y(0), class: 'zeroline' }));
    if (band) {
      var up = band.high.map(function (p, i) { return X(i) + ',' + Y(p.balance); });
      var down = band.low.map(function (p, i) { return X(i) + ',' + Y(p.balance); }).reverse();
      svg.appendChild(h('polygon', { points: up.concat(down).join(' '), class: 'ml-band ml-' + band.cls }));
    }
    series.forEach(function (s) {
      svg.appendChild(h('polyline', { points: s.pts.map(function (p, i) { return X(i) + ',' + Y(p.balance); }).join(' '), class: 'ml-line ml-' + s.cls, fill: 'none' }));
    });
    series.forEach(function (s) {   // the end dot on every line (a 2px ring in the surface colour keeps neighbouring dots apart)
      var last = s.pts[s.pts.length - 1];
      svg.appendChild(h('circle', { cx: X(s.pts.length - 1), cy: Y(last.balance), r: 4.5, class: 'ml-dot ml-' + s.cls }));
    });

    var cross = h('line', { class: 'cross', y1: T, y2: H - B, x1: 0, x2: 0 });
    cross.style.display = 'none';
    var dots = series.map(function (s) { var d = h('circle', { cx: 0, cy: 0, r: 5, class: 'ml-dot ml-' + s.cls }); d.style.display = 'none'; return d; });
    svg.appendChild(cross); dots.forEach(function (d) { svg.appendChild(d); });
    // Reading a point never covers the lines: the legend below the chart switches to that year's amounts instead of a floating box.
    var wrap = h('div', { class: 'chart-wrap', tabindex: '0', role: 'group', 'aria-label': (opts.label || 'Growth of each option') + '. Use left and right arrow keys to read the amounts for each year.' }, svg);
    var last = series[0].pts.length - 1, cur = -1;
    var caption = h('p', { class: 'key-caption' });
    var rows = ordered(last).map(function (s) {
      var val = h('span', { class: 'key-val' });
      return { s: s, val: val, li: h('li', null, h('span', { class: 'sw ml-' + s.cls, 'aria-hidden': 'true' }), h('span', { class: 'key-name' }, s.name), val) };
    });
    function ordered(i) { return series.slice().sort(function (a, b) { return b.pts[i].balance - a.pts[i].balance; }); }
    function fill(i) { caption.textContent = opts.tipTitle ? opts.tipTitle(i) : String(i); rows.forEach(function (r) { r.val.textContent = money(r.s.pts[i].balance); }); }
    function show(i) {
      if (!isFinite(i)) return;
      i = Math.max(0, Math.min(n, i)); if (i === cur) return;   // the same year again (a pointer moving a few pixels): nothing to redraw or announce
      cur = i;
      var x = X(i);
      cross.setAttribute('x1', x); cross.setAttribute('x2', x); cross.style.display = '';
      series.forEach(function (s, k) { dots[k].setAttribute('cx', x); dots[k].setAttribute('cy', Y(s.pts[i].balance)); dots[k].style.display = ''; });
      fill(i);
    }
    function hide() { cross.style.display = 'none'; dots.forEach(function (d) { d.style.display = 'none'; }); cur = -1; fill(last); }
    function fromEvent(e) { var rect = svg.getBoundingClientRect(); show(Math.round(((e.clientX - rect.left) / rect.width * W - L) / (W - L - R) * n)); }
    // Only arrow-key reads are announced, through a separate hidden live region (a moving pointer would flood a screen reader, and switching aria-live on and off is not reliable).
    var announce = h('p', { class: 'sr-only', role: 'status', 'aria-live': 'polite' });
    function say(i) { announce.textContent = caption.textContent + ': ' + ordered(last).map(function (s) { return s.name + ' ' + money(s.pts[i].balance); }).join(', '); }
    wrap.addEventListener('pointermove', fromEvent);
    wrap.addEventListener('pointerdown', fromEvent);
    wrap.addEventListener('pointerleave', function (e) { if (e.pointerType === 'mouse') hide(); });
    wrap.addEventListener('keydown', function (e) {
      var at = cur < 0 ? last : cur;   // the legend starts at the end of the chart, so the first arrow press moves from there
      if (e.key === 'ArrowRight') { show(at + (e.shiftKey ? 5 : 1)); say(cur); e.preventDefault(); }
      else if (e.key === 'ArrowLeft') { show(at - (e.shiftKey ? 5 : 1)); say(cur); e.preventDefault(); }
      else if (e.key === 'Escape') hide();
    });
    fill(last);
    var box = h('div', { class: 'series-key-box' }, caption, h('ul', { class: 'series-key', 'aria-label': 'Which line is which, with the amount for the year shown' }, rows.map(function (r) { return r.li; })));
    return h('div', { class: 'ml-chart' }, wrap, box, announce);
  }

  function niceStep(raw) {
    var p = Math.pow(10, Math.floor(Math.log(raw) / Math.LN10)), f = raw / p;
    return (f < 1.5 ? 1 : f < 3.5 ? 2 : f < 7.5 ? 5 : 10) * p;
  }
  function shortMoney(v) {
    var a = Math.abs(v), s = a >= 1e9 ? (Math.round(a / 1e8) / 10) + 'B' : a >= 1e6 ? (Math.round(a / 1e5) / 10) + 'M' : a >= 1000 ? (Math.round(a / 100) / 10) + 'k' : String(Math.round(a));
    return (v < 0 ? '-$' : '$') + s;
  }

  FD.charts = { donut: donut, bar: bar, lineChart: lineChart, multiLine: multiLine, shortMoney: shortMoney };
  if (typeof module !== 'undefined' && module.exports) module.exports = FD;
})(typeof window !== 'undefined' ? window : globalThis);
