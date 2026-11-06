// Run on the folder that is about to be uploaded (NOT on the repo): writes this deploy's build id into js/version.js, index.html and /version.json.
//   node scripts/stamp-version.mjs <folder> [label]
// The id is the time plus the git commit (or the label). Open pages compare it with /version.json and offer a refresh when it changes.
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const dir = process.argv[2];
if (!dir || !fs.existsSync(path.join(dir, 'js'))) { console.error('Usage: node scripts/stamp-version.mjs <folder with js/> [label]'); process.exit(2); }
let sha = process.argv[3] || '';
if (!sha) { try { sha = execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); } catch { sha = 'local'; } }
sha = sha.replace(/[^A-Za-z0-9._-]/g, '').slice(0, 20) || 'local';
const build = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14) + '-' + sha;   // e.g. 20261106153000-287abfd
if (fs.existsSync(path.join(dir, '.git')) || fs.existsSync(path.join(dir, 'tests'))) { console.error('That looks like the repo, not a staging folder. Stamp the folder you are about to upload.'); process.exit(1); }
const file = path.join(dir, 'js', 'version.js');
const indexFile = path.join(dir, 'index.html'), index = fs.readFileSync(indexFile, 'utf8');
if (!/<meta name="build" content="dev">/.test(index)) { console.error('index.html does not contain the placeholder build meta tag'); process.exit(1); }
const src = fs.readFileSync(file, 'utf8');
if (!/\.build = 'dev'/.test(src)) { console.error('js/version.js does not contain the placeholder build id'); process.exit(1); }
fs.writeFileSync(file, src.replace(".build = 'dev'", `.build = '${build}'`));
fs.writeFileSync(indexFile, index.replace('<meta name="build" content="dev">', `<meta name="build" content="${build}">`));   // the page also carries its own build, so a mixed old/new load is noticed
fs.writeFileSync(path.join(dir, 'version.json'), JSON.stringify({ build }) + '\n');
console.log('stamped build', build);
