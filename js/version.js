/* version.js - which build of the site this page came from. The value here is only a placeholder: the deploy step
   (scripts/stamp-version.mjs) writes the real build id into the files it uploads, and writes the same id to /version.json.
   js/update.js compares the two to tell people when a newer version is live. */
(function (root) {
  'use strict';
  (root.FD = root.FD || {}).build = 'dev';
})(typeof window !== 'undefined' ? window : globalThis);
