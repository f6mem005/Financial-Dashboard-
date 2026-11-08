/* The sign-in page's script: posts the name (blank for the admin) and passcode to /auth/login.
   A person's page reloads into the site; the admin goes to the admin tools. It also runs the Sign out button on the "Admins only" page. */
(function () {
  'use strict';
  // The "Admins only" page has a Sign out button (a signed-in person who opens the admin address would otherwise be stuck there).
  var so = document.getElementById('signout');
  if (so) so.addEventListener('click', function () {
    so.disabled = true;
    function done() { location.assign('/'); }
    fetch('/auth/logout', { method: 'POST', credentials: 'same-origin' }).then(done, done);
  });
  var form = document.getElementById('f'); if (!form) return;
  var nm = document.getElementById('nm'), pc = document.getElementById('pc'), go = document.getElementById('go'), err = document.getElementById('err'), busy = false;
  nm.focus();
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    if (busy) return;
    if (!pc.value) { err.textContent = 'Enter the passcode.'; pc.focus(); return; }
    busy = true; go.disabled = true; err.textContent = '';
    fetch('/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: nm.value, passcode: pc.value }), credentials: 'same-origin' })
      .then(function (r) {
        if (r.ok) { return r.json().then(function (j) { if (j && j.role === 'admin') location.assign('/admin/'); else location.reload(); }, function () { location.reload(); }); }
        err.textContent = r.status === 429 ? 'Too many tries. Wait a minute and try again.'
          : r.status === 503 ? 'Sign-in is not available right now. Try again in a moment.' : 'That name or passcode is not right.';
        busy = false; go.disabled = false; pc.value = ''; pc.focus();
      }, function () { err.textContent = 'Could not reach the server. Check your connection and try again.'; busy = false; go.disabled = false; pc.focus(); });
  });
})();
