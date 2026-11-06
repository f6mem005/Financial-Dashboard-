/* The sign-in page's script: posts the passcode to /auth/login; on success the page reloads and the site opens. */
(function () {
  'use strict';
  var form = document.getElementById('f'); if (!form) return;
  var pc = document.getElementById('pc'), go = document.getElementById('go'), err = document.getElementById('err'), busy = false;
  pc.focus();
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    if (busy) return;
    if (!pc.value) { err.textContent = 'Enter the passcode.'; pc.focus(); return; }
    busy = true; go.disabled = true; err.textContent = '';
    fetch('/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ passcode: pc.value }), credentials: 'same-origin' })
      .then(function (r) {
        if (r.ok) { location.reload(); return; }
        err.textContent = r.status === 429 ? 'Too many tries. Wait a minute and try again.'
          : r.status === 503 ? 'Sign-in is not set up yet.' : 'That passcode is not right.';
        busy = false; go.disabled = false; pc.value = ''; pc.focus();
      }, function () { err.textContent = 'Could not reach the server. Check your connection and try again.'; busy = false; go.disabled = false; pc.focus(); });
  });
})();
