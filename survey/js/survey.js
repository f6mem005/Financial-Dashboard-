/* survey.js - screens and interaction. One question per screen; everything can be tapped again to undo. */
(function (root) {
  'use strict';
  var SV = root.SV, h = SV.h, L = SV.logic, Q = SV.questions, cfg = SV.config, doc = root.document;
  var mount = doc.getElementById('app'), live = doc.getElementById('live');

  /* ---------- state (kept in this browser only, until the survey is finished) ---------- */
  function randomSeed() {
    try { return root.crypto.getRandomValues(new Uint32Array(1))[0]; } catch (e) { return Math.floor(Math.random() * 4294967295); }
  }
  function newId() {
    try { if (root.crypto.randomUUID) return root.crypto.randomUUID(); } catch (e) { /* fall through */ }
    var a = new Uint8Array(16);
    try { root.crypto.getRandomValues(a); } catch (e) { for (var i = 0; i < 16; i++) a[i] = Math.floor(Math.random() * 256); }
    return Array.prototype.map.call(a, function (b) { return ('0' + b.toString(16)).slice(-2); }).join('');
  }
  function fresh() { return { started: false, qid: null, answers: {}, seed: randomSeed(), rid: newId(), done: false, sent: false, sending: false, notice: null }; }
  var MAX_AGE = 7 * 24 * 3600 * 1000; // saved progress (it may hold an email) is forgotten after a week
  function load() {
    var s = fresh();
    try {
      var raw = root.localStorage.getItem(cfg.storageKey);
      if (raw && raw.length < 100000) {
        var p = JSON.parse(raw);
        if (p && typeof p === 'object' && p.v === 1) {
          var age = typeof p.t === 'number' ? Date.now() - p.t : Infinity;
          if (age > MAX_AGE || age < -60000) { clearSaved(); return s; }
          if (typeof p.seed === 'number') s.seed = p.seed >>> 0;
          if (typeof p.rid === 'string' && /^[0-9a-f-]{16,40}$/.test(p.rid)) s.rid = p.rid;
          s.answers = L.sanitizeAnswers(Q, p.answers);
          s.started = p.started === true;
          s.qid = typeof p.qid === 'string' && Q.some(function (q) { return q.id === p.qid; }) ? p.qid : null;
        }
      }
    } catch (e) { /* storage unavailable or unreadable: start fresh */ }
    return s;
  }
  var state = load();
  function tick() { try { return root.performance.now(); } catch (e) { return Date.now(); } } // monotonic: unaffected by clock changes
  var lastNav = -1e9; // time of the last Next/Back that was honoured
  function navLocked() { // a double-tap's second tap would land on the NEXT screen's button, so ignore taps right after a move
    var now = tick(), d = now - lastNav, locked = d >= 0 && d < 300;
    if (!locked) lastNav = now;
    return locked;
  }
  function save() {
    try { root.localStorage.setItem(cfg.storageKey, JSON.stringify({ v: 1, t: Date.now(), rid: state.rid, started: state.started, qid: state.qid, seed: state.seed, answers: state.answers })); } catch (e) { /* the survey still works without saving */ }
  }
  function clearSaved() { try { root.localStorage.removeItem(cfg.storageKey); } catch (e) { /* ignore */ } }
  function say(msg) { live.textContent = ''; setTimeout(function () { live.textContent = msg; }, 30); }
  function itemById(q, id) { return q.items.filter(function (i) { return i.id === id; })[0]; }
  function hasAnswers() { return Object.keys(L.sanitizeAnswers(Q, state.answers)).length > 0; }

  /* ---------- small widgets ---------- */
  function press(btn, on) { btn.setAttribute('aria-pressed', on ? 'true' : 'false'); btn.classList.toggle('on', !!on); }
  function btn(text, onclick, cls, attrs) {
    var a = { type: 'button', class: 'btn ' + (cls || ''), onclick: onclick };
    if (attrs) Object.keys(attrs).forEach(function (k) { a[k] = attrs[k]; });
    return h('button', a, text);
  }
  function optionLabel(item) { return h('span', { class: 'opt-text' }, h('strong', null, item.label), item.desc ? h('span', { class: 'desc' }, item.desc) : null); }

  /* ---------- question bodies ---------- */
  function gridBody(q, clearError) {
    var a = state.answers[q.id] = state.answers[q.id] || {}, order = L.orderFor(q, state.seed), n = order.length;
    var counter = h('p', { class: 'counter', role: 'status', 'aria-live': 'polite' });
    function count() { return order.filter(function (id) { return a[id] !== undefined; }).length; }
    function upd() { counter.textContent = 'Rated ' + count() + ' of ' + n; }
    var rows = order.map(function (id) {
      var item = itemById(q, id), btns = [], scale = h('div', { class: 'scale' });
      var rowEl = h('div', { class: 'row', role: 'group', 'aria-label': item.label });
      rowEl._id = id;
      function refresh() { btns.forEach(function (b) { press(b, a[id] === b._val); }); }
      function add(val, text, label) {
        var b = h('button', { type: 'button', class: 'rate' + (val === 'unsure' ? ' unsure' : ''), 'aria-pressed': 'false', 'aria-label': label,
          onclick: function () {
            if (a[id] === val) delete a[id]; else a[id] = val;
            refresh(); rowEl.classList.remove('missing'); save(); upd(); clearError();
          } }, text);
        b._val = val; btns.push(b); scale.appendChild(b);
      }
      for (var r = 1; r <= q.scale; r++) add(r, String(r), item.label + ': ' + r + ' out of ' + q.scale);
      if (q.unsure) add('unsure', 'Not sure', item.label + ': not sure what this is');
      refresh();
      rowEl.appendChild(optionLabel(item)); rowEl.appendChild(scale);
      return rowEl;
    });
    upd();
    var wrap = h('div', null, h('p', { class: 'legend' }, '1 = ' + q.scaleLow + '   -   ' + q.scale + ' = ' + q.scaleHigh), counter, h('div', { class: 'rows' }, rows));
    wrap._focusMissing = function () { // called when Next is blocked: show which rows still need a rating
      var first = null;
      rows.forEach(function (r) { var missing = a[r._id] === undefined; r.classList.toggle('missing', missing); if (missing && !first) first = r; });
      if (first) { first.scrollIntoView({ block: 'center' }); var b = first.querySelector('.rate'); if (b) b.focus({ preventScroll: true }); }
    };
    return wrap;
  }

  function pickBody(q, clearError) {
    var box = h('div'), counter = h('p', { class: 'counter', role: 'status', 'aria-live': 'polite' });
    var order = L.orderFor(q, state.seed);
    function draw(focusId) {
      var list = state.answers[q.id] = Array.isArray(state.answers[q.id]) ? state.answers[q.id] : [];
      counter.textContent = list.length + ' of ' + q.exact + ' chosen' + (list.length >= q.exact ? '. Tap a chosen one to unchoose it.' : '');
      box.textContent = '';
      var focusEl = null;
      order.forEach(function (id) {
        var item = itemById(q, id), on = list.indexOf(id) >= 0, full = list.length >= q.exact && !on;
        var b = h('button', { type: 'button', class: 'choice' + (on ? ' on' : ''), 'aria-pressed': on ? 'true' : 'false', disabled: full,
          onclick: function () {
            state.answers[q.id] = L.togglePick(list, id, q.exact);
            save(); clearError(); draw(id);
          } }, h('span', { class: 'tick', 'aria-hidden': 'true' }), optionLabel(item));
        if (id === focusId) focusEl = b;
        box.appendChild(b);
      });
      if (focusEl) focusEl.focus({ preventScroll: true });
    }
    draw();
    return h('div', null, counter, box);
  }

  function rankBody(q) {
    var src = Q.filter(function (x) { return x.id === q.from; })[0];
    state.answers[q.id] = L.syncRank(state.answers[q.id], state.answers[src.id] || []);
    var ul = h('ol', { class: 'rank' });
    function move(from, to) {
      if (to < 0 || to >= state.answers[q.id].length) return;
      var name = itemById(src, state.answers[q.id][from]).label;
      state.answers[q.id] = L.reorder(state.answers[q.id], from, to);
      save(); draw(to, to < from ? 'up' : 'down');
      say(name + ' moved to position ' + (to + 1) + ' of ' + state.answers[q.id].length);
    }
    function startDrag(e, li, from) {
      if (e.button !== undefined && e.button !== 0) return;
      e.preventDefault();
      var grip = e.currentTarget, items = Array.prototype.slice.call(ul.children);
      var rects = items.map(function (el) { return el.getBoundingClientRect(); }), startY = e.clientY, target = from;
      try { grip.setPointerCapture(e.pointerId); } catch (err) { /* older browsers */ }
      li.classList.add('dragging');
      function onMove(ev) {
        var dy = ev.clientY - startY, y = rects[from].top + rects[from].height / 2 + dy;
        li.style.transform = 'translateY(' + dy + 'px)';
        target = from;
        for (var k = 0; k < rects.length; k++) {
          var mid = rects[k].top + rects[k].height / 2;
          if (k < from && y < mid) { target = k; break; }
          if (k > from && y > mid) target = k;
        }
        items.forEach(function (el, i) { el.classList.toggle('drop', i === target && target !== from); });
      }
      function finish(cancel) {
        grip.removeEventListener('pointermove', onMove); grip.removeEventListener('pointerup', onUp); grip.removeEventListener('pointercancel', onCancel);
        li.classList.remove('dragging'); li.style.transform = '';
        items.forEach(function (el) { el.classList.remove('drop'); });
        if (!cancel && target !== from) move(from, target);
      }
      function onUp() { finish(false); }
      function onCancel() { finish(true); }
      grip.addEventListener('pointermove', onMove); grip.addEventListener('pointerup', onUp); grip.addEventListener('pointercancel', onCancel);
    }
    function draw(focusIndex, dir) {
      var list = state.answers[q.id], focusEl = null;
      ul.textContent = '';
      list.forEach(function (id, i) {
        var item = itemById(src, id);
        var li = h('li', { class: 'rank-item' });
        var grip = h('span', { class: 'grip', 'aria-hidden': 'true', onpointerdown: function (e) { startDrag(e, li, i); } }, '≡');
        var up = h('button', { type: 'button', class: 'arrow', 'aria-label': 'Move ' + item.label + ' up', disabled: i === 0, onclick: function () { move(i, i - 1); } }, '↑');
        var down = h('button', { type: 'button', class: 'arrow', 'aria-label': 'Move ' + item.label + ' down', disabled: i === list.length - 1, onclick: function () { move(i, i + 1); } }, '↓');
        if (i === focusIndex) focusEl = (dir === 'down' && !down.disabled) || up.disabled ? down : up; // keep focus on the arrow they used
        li.appendChild(h('span', { class: 'rank-num' }, String(i + 1)));
        li.appendChild(grip); li.appendChild(optionLabel(item)); li.appendChild(h('span', { class: 'arrows' }, up, down));
        ul.appendChild(li);
      });
      if (focusEl) focusEl.focus({ preventScroll: true });
    }
    draw();
    return ul;
  }

  function singleBody(q, clearError) {
    var box = h('div', { class: 'choices' }), btns = [];
    var order = L.orderFor(q, state.seed);
    function refresh() { btns.forEach(function (b) { press(b, state.answers[q.id] === b._id); }); }
    order.forEach(function (id) {
      var item = itemById(q, id);
      var b = h('button', { type: 'button', class: 'choice', 'aria-pressed': 'false', onclick: function () {
        var next = L.toggleSingle(state.answers[q.id] === undefined ? null : state.answers[q.id], id);
        if (next === null) delete state.answers[q.id]; else state.answers[q.id] = next;
        refresh(); save(); clearError();
      } }, h('span', { class: 'tick', 'aria-hidden': 'true' }), optionLabel(item));
      b._id = id; btns.push(b); box.appendChild(b);
    });
    refresh();
    return box;
  }

  function multiBody(q, clearError) {
    var box = h('div', { class: 'choices' }), btns = [], otherWrap = h('div', { class: 'other' });
    var excl = q.exclusive || [];
    function cur() { return Array.isArray(state.answers[q.id]) ? state.answers[q.id] : []; }
    function refresh() {
      btns.forEach(function (b) { press(b, cur().indexOf(b._id) >= 0); });
      otherWrap.textContent = '';
      if (q.otherText && cur().indexOf('other') >= 0) {
        var inp = h('input', { type: 'text', class: 'input', maxlength: 120, placeholder: 'Tell us more (optional)', 'aria-label': 'Something else',
          value: state.answers[q.id + '_other'] || '', oninput: function (e) { state.answers[q.id + '_other'] = e.target.value; save(); } });
        otherWrap.appendChild(inp);
      }
    }
    q.items.forEach(function (item) {
      var b = h('button', { type: 'button', class: 'choice', 'aria-pressed': 'false', onclick: function () {
        var next = L.toggleMulti(cur(), item.id, excl);
        if (next.length) state.answers[q.id] = next; else delete state.answers[q.id];
        refresh(); save(); clearError();
      } }, h('span', { class: 'tick', 'aria-hidden': 'true' }), optionLabel(item));
      b._id = item.id; btns.push(b); box.appendChild(b);
    });
    refresh();
    return h('div', null, box, otherWrap);
  }

  function textBody(q, clearError) {
    var ta = h('textarea', { class: 'input area', rows: 5, maxlength: q.max || 1000, 'aria-label': q.title, value: state.answers[q.id] || '' });
    var count = h('p', { class: 'counter' });
    function upd() { count.textContent = ta.value.length + ' / ' + (q.max || 1000); }
    ta.addEventListener('input', function () { state.answers[q.id] = ta.value; save(); upd(); clearError(); });
    upd();
    return h('div', null, ta, count);
  }

  function contactBody(q, clearError) {
    var c = state.answers[q.id] = state.answers[q.id] || {};
    var wrap = h('div', { class: 'choices' }), emailBox = h('div', { class: 'other' }), yes, no, quote;
    function locked() { return !!(cfg.hasArrived && cfg.hasArrived(state.rid)); }   // the answers (including these two choices) are already saved and cannot be changed
    function refresh() {
      press(yes, c.try === 'yes'); press(no, c.try === 'no'); press(quote, c.quote === true);
      yes.disabled = no.disabled = quote.disabled = locked();
      emailBox.textContent = '';
      if (c.try === 'yes') {
        emailBox.appendChild(h('label', { class: 'field-label', for: 'email' }, 'Your email (only used to contact you about this)'));
        emailBox.appendChild(h('input', { id: 'email', type: 'text', class: 'input', inputmode: 'email', autocomplete: 'email', maxlength: 254, placeholder: 'you@example.com',
          value: c.email || '', oninput: function (e) { c.email = e.target.value; save(); clearError(); } }));
      }
    }
    function choose(v) { return function () { c.try = c.try === v ? undefined : v; if (c.try === undefined) delete c.try; if (c.try !== 'yes') delete c.email; refresh(); save(); clearError(); }; }
    yes = h('button', { type: 'button', class: 'choice', 'aria-pressed': 'false', onclick: choose('yes') }, h('span', { class: 'tick', 'aria-hidden': 'true' }), h('span', { class: 'opt-text' }, h('strong', null, 'Yes, I can try an early version')));
    no = h('button', { type: 'button', class: 'choice', 'aria-pressed': 'false', onclick: choose('no') }, h('span', { class: 'tick', 'aria-hidden': 'true' }), h('span', { class: 'opt-text' }, h('strong', null, 'No, thanks')));
    quote = h('button', { type: 'button', class: 'choice', 'aria-pressed': 'false', onclick: function () { if (c.quote) delete c.quote; else c.quote = true; refresh(); save(); } },
      h('span', { class: 'tick', 'aria-hidden': 'true' }), h('span', { class: 'opt-text' }, h('strong', null, "It's OK to quote my written answers anonymously")));
    wrap.appendChild(yes); wrap.appendChild(no); wrap.appendChild(emailBox); wrap.appendChild(quote);
    refresh();
    return wrap;
  }

  /* ---------- the example screens (the guided tour) ---------- */
  /* One example screen: a phone-shaped card of plain text with made-up numbers, and a line saying what it is for. Nothing in it is tappable. */
  function slideNode(slide) {
    var rows = slide.screen.map(function (l) {
      if (l.k === 'big') return h('span', { class: 'tp-big' }, l.t);
      if (l.k === 'label') return h('span', { class: 'tp-label' }, l.t);
      if (l.k === 'note') return h('span', { class: 'tp-note' }, l.t);
      if (l.k === 'row') return h('div', { class: 'tp-row' }, h('span', { class: 'tp-name' }, l.a), h('span', { class: 'tp-when' }, l.b), h('span', { class: 'tp-amt' }, l.c));
      if (l.k === 'bar') return h('svg', { viewBox: '0 0 200 6', class: 'tp-track', width: 200, height: 6, 'aria-hidden': 'true' }, h('rect', { width: 200, height: 6, class: 'tp-track-bg' }), h('rect', { width: Math.round(l.pct * 2), height: 6, class: 'tp-track-fill' }));
      if (l.k === 'spark') return h('svg', { viewBox: '0 0 200 50', class: 'tp-spark', width: 200, height: 50, 'aria-hidden': 'true' }, h('path', { d: l.d, class: 'tp-line', fill: 'none' }));
      return null;
    });
    return h('div', { class: 'tour-slide' },
      h('div', { class: 'tour-phone' }, h('span', { class: 'tp-brand' }, 'Finance Sense'), h('span', { class: 'tp-title' }, slide.title), rows),
      h('p', { class: 'tour-caption' }, slide.caption));
  }
  function tourBody() {
    var T = SV.tour || [], i = 0, prev, next, count = h('span', { class: 'tour-count' }), stage = h('div', { class: 'tour-stage', 'aria-live': 'polite' });
    function draw() {
      stage.textContent = ''; stage.appendChild(slideNode(T[i]));
      count.textContent = 'Example screen ' + (i + 1) + ' of ' + T.length;
      prev.disabled = i === 0; next.disabled = i === T.length - 1;
    }
    prev = btn('Previous screen', function () { if (i > 0) { i--; draw(); } }, 'ghost small');
    next = btn('Next screen', function () { if (i < T.length - 1) { i++; draw(); } }, 'ghost small');
    var box = h('div', { class: 'tour' }, stage, h('div', { class: 'tour-controls' }, prev, count, next));
    draw(); return box;
  }

  var BODIES = { grid: gridBody, pick: pickBody, rank: rankBody, single: singleBody, multi: multiBody, text: textBody, contact: contactBody, tour: tourBody };

  /* ---------- screens ---------- */
  function progress(q) {
    var pos = L.position(Q, state.answers, q.id);
    var fill = h('div', { class: 'bar-fill' });
    fill.style.width = Math.round(((pos.index + 1) / pos.total) * 100) + '%';
    return h('div', { class: 'progress' },
      h('div', { class: 'progress-top' }, h('span', null, q.part), h('span', null, q.type === 'tour' ? 'Example screens' : (pos.index + 1) + ' of ' + pos.total)),
      h('div', { class: 'bar', role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': pos.total, 'aria-valuenow': pos.index + 1, 'aria-label': 'Survey progress' }, fill));
  }

  function questionScreen(q) {
    var err = h('p', { class: 'error', role: 'alert' }), primary = null;
    if (state.notice) { err.textContent = state.notice; state.notice = null; }
    // The list of visible questions can change while this screen is open (the ranking screen only exists after three picks),
    // so it is always worked out again at the moment of the click, and the label is refreshed on every change.
    function here() { var ids = L.visibleIds(Q, state.answers); return { ids: ids, idx: ids.indexOf(q.id) }; }
    function label() { var w = here(); return w.idx === w.ids.length - 1 ? 'Finish' : 'Next'; }
    function clearError() { err.textContent = ''; if (primary && !state.sending) primary.textContent = label(); }
    var body = BODIES[q.type](q, clearError);
    function onBack(e) {
      if ((e && e.detail > 1) || state.sending || navLocked()) return;
      if (cfg.hasArrived && cfg.hasArrived(state.rid)) { err.textContent = 'Your answers were already saved, so they can no longer be changed. You can still fix your email below.'; return; }
      var w = here(); if (w.idx > 0) go(w.ids[w.idx - 1]); else { state.started = false; save(); render(true); }
    }
    function onNext(e) {
      if ((e && e.detail > 1) || state.sending || navLocked()) return;
      var v = L.validate(q, state.answers);
      if (!v.ok) { lastNav = -1e9; err.textContent = q.type === 'contact' && cfg.hasArrived && cfg.hasArrived(state.rid) ? 'Please fix the email address, or choose \u201cFinish without my email\u201d.' : v.msg; if (body._focusMissing) body._focusMissing(); else err.scrollIntoView({ block: 'center' }); return; }
      var w = here();
      if (w.idx === w.ids.length - 1) finish(); else go(w.ids[w.idx + 1]);
    }
    primary = btn(label(), onNext, 'primary');
    var nav = h('div', { class: 'nav' }, btn('Back', onBack, 'ghost'), primary);
    return h('main', { class: 'screen', id: 'main' }, progress(q),
      h('h1', { tabindex: '-1', id: 'title' }, q.title, q.required ? h('span', { class: 'req' }, 'Required') : null),
      q.help ? h('p', { class: 'help' }, q.help) : null, body, err, nav);
  }

  /* The banner above every screen: the app name and "Questionnaire". On the first screen it is a larger band that also says who sent it. */
  function banner(hero) {
    var B = SV.brand || {};
    var logo = h('svg', { viewBox: '0 0 32 32', class: 'logo', 'aria-hidden': 'true', width: 36, height: 36 },
      h('circle', { cx: 16, cy: 16, r: 16, class: 'logo-bg' }),
      h('path', { d: 'M7 21 L13 14 L18 18 L25 9', class: 'logo-line' }),
      h('path', { d: 'M20 9 L25 9 L25 14', class: 'logo-line' }));
    return h('header', { class: 'banner' + (hero ? ' hero' : '') },
      h('div', { class: 'banner-in' },
        h('div', { class: 'banner-row' },
          h('div', { class: 'brand' }, logo, h('div', { class: 'brand-text' }, h('span', { class: 'brand-name' }, B.name || 'Finance Sense'), h('span', { class: 'brand-tag' }, B.tag || 'Questionnaire'))),
          SV.session ? SV.session.slot() : null),   // Sign out shows here for anyone who is signed in
        hero && B.sentBy ? h('p', { class: 'sent' }, (B.sentLabel || 'Sent to you by') + ' ', h('strong', null, B.sentBy)) : null));
  }

  function introScreen() {
    var resuming = hasAnswers(), armed = false, armedAt = 0, peek = null, peekBtn = null;
    var peekBox = h('div', { class: 'peek' });
    function togglePeek() {   // an optional quick look at one example screen; the full set comes near the end
      var open = !!peek;
      peekBox.textContent = '';
      if (!open && SV.tour && SV.tour[0]) { peek = slideNode(SV.tour[0]); peekBox.appendChild(peek); peekBox.appendChild(h('p', { class: 'fine' }, 'One of ' + SV.tour.length + ' example screens, with made-up numbers. You will see them all near the end of the survey.')); }
      else peek = null;
      peekBtn.textContent = peek ? 'Hide the quick look' : 'Take a quick look at the dashboard first (optional)';
      peekBtn.setAttribute('aria-expanded', peek ? 'true' : 'false');
    }
    peekBtn = btn('Take a quick look at the dashboard first (optional)', togglePeek, 'ghost', { 'aria-expanded': 'false' });
    return h('main', { class: 'screen intro', id: 'main' },
      h('h1', { tabindex: '-1', id: 'title' }, SV.intro.title),
      h('p', { class: 'help' }, SV.intro.lead),
      h('ul', { class: 'points panel' }, SV.intro.points.map(function (p) { return h('li', null, p); })),
      SV.tour && SV.tour.length ? h('div', { class: 'stack' }, peekBtn, peekBox) : null,
      cfg.privacyNote ? h('section', { class: 'privacy' }, h('h2', null, 'Your privacy'), h('p', { class: 'fine' }, cfg.privacyNote)) : null,
      resuming ? h('div', { class: 'stack' },
        btn('Start over', function (e) {
          var b = e.currentTarget;
          if (!armed) { // first tap only asks; erasing can't be undone
            armed = true; armedAt = tick(); b.textContent = 'Tap again to erase all my answers'; say('Tap again to erase all my answers.');
            setTimeout(function () { armed = false; b.textContent = 'Start over'; }, 5000);
            return;
          }
          if (e.detail > 1 || tick() - armedAt < 600) return; // a double-tap arms but must not also erase
          clearSaved(); state = fresh(); state.started = true; state.qid = Q[0].id; save(); render(true);
        }, 'ghost')) : null,
      // the main button is pinned to the bottom of the screen (like Next on the questions) so it is always in reach
      h('div', { class: 'nav solo' }, btn(resuming ? 'Continue where I left off' : 'Start', function () {
        state.started = true; var ids = L.visibleIds(Q, state.answers);
        state.qid = ids.indexOf(state.qid) >= 0 ? state.qid : ids[0]; save(); render(true);
      }, 'primary big')));
  }

  function download(payload) {
    var blob = new root.Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    var url = root.URL.createObjectURL(blob), a = doc.createElement('a');
    a.href = url; a.download = 'finance-sense-survey-answers.json';
    doc.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { root.URL.revokeObjectURL(url); }, 1000);
  }

  function thanksScreen() {
    var payload = state.payload;
    return h('main', { class: 'screen', id: 'main' },
      h('h1', { tabindex: '-1', id: 'title' }, SV.thanks.title),
      h('p', { class: 'help' }, SV.thanks.body),
      state.sent ? null : h('div', { class: 'note', role: 'status' },
        h('p', null, 'Preview mode: your answers were not sent anywhere.'),
        cfg.showDownload ? btn('Download my answers', function () { download(payload); }, 'ghost') : null),
      btn('Start a new response', function () { clearSaved(); state = fresh(); render(true); }, 'link'));
  }

  function go(qid) { state.qid = qid; save(); render(true); }

  var attemptCounter = 0; // never reset, so an old attempt's id can't match a newer response
  function setBusy(on) {
    var b = mount.querySelector('.nav .primary');
    if (b) { b.disabled = on; b.textContent = on ? 'Sending...' : 'Finish'; }
    var s = mount.querySelector('.skip-email'); if (s) s.disabled = on;
    if (SV.session) SV.session.refresh();   // Sign out is disabled while sending
    // nothing may be edited while a send is running: what was captured is what goes out, so a late change would be silently lost
    Array.prototype.forEach.call(mount.querySelectorAll('input, textarea, select, .choice, .nav .ghost'), function (el) {
      if (on) { if (!el.disabled) { el.disabled = true; el._busyLocked = true; } }
      else if (el._busyLocked) { el.disabled = false; el._busyLocked = false; }
    });
  }
  function finish() {
    if (state.sending) return;
    var problems = L.validateAll(Q, state.answers); // never rely on only the screen being looked at
    if (problems.length) { state.notice = problems[0].msg; go(problems[0].id); return; }
    var payload = { v: 1, answers: L.sanitizeAnswers(Q, state.answers), meta: { id: state.rid, submittedAt: new Date().toISOString() } };
    var mine = ++attemptCounter; state.attempt = mine; state.timers = state.timers || [];
    function done(sent) { if (state.done) return; (state.timers || []).forEach(clearTimeout); state.timers = []; state.sending = false; state.sent = sent; state.payload = payload; state.done = true; clearSaved(); render(true); }
    if (typeof cfg.send !== 'function') { done(false); return; }
    state.sending = true; setBusy(true);
    var st = state, rid = state.rid, ctl = typeof root.AbortController === 'function' ? new root.AbortController() : null;
    var timer, timeout = new Promise(function (resolve, reject) { timer = setTimeout(function () { if (ctl) ctl.abort(); reject(new Error('timeout')); }, 15000); });   // giving up also stops the request
    state.timers.push(timer);
    var sent = Promise.resolve().then(function () { return cfg.send(payload, ctl ? ctl.signal : undefined); });
    // a send that succeeds late (after the timeout message) still completes the survey, but only THIS response: not one started after Start over
    sent.then(function () { clearTimeout(timer); if (state === st && state.rid === rid) done(true); }, function () { clearTimeout(timer); });
    Promise.race([sent, timeout]).then(function () { /* success handled above */ }, function (e) {
      if (state.done || mine !== state.attempt) return; // finished, or a newer attempt/response owns the screen now
      state.sending = false; setBusy(false);
      var again = mount.querySelector('.nav .primary'); if (again && !again.disabled) again.focus({ preventScroll: true });   // keyboard users land back on Finish
      var el = mount.querySelector('.error'), saved = (e && e.mainArrived) || (cfg.hasArrived && cfg.hasArrived(state.rid));
      if (el) el.textContent = e && e.busy ? 'Your first attempt is still going. Wait a few seconds, then try again.' : saved ? 'Your answers were saved, but we could not save your email. Try again, or finish without it.' : 'Sorry, that did not send. Please try again.';
      if (saved) Array.prototype.forEach.call(mount.querySelectorAll('.choice'), function (b) { b.disabled = true; });   // the answers (and these choices) are saved; only the email can still change
      var nav = mount.querySelector('.nav');
      if (saved && nav && !nav.querySelector('.skip-email')) nav.insertBefore(btn('Finish without my email', function () { if (!state.sending) done(true); }, 'ghost skip-email'), nav.lastChild);
    });
  }

  function render(focusTitle) {
    mount.textContent = '';
    var node;
    if (state.done) node = thanksScreen();
    else if (!state.started) node = introScreen();
    else {
      var ids = L.visibleIds(Q, state.answers);
      var q = Q.filter(function (x) { return x.id === state.qid && ids.indexOf(x.id) >= 0; })[0] || Q.filter(function (x) { return x.id === ids[0]; })[0];
      state.qid = q.id; node = questionScreen(q);
    }
    mount.appendChild(banner(!state.done && !state.started));
    mount.appendChild(node);
    if (focusTitle) { var t = doc.getElementById('title'); if (t) { t.focus({ preventScroll: true }); root.scrollTo(0, 0); } }
  }

  root.addEventListener('storage', function (e) {
    if (e.storageArea !== root.localStorage || (e.key !== cfg.storageKey && e.key !== null) || e.newValue !== null || state.done || state.sending) return;
    state = fresh(); render(true); say('This survey was changed in another window, so this page was reset.'); // otherwise typing here would re-save the finished answers
  });

  SV.busy = function () { return !!state.sending; };   // Sign out is disabled while the answers are being sent
  if (SV.session) SV.session.load();   // who is signed in, so the banner can show Sign out
  render(false);
})(typeof window !== 'undefined' ? window : globalThis);
