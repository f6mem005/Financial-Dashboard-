// Test harness only (never deployed): runs the real gate, login function and site files together the way Netlify will,
// with the site's real response headers from _headers. Usage: SESSION_SECRET=... SITE_PASSCODE=... node tests/gate-server.mjs 8913
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
globalThis.Netlify = { env: { get: (k) => process.env[k] } };
const { default: gate } = await import('../netlify/edge-functions/gate.ts');
const { default: login } = await import('../netlify/functions/login.mjs');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml' };
const siteHeaders = {};
for (const line of fs.readFileSync(path.join(root, '_headers'), 'utf8').split('\n')) { const m = line.match(/^\s+([A-Za-z-]+):\s*(.+)$/); if (m) siteHeaders[m[1].toLowerCase()] = m[2].trim(); }

function staticFile(urlPath) {
  const rel = decodeURIComponent(urlPath === '/' ? '/index.html' : urlPath);
  const file = path.join(root, rel);
  if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || fs.statSync(file).isDirectory() || /^\/(tests|netlify|node_modules|\.git)\b/.test(rel)) return new Response('Not found', { status: 404 });
  return new Response(fs.readFileSync(file), { status: 200, headers: { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream', ...siteHeaders } });
}

const server = http.createServer(async (nreq, nres) => {
  const chunks = []; for await (const c of nreq) chunks.push(c);
  const url = `http://${nreq.headers.host}${nreq.url}`, body = Buffer.concat(chunks);
  if (url.endsWith('/__test/passcode')) { process.env.SITE_PASSCODE = body.toString(); nres.writeHead(204).end(); return; }   // lets the test change the passcode
  const req = new Request(url, { method: nreq.method, headers: nreq.headers, body: ['GET', 'HEAD'].includes(nreq.method) ? undefined : body });
  const p = new URL(url).pathname;
  const res = p === '/auth/login' ? await login(req) : await gate(req, { next: async () => staticFile(p) });
  const headers = {}; res.headers.forEach((v, k) => { headers[k] = v; });
  const setCookie = res.headers.get('set-cookie'); if (setCookie) headers['set-cookie'] = setCookie;
  nres.writeHead(res.status, headers); nres.end(Buffer.from(await res.arrayBuffer()));
});
server.listen(Number(process.argv[2] || 8913), () => console.log('gate harness on', process.argv[2] || 8913));
