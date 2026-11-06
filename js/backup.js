/* backup.js - move your data to another device: a backup file you can optionally lock with a passphrase.
   Nothing is uploaded anywhere. The file is the only thing that travels, and anything read back goes through the
   same validation as saved data (store.sanitize), so a damaged or hostile file cannot put bad data into the app. */
(function (root) {
  'use strict';
  var FD = (root.FD = root.FD || {});
  var U = FD.util;
  var PLAIN = 'finance-sense-backup', LOCKED = 'finance-sense-backup-locked';
  var MAX_CHARS = 8000000;                              // same ceiling as saved data
  var ITER = 600000, ITER_MIN = 100000, ITER_MAX = 1000000; // an untrusted file can't make us do unbounded work

  /* ---------- base64 (no external code) ---------- */
  function toB64(bytes) { var s = '', i; for (i = 0; i < bytes.length; i += 8192) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 8192)); return root.btoa(s); }
  function fromB64(str) {
    if (typeof str !== 'string' || str.length > MAX_CHARS * 2 || !/^[A-Za-z0-9+\/]*={0,2}$/.test(str)) throw new Error('This backup file is damaged.');
    var bin = root.atob(str), out = new Uint8Array(bin.length), i; for (i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i); return out;
  }
  function subtle() { var c = root.crypto; if (!c || !c.subtle) throw new Error('This browser cannot lock or unlock backups. You can still use a plain backup.'); return c.subtle; }
  function key(pass, salt, iter, usage) {
    var enc = new root.TextEncoder();
    return subtle().importKey('raw', enc.encode(String(pass).normalize('NFKC')), 'PBKDF2', false, ['deriveKey'])
      .then(function (base) { return subtle().deriveKey({ name: 'PBKDF2', salt: salt, iterations: iter, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, [usage]); });
  }

  /* ---------- making a backup ---------- */
  function wrap(state) {
    return { format: PLAIN, version: 1, exportedAt: new Date().toISOString(), state: JSON.parse(JSON.stringify(state)) };
  }
  /* A passphrase is optional. Without one the file is readable by anyone who gets it (it holds your numbers). */
  function make(state, passphrase) {
    var wrapped = wrap(state), text = JSON.stringify(wrapped, null, 2);
    if (!passphrase) return Promise.resolve({ text: text, locked: false });
    var pw = String(passphrase);
    if (Array.from(pw).length < 8 || pw.trim().length < 8 || new Set(Array.from(pw.normalize('NFKC'))).size < 4) return Promise.reject(new Error('Use at least 8 characters for the passphrase, not just spaces or one repeated character.'));
    var salt = root.crypto.getRandomValues(new Uint8Array(16)), iv = root.crypto.getRandomValues(new Uint8Array(12));
    return key(passphrase, salt, ITER, 'encrypt').then(function (k) {
      return subtle().encrypt({ name: 'AES-GCM', iv: iv, additionalData: new root.TextEncoder().encode(LOCKED) }, k, new root.TextEncoder().encode(text));
    }).then(function (buf) {
      var o = { format: LOCKED, version: 1, kdf: { name: 'PBKDF2-SHA256', iterations: ITER, salt: toB64(salt) }, cipher: { name: 'AES-256-GCM', iv: toB64(iv) }, data: toB64(new Uint8Array(buf)) };
      return { text: JSON.stringify(o, null, 2), locked: true };
    });
  }

  /* ---------- reading one back ---------- */
  /* Step 1: look at the file without opening it. Returns {locked, obj}. Throws a plain-English error for anything unusable. */
  function inspect(text) {
    if (typeof text !== 'string' || !text.trim()) throw new Error('That file is empty.');
    if (text.length > MAX_CHARS) throw new Error('That file is too big to be a Finance Sense backup.');
    var obj;
    try { obj = JSON.parse(text); } catch (e) { throw new Error('That is not a Finance Sense backup file.'); }
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) throw new Error('That is not a Finance Sense backup file.');
    if (obj.format === LOCKED) {
      var it = obj.kdf && obj.kdf.iterations;
      if (obj.version !== 1 || !obj.kdf || !obj.cipher || typeof it !== 'number' || it < ITER_MIN || it > ITER_MAX || typeof obj.data !== 'string' || typeof obj.kdf.salt !== 'string' || typeof obj.cipher.iv !== 'string') throw new Error('This backup file is damaged or from a newer version.');
      return { locked: true, obj: obj };
    }
    if (obj.format === PLAIN && obj.version === 1 && obj.state && typeof obj.state === 'object') return { locked: false, obj: obj.state };
    if (obj.v === 1 && (obj.answers !== undefined || obj.settings !== undefined)) return { locked: false, obj: obj };   // an older plain export (the app's raw saved data)
    throw new Error('That is not a Finance Sense backup file, or it is from a newer version.');
  }
  /* Step 2: open it (a passphrase if it is locked). Resolves with a CLEAN state, validated field by field. */
  function open(found, passphrase) {
    var done = function (raw) {
      var state = FD.store.sanitize(raw);
      if (state.mode !== 'real') throw new Error('That backup has no saved setup in it (it may be from the demo).');
      return state;
    };
    if (!found.locked) { try { return Promise.resolve(done(found.obj)); } catch (e) { return Promise.reject(e); } }
    var o = found.obj, salt, iv, data;
    try { salt = fromB64(o.kdf.salt); iv = fromB64(o.cipher.iv); data = fromB64(o.data); } catch (e) { return Promise.reject(e); }
    if (salt.length !== 16 || iv.length !== 12 || data.length < 17 || data.length > MAX_CHARS) return Promise.reject(new Error('This backup file is damaged.'));
    if (!passphrase) return Promise.reject(new Error('Enter the passphrase for this backup.'));
    return key(passphrase, salt, o.kdf.iterations, 'decrypt').then(function (k) {
      return subtle().decrypt({ name: 'AES-GCM', iv: iv, additionalData: new root.TextEncoder().encode(LOCKED) }, k, data);
    }).then(function (buf) {
      var inner = inspect(new root.TextDecoder().decode(buf));
      if (inner.locked) throw new Error('This backup file is damaged.');
      return done(inner.obj);
    }, function (e) {
      if (e && e.name === 'OperationError') throw new Error('Wrong passphrase, or the file was changed. Nothing was imported.');
      throw e;
    });
  }
  /* A short, plain summary to show before anything is replaced. */
  function summary(state) {
    var tx = state.transactions, last = tx.reduce(function (m, t) { return t.date > m ? t.date : m; }, '');
    return { transactions: tx.length, bills: (state.answers.bills || []).length, goals: (state.answers.goals || []).length, debts: (state.answers.debts || []).length,
      setupDone: !!state.onboarded, latest: last || null, balanceSet: !!state.settings.balanceSet };
  }

  FD.backup = { make: make, inspect: inspect, open: open, summary: summary, MAX_CHARS: MAX_CHARS, ITER: ITER };
  if (typeof module !== 'undefined' && module.exports) module.exports = FD;
})(typeof window !== 'undefined' ? window : globalThis);
