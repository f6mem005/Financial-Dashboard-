'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const mem = () => { const m = new Map(); return { m, getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };
globalThis.FD = globalThis.FD || {};
['util', 'catalog', 'config', 'engine', 'store'].forEach((m) => require('../js/' + m + '.js'));
const load = () => { delete require.cache[require.resolve('../js/theme.js')]; require('../js/theme.js'); return globalThis.FD.theme; };

test('theme: only light or dark is ever accepted; anything else means "match my device" and nothing is stored', () => {
  for (const bad of ['Dark', 'dark ', '<img src=x onerror=alert(1)>', '', 'auto', '1', '__proto__']) {
    globalThis.localStorage = mem(); globalThis.localStorage.setItem('fd.theme', bad);
    assert.equal(load().get(), 'auto', 'stored ' + JSON.stringify(bad));
  }
  globalThis.localStorage = mem(); const T = load();
  assert.equal(T.set('dark'), 'dark'); assert.equal(globalThis.localStorage.getItem('fd.theme'), 'dark');
  assert.equal(T.set('<script>'), 'auto'); assert.equal(globalThis.localStorage.getItem('fd.theme'), null, 'a bad word is treated as "match my device" and clears the key');
  assert.equal(T.set('light'), 'light'); assert.equal(T.set('auto'), 'auto'); assert.equal(globalThis.localStorage.getItem('fd.theme'), null);
  assert.deepEqual(T.MODES, ['auto', 'light', 'dark']);
  delete globalThis.localStorage;
});
test('theme: a browser that will not store it still switches for this visit, and nothing throws', () => {
  globalThis.localStorage = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); }, removeItem() { throw new Error('blocked'); } };
  const T = load(); assert.equal(T.get(), 'auto'); assert.equal(T.set('dark'), 'dark'); assert.equal(T.get(), 'dark'); assert.equal(T.set('auto'), 'auto');
  delete globalThis.localStorage;
});
test('theme is a display preference, not data: it is not "saved data" and "Delete all my data" leaves it alone', () => {
  globalThis.localStorage = mem(); globalThis.localStorage.setItem('fd.theme', 'dark');
  assert.equal(globalThis.FD.store.hasData(), false, 'only the theme is stored: no saved data');
  assert.equal(globalThis.FD.store.hasBackups(), false);
  globalThis.localStorage.setItem('fd.v1', JSON.stringify({ v: 1, mode: 'real', onboarded: true }));
  assert.equal(globalThis.FD.store.hasData(), true);
  globalThis.FD.store.clear();
  assert.equal(globalThis.localStorage.getItem('fd.v1'), null); assert.equal(globalThis.localStorage.getItem('fd.theme'), 'dark', 'the choice survives');
  delete globalThis.localStorage;
});
