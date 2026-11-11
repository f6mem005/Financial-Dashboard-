'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
globalThis.FD = globalThis.FD || {};
require('../js/util.js'); require('../js/charts.js');
const { shortMoney } = globalThis.FD.charts;

test('shortMoney: plain dollars, k, M and B (axis labels must stay short for any amount)', () => {
  assert.equal(shortMoney(0), '$0'); assert.equal(shortMoney(999), '$999'); assert.equal(shortMoney(1500), '$1.5k'); assert.equal(shortMoney(10000), '$10k');
  assert.equal(shortMoney(999999), '$1000k'); // just under a million still reads in k
  assert.equal(shortMoney(1000000), '$1M'); assert.equal(shortMoney(2500000), '$2.5M'); assert.equal(shortMoney(200000000), '$200M');
  assert.equal(shortMoney(1500000000), '$1.5B'); assert.equal(shortMoney(-2500000), '-$2.5M');
  assert.ok(shortMoney(7e14).length <= 10, 'even absurd amounts stay short');
});
