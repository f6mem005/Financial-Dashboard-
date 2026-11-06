#!/usr/bin/env node
// Command-line version of the results page: reads an export (CSV or JSON) and prints a Markdown report.
//   node results/analyze-cli.js export.csv > report.md
//   node results/analyze-cli.js export.csv --features features.csv --responses responses.csv
// Reads only the file you name. Sends nothing anywhere. Will not overwrite the file you are reading
// (even through a link or a different spelling of the name). Output files are created owner-only.
'use strict';
const fs = require('node:fs');
const path = require('node:path');
require('../js/logic.js'); require('../js/questions.js'); require('./analyze.js');
const A = globalThis.SV.analyze;

function fail(msg, code) { console.error(msg); process.exit(code || 1); }
const args = process.argv.slice(2), file = args[0];
if (!file || file.startsWith('--')) fail('Usage: node results/analyze-cli.js <export.csv|export.json> [--features out.csv] [--responses out.csv]', 2);

// Read the options strictly: only --features / --responses, each followed by a file name. Anything else is an error.
const out = { '--features': null, '--responses': null };
for (let i = 1; i < args.length; i++) {
  const a = args[i];
  if (!(a in out)) fail('Error: unexpected argument "' + a + '". Options are --features FILE and --responses FILE.', 2);
  const v = args[i + 1];
  if (!v || v.startsWith('-')) fail('Error: ' + a + ' needs a file name after it.', 2);
  if (out[a] !== null) fail('Error: ' + a + ' was given twice.', 2);
  out[a] = v; i++;
}
// Two names are "the same file" if they point at the same thing on disk (hard links, symbolic links, upper/lower-case
// spellings), or, for a file that does not exist yet, resolve to the same path.
function sameFile(a, b) {
  try { const x = fs.statSync(a), y = fs.statSync(b); return x.dev === y.dev && x.ino === y.ino; } catch (e) { /* one of them does not exist yet */ }
  return path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase();
}
try {
  const targets = Object.keys(out).filter((k) => out[k]).map((k) => out[k]);
  // check every output path BEFORE writing anything, so a mistake never leaves half the files written
  targets.forEach((t) => {
    if (sameFile(t, file)) fail('Error: refusing to overwrite the file you are reading (' + t + ').', 2);
    let st = null; try { st = fs.statSync(path.dirname(path.resolve(t))); } catch (e) { /* missing */ }
    if (!st || !st.isDirectory()) fail('Error: the folder for ' + t + ' does not exist.', 2);
    try { if (fs.statSync(t).isDirectory()) fail('Error: ' + t + ' is a folder.', 2); } catch (e) { /* does not exist: fine */ }
  });
  if (targets.length === 2 && sameFile(targets[0], targets[1])) fail('Error: --features and --responses must be different files.', 2);
  const st = fs.statSync(file);
  if (!st.isFile()) throw new Error('That is not a regular file.');                // directories, devices and pipes are refused
  if (st.size > 5000000) throw new Error('That file is too big (limit about 5 MB).');
  const result = A.analyze(fs.readFileSync(file, 'utf8'));
  // Write to a new file next to the target and swap it in. That gives owner-only permissions even if the target already
  // existed with looser ones, and replaces a link instead of writing through it.
  function save(target, text) {
    const tmp = target + '.tmp-' + process.pid;
    try { fs.writeFileSync(tmp, text, { mode: 0o600, flag: 'wx' }); fs.renameSync(tmp, target); }
    catch (e) { try { fs.unlinkSync(tmp); } catch (x) { /* nothing to clean */ } throw e; }
  }
  if (out['--features']) save(out['--features'], A.excelCsv(A.featuresCsv(result.stats)));
  if (out['--responses']) save(out['--responses'], A.excelCsv(A.responsesCsv(result.responses)));
  process.stdout.write(A.toMarkdown(result.stats, result.info));
} catch (e) { fail('Error: ' + e.message); }
