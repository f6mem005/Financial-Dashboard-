/* transfer.js - the "move to another device" screens: save a backup file, and restore from one.
   Nothing is uploaded. The file is read on this device only, checked by FD.backup (which re-validates every field),
   and shown as a short summary before anything on this device is replaced. */
(function (root) {
  'use strict';
  var FD = (root.FD = root.FD || {});
  var U = FD.util, h = U.h, UI = FD.ui;
  var doc = root.document;

  function download(text, name) {
    var blob = new Blob([text], { type: 'application/json' });
    var url = root.URL.createObjectURL(blob);
    var a = doc.createElement('a'); a.href = url; a.download = name;
    doc.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { root.URL.revokeObjectURL(url); }, 1000);
  }

  /* ---------- save a backup ---------- */
  function exportCard(app) {
    var S = app.S;
    if (S.mode !== 'real') return UI.card('Move to another device', h('p', { class: 'q-help' }, 'Set up Finance Sense with your own numbers first. Demo data can’t be saved to a file.'));
    var pass = h('input', { type: 'password', class: 'input', autocomplete: 'new-password', maxlength: 100, 'aria-label': 'Passphrase (optional)' });
    var msg = h('p', { class: 'hint', role: 'status' }), busy = false, go;
    pass.addEventListener('input', function () { go.textContent = pass.value ? 'Download locked backup' : 'Download backup'; });
    go = UI.btn('Download backup', function () {
      if (busy) return;
      busy = true; go.disabled = true; msg.textContent = pass.value ? 'Locking…' : '';
      FD.backup.make(app.S, pass.value).then(function (r) {
        download(r.text, 'finance-sense-backup-' + U.iso(app.now()) + (r.locked ? '-locked' : '') + '.json');
        msg.textContent = r.locked ? 'Saved. Keep the passphrase somewhere safe: without it the file can’t be opened.' : 'Saved. This file is not locked: anyone who gets it can read your numbers.';
        pass.value = ''; go.textContent = 'Download backup';
      }).catch(function (e) { msg.textContent = e && e.message ? e.message : 'Couldn’t make the backup.'; })
        .then(function () { busy = false; go.disabled = false; });
    }, 'ghost');
    return UI.card('Move to another device', h('div', { class: 'stack' },
      h('p', { class: 'q-help' }, 'Save a backup file, then open Finance Sense on your other device and choose “Restore from a backup”. Nothing is uploaded: the file is the only thing that travels. It is a snapshot, so anything you change afterwards isn’t in it.'),
      UI.field('Passphrase to lock the file (optional)', pass, 'At least 8 characters. Locked files are encrypted in your browser. If you forget the passphrase there is no way to open the file.'),
      go, msg));
  }

  /* ---------- restore from a backup ---------- */
  function restoreCard(app) {
    var file = h('input', { type: 'file', accept: '.json,application/json', class: 'input', 'aria-label': 'Choose a Finance Sense backup file' });
    var area = h('div', { class: 'stack' }), ticket = 0, found = null;

    function say(text, bad) { area.textContent = ''; area.appendChild(h('p', { class: bad ? 'bad' : 'hint', role: bad ? 'alert' : 'status' }, text)); }
    function preview(state) {
      var s = FD.backup.summary(state), mine = FD.store.hasData();   // anything saved on this device, from this tab or another
      area.textContent = '';
      area.appendChild(h('p', { class: 'summary-line' }, 'This backup has ' + s.transactions + ' transaction' + (s.transactions === 1 ? '' : 's') + ', ' + s.bills + ' bill' + (s.bills === 1 ? '' : 's') + ', ' + s.debts + ' debt' + (s.debts === 1 ? '' : 's') + ' and ' + s.goals + ' goal' + (s.goals === 1 ? '' : 's') + '.'));
      area.appendChild(h('p', { class: 'hint' }, (s.setupDone ? 'Setup was finished.' : 'Setup was not finished, so you will continue from the start of the questions.') + (s.latest ? ' Latest activity: ' + U.fmtDate(U.parseISO(s.latest)) + ', ' + s.latest.slice(0, 4) + '.' : '')));
      if (mine) area.appendChild(h('p', { class: 'note' }, 'This will replace the numbers saved on this device. If you want to keep them, save a backup of this device first.'));
      area.appendChild(UI.btn(mine ? 'Replace this device’s data with the backup' : 'Use this backup', function () {
        if (mine && !root.confirm('Replace the data saved on this device with this backup? This can’t be undone.')) return;
        app.replaceState(state);
      }, 'primary'));
    }
    function open(passphrase) {
      var mine = ++ticket;
      say('Opening…');
      FD.backup.open(found, passphrase).then(function (state) { if (mine === ticket) preview(state); },
        function (e) { if (mine === ticket) { say(e && e.message ? e.message : 'Couldn’t open that file.', true); if (found && found.locked) askPass().focus(); } });
    }
    function askPass() {
      var pass = h('input', { type: 'password', class: 'input', autocomplete: 'off', maxlength: 100, 'aria-label': 'Passphrase for this backup' });
      var b = UI.btn('Unlock', function () { var p = pass.value; pass.value = ''; open(p); }, 'primary');
      area.appendChild(UI.field('This backup is locked. Passphrase', pass));
      area.appendChild(b);
      return pass;
    }
    file.addEventListener('change', function () {
      var f = file.files && file.files[0], mine = ++ticket; found = null; area.textContent = '';
      if (!f) return;
      if (f.size > FD.backup.MAX_CHARS) { say('That file is too big to be a Finance Sense backup.', true); return; }
      var rd = new root.FileReader();
      rd.onload = function () {
        if (mine !== ticket) return;
        try { found = FD.backup.inspect(String(rd.result)); } catch (e) { say(e.message, true); return; }
        if (found.locked) { area.textContent = ''; askPass(); } else open('');
      };
      rd.onerror = function () { if (mine === ticket) say('Couldn’t read that file.', true); };
      rd.readAsText(f);
    });
    return h('div', { class: 'stack' },
      h('p', { class: 'q-help' }, 'Choose a backup file you saved from Finance Sense. It is opened on this device only.'),
      file, area);
  }

  FD.transfer = { exportCard: exportCard, restoreCard: restoreCard, download: download };
  if (typeof module !== 'undefined' && module.exports) module.exports = FD;
})(typeof window !== 'undefined' ? window : globalThis);
