// Copies the app's own code into survey/demo/app/ so the survey's demo page runs the REAL dashboard.
//   node survey/scripts/sync-demo.mjs        (run from the repo root; the copies are generated, never committed)
// The script list comes from the app's index.html, minus version.js and update.js (the demo has no update check). The demo page
// (survey/demo/index.html) must list exactly the same files in the same order; this script refuses to copy if it does not.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const survey = path.resolve(here, '..'), root = path.resolve(survey, '..');
const EXCLUDE = new Set(['js/version.js', 'js/update.js', 'js/theme.js']);   // no update check, and the demo has no Appearance choice (it follows the device)
const scriptsOf = (html, prefix) => [...html.matchAll(/<script src="([^"]+)"><\/script>/g)].map((m) => m[1]).filter((s) => s.startsWith(prefix));

const appIndex = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const want = scriptsOf(appIndex, 'js/').filter((s) => !EXCLUDE.has(s));
const demoIndex = fs.readFileSync(path.join(survey, 'demo', 'index.html'), 'utf8');
const have = scriptsOf(demoIndex, 'app/js/').map((s) => s.slice(4));
if (JSON.stringify(want) !== JSON.stringify(have)) {
  console.error('survey/demo/index.html does not list the same scripts as the app\'s index.html.\n app: ' + want.join(' ') + '\n demo: ' + have.join(' '));
  process.exit(1);
}
const out = path.join(survey, 'demo', 'app');
fs.rmSync(out, { recursive: true, force: true });
for (const rel of [...want, 'css/styles.css']) {
  const to = path.join(out, rel);
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(path.join(root, rel), to);
}
console.log('copied ' + (want.length + 1) + ' app files into survey/demo/app/');
