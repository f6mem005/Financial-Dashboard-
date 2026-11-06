/* Admin tools: add a person with a generated passcode, give someone a new passcode, remove someone.
   Everything is drawn with textContent (no innerHTML). A passcode is shown once, here, when it is made; only a hash is stored. */
(function () {
  'use strict';
  var app = document.getElementById('app');
  var state = { people: [], loaded: false, reveal: null, msg: '', bad: false, busy: false, name: '', code: '', focus: '' };
  document.getElementById('site-name').textContent = location.hostname;
  var OFFLINE = 'Could not reach the server. Check your connection and try again.';

  // Easy to say and remember: 3 consonant+vowel syllables and 2 digits, 8 characters, e.g. "rakobu47".
  // Letters that are easy to confuse (l, q, w, x, y, c, j) are left out. (Same generator as the Pari Passu app.)
  function pick(set) { return set.charAt(crypto.getRandomValues(new Uint32Array(1))[0] % set.length); }
  function makePasscode() {
    var out = '';
    for (var i = 0; i < 3; i++) out += pick('bdfghkmnprstvz') + pick('aeiou');
    return out + pick('23456789') + pick('23456789');
  }

  function h(tag, attrs) {
    var el = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      var v = attrs[k]; if (v === null || v === undefined || v === false) return;
      if (k === 'onclick' || k === 'onsubmit' || k === 'oninput') el.addEventListener(k.slice(2), v);
      else if (k === 'value') el.value = v;
      else el.setAttribute(k, v === true ? '' : String(v));
    });
    for (var i = 2; i < arguments.length; i++) { var c = arguments[i]; if (c === null || c === undefined || c === false) continue; el.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); }
    return el;
  }

  // never rejects: a network failure comes back as { ok: false } with a plain message
  function call(action, extra) {
    var body = Object.assign({ action: action }, extra || {});
    return fetch('/auth/admin', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), credentials: 'same-origin' })
      .then(function (r) {
        return r.json().then(function (j) { return j; }, function () { return {}; }).then(function (j) {
          // signed out, or not an admin: go to the sign-in. Any other refusal (e.g. "Bad request") is shown as a message, never a silent redirect.
          if (r.status === 401 || (r.status === 403 && j.error === 'Admins only')) { location.assign('/'); return new Promise(function () {}); }
          return { ok: r.ok, status: r.status, body: j };
        });
      }, function () { return { ok: false, status: 0, body: { error: OFFLINE } }; });
  }
  function say(text, bad) { state.msg = text; state.bad = !!bad; }
  function date(iso) { var d = new Date(iso); return isNaN(d) ? '' : d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }); }

  // one action at a time; the button always comes back, whatever happens
  function run(fn) {
    if (state.busy) return;
    state.busy = true;
    Array.prototype.forEach.call(app.querySelectorAll('button'), function (b) { b.disabled = true; });   // show that something is happening
    Promise.resolve().then(fn).catch(function () { say(OFFLINE, true); state.focus = 'msg'; }).then(function () { state.busy = false; render(); });
  }
  // `silent`: the caller draws the page once, when its own work is finished (so focus is not lost to a second redraw)
  function refresh(silent) {
    return call('list').then(function (r) {
      state.loaded = true;
      if (r.ok) state.people = r.body.people || []; else { say(r.body.error || 'Could not load the list.', true); }
      if (!silent) render();
    });
  }

  function add() {
    var name = state.name, code = state.code;   // what is SENT is what is shown and cleared, even if the boxes change while the request runs
    run(function () {
      return call('create', { name: name, passcode: code }).then(function (r) {
        if (!r.ok) { say(r.body.error || 'Could not add that person.', true); state.focus = 'msg'; return; }
        state.reveal = { name: r.body.person.name, code: code, what: 'added' };
        if (state.name === name) state.name = '';
        if (state.code === code) state.code = '';
        say('', false); state.focus = 'reveal';
        return refresh(true);
      });
    });
  }
  function newCode(p) {
    var code = makePasscode();
    run(function () {
      return call('reset', { id: p.id, passcode: code }).then(function (r) {
        if (!r.ok) { say(r.body.error || 'Could not change that passcode.', true); state.focus = 'msg'; return; }
        state.reveal = { name: p.name, code: code, what: 'new code' }; say('', false); state.focus = 'reveal';
        return refresh(true);
      });
    });
  }
  function remove(p) {
    if (state.busy || !confirm('Remove ' + p.name + '? They will be signed out and their passcode stops working.')) return;
    run(function () {
      return call('remove', { id: p.id }).then(function (r) {
        if (r.ok && state.reveal && state.reveal.name === p.name) state.reveal = null;
        say(r.ok ? p.name + ' was removed.' : (r.body.error || 'Could not remove that person.'), !r.ok); state.focus = 'msg';
        return refresh(true);
      });
    });
  }
  function copy(code) {
    var done = function (t, bad) { say(t, bad); state.focus = 'msg'; render(); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(code).then(function () { done('Copied.', false); }, function () { done('Could not copy. Select the code and copy it by hand.', true); });
    else done('Select the code and copy it by hand.', true);
  }

  function render() {
    app.textContent = '';
    if (state.reveal) {
      var rv = state.reveal;
      app.appendChild(h('section', { class: 'reveal', 'aria-label': 'New passcode', id: 'reveal', tabindex: '-1' },
        h('p', null, rv.what === 'added' ? rv.name + ' was added. Give them this passcode now:' : rv.name + ' has a new passcode. Give it to them now:'),
        h('p', { class: 'code mono', id: 'revealed-code' }, rv.code),
        h('p', { class: 'person-meta' }, 'This is the only time it is shown. It is stored scrambled and cannot be read again. They sign in with their name and this passcode.'),
        h('div', { class: 'person-actions' },
          h('button', { type: 'button', class: 'btn primary', id: 'copy', onclick: function () { copy(rv.code); } }, 'Copy passcode'),
          h('button', { type: 'button', class: 'btn', id: 'done', onclick: function () { state.reveal = null; say('', false); state.focus = 'name'; render(); } }, 'Done'))));
    }
    var nameInput = h('input', { id: 'new-name', type: 'text', maxlength: 40, autocomplete: 'off', spellcheck: 'false', value: state.name, oninput: function (e) { state.name = e.target.value; } });
    var codeInput = h('input', { id: 'new-code', type: 'text', maxlength: 64, autocomplete: 'off', spellcheck: 'false', class: 'mono', 'aria-describedby': 'code-help', value: state.code, oninput: function (e) { state.code = e.target.value; } });
    app.appendChild(h('form', { class: 'panel', id: 'add-form', novalidate: true, onsubmit: function (e) { e.preventDefault(); add(); } },
      h('h2', null, 'Add a person'),
      h('div', { class: 'field' }, h('label', { for: 'new-name' }, 'Name'), nameInput),
      h('div', { class: 'row' },
        h('div', { class: 'field' }, h('label', { for: 'new-code' }, 'Passcode'), codeInput),
        h('button', { type: 'button', class: 'btn', id: 'generate', onclick: function () { state.code = makePasscode(); codeInput.value = state.code; codeInput.focus(); } }, 'Generate')),
      h('p', { class: 'person-meta', id: 'code-help' }, 'Press Generate for an easy 8-character code like rakobu47, or type your own (8 or more characters).'),
      h('button', { type: 'submit', class: 'btn primary', id: 'add', disabled: state.busy }, 'Add person'),
      h('p', { class: 'msg' + (state.bad ? ' bad' : ''), id: 'msg', role: 'status', tabindex: '-1' }, state.msg)));
    var list = h('ul', { class: 'people', id: 'people' });
    state.people.forEach(function (p) {
      list.appendChild(h('li', { class: 'person' },
        h('div', null, h('div', { class: 'person-name' }, p.name), h('div', { class: 'person-meta' }, 'Added ' + date(p.created) + (p.updatedAt !== p.created ? ' · code changed ' + date(p.updatedAt) : ''))),
        h('div', { class: 'person-actions' },
          h('button', { type: 'button', class: 'btn small', onclick: function () { newCode(p); }, 'aria-label': 'New passcode for ' + p.name, disabled: state.busy }, 'New passcode'),
          h('button', { type: 'button', class: 'btn small danger', onclick: function () { remove(p); }, 'aria-label': 'Remove ' + p.name, disabled: state.busy }, 'Remove'))));
    });
    app.appendChild(h('section', { class: 'panel' }, h('h2', null, 'People' + (state.loaded ? ' (' + state.people.length + ')' : '')),
      !state.loaded ? h('p', { class: 'empty' }, 'Loading…')
        : state.people.length ? list : h('p', { class: 'empty' }, 'No one yet. Add a person above and give them their name and passcode.')));
    var target = { msg: 'msg', reveal: 'reveal', name: 'new-name' }[state.focus]; state.focus = '';
    if (target) { var el = document.getElementById(target); if (el) el.focus({ preventScroll: false }); }
  }

  document.getElementById('signout').addEventListener('click', function () {
    fetch('/auth/logout', { method: 'POST', credentials: 'same-origin' }).then(function () { location.assign('/'); }, function () { location.assign('/'); });
  });
  // a page restored from the back/forward cache starts fresh (so no button is left disabled from before)
  window.addEventListener('pageshow', function (e) { if (e.persisted) location.reload(); });
  render(); refresh();
})();
