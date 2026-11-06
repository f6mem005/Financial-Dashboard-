/* config.js - how finished surveys are handled.
   Preview mode (opened from a file or localhost): nothing is sent anywhere; the respondent can download their answers.
   On a real https site the answers go to the site's form service (Netlify Forms) via netlifySend below. */
(function (root) {
  'use strict';
  var SV = (root.SV = root.SV || {});
  var cfg = (SV.config = {
    showDownload: true,
    storageKey: 'fs-survey-v1',
    // Shown on the first screen when set: who runs the survey, how long answers are kept, how to ask for deletion.
    privacyNote: "Run by Finance Sense. Your answers are not linked to your name: each response gets a random code, and the site host (Netlify) may record technical details such as the time, IP address and browser type with it. To sign in you use the name and passcode from your invitation; they are kept separately from your answers and are never attached to them. The site sets one cookie, only to remember that you signed in. If you leave an email to try an early version, it is stored separately from your answers and used only to invite you; emails are deleted once invitations have gone out, or within 90 days of the survey closing, whichever comes first. Answers are kept for 90 days after the survey closes, then deleted. To ask for your answers or email to be removed, write to manny0569@gmail.com and include the email address you gave, or quote a sentence you wrote so the answer can be found."
  });

  // The form service only accepts plain form fields (no JSON). Resolves only if the server answers OK.
  // A request that takes longer than 20 seconds is cancelled, so it can't land after the person has been told it failed.
  // credentials 'same-origin': the only cookie is the site's sign-in session (HttpOnly, never readable here); it must accompany the post
  // or the sign-in gate in front of the site would refuse it. It is sent to this site only.
  // referrerPolicy is 'same-origin' on purpose: the form service's spam filter hides submissions that arrive with no referrer at all
  // (they are counted but never shown), and a same-origin referrer is only ever sent to this site itself, never to anyone else.
  function post(fields, signal) {
    var ctl = typeof root.AbortController === 'function' ? new root.AbortController() : null;
    var timer = ctl ? setTimeout(function () { ctl.abort(); }, 20000) : null;
    if (ctl && signal) { if (signal.aborted) ctl.abort(); else signal.addEventListener('abort', function () { ctl.abort(); }); }   // the screen gave up: stop the request too
    var opts = { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new root.URLSearchParams(fields).toString(), credentials: 'same-origin', referrerPolicy: 'same-origin' };
    if (ctl) opts.signal = ctl.signal;
    function clear() { if (timer) clearTimeout(timer); }
    return root.fetch('/', opts).then(function (r) { clear(); if (!r.ok) throw new Error('HTTP ' + r.status); }, function (e) { clear(); throw e; });
  }
  // The answers and the (optional) email are two separate submissions, so the answers stay anonymous.
  // On a retry, a part that already arrived is not sent again (so the same email can't land twice).
  var arrived = { main: Object.create(null), contact: Object.create(null) }, inflight = Object.create(null);
  // True once the answers for this response reached the server. From then on they can't be changed and re-sent.
  cfg.hasArrived = function (id) { return !!(id && arrived.main[id]); };
  cfg.netlifySend = function (payload, signal) {
    var L = SV.logic, id = payload && payload.meta && payload.meta.id;
    var main = L.toFields(SV.questions, payload), contact = L.toContactFields(payload), key = JSON.stringify([main, contact]);
    if (id && inflight[id]) {
      // the same retry while the first attempt is still running joins it, so nothing is sent twice; a DIFFERENT payload must not
      // silently ride on the old one (it could carry the old email or the old answers), so it is refused until the first attempt ends
      if (inflight[id].key === key) return inflight[id].p;
      var busy = new Error('busy'); busy.busy = true; return Promise.reject(busy);
    }
    var first = id && arrived.main[id] ? Promise.resolve() : post(main, signal).then(function () { if (id) arrived.main[id] = true; });
    var p = first.then(function () {
      if (!contact || (id && arrived.contact[id])) return null;
      return post(contact, signal).then(function () { if (id) arrived.contact[id] = true; }, function (e) { e.mainArrived = true; throw e; }); // the answers are safe; only the email failed
    });
    if (id) { inflight[id] = { key: key, p: p }; var clear = function () { delete inflight[id]; }; p.then(clear, clear); }
    return p;
  };
  // Only a real https site collects answers; a local file or localhost stays in preview mode.
  if (root.location && root.location.protocol === 'https:') cfg.send = cfg.netlifySend;
})(typeof window !== 'undefined' ? window : globalThis);
