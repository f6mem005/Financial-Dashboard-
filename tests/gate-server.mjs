// Test harness only (never deployed): runs the real gate, the real sign-in functions and the site files together the way
// Netlify will, with an in-memory stand-in for Netlify Blobs and the site's real response headers from _headers.
// Usage: SESSION_SECRET=... ADMIN_PASSCODE=... node tests/gate-server.mjs 8913
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fakeStore } from './fake-store.mjs';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
globalThis.Netlify = { env: { get: (k) => process.env[k] } };
const { setStore } = await import('../netlify/shared/people.mjs');
setStore(fakeStore());
const { default: gate, setCacheSeconds } = await import('../netlify/edge-functions/gate.ts');
setCacheSeconds(0);   // the browser test checks that removal and reset take effect on the very next request
const fns = {
  '/auth/login': (await import('../netlify/functions/login.mjs')).default,
  '/auth/logout': (await import('../netlify/functions/logout.mjs')).default,
  '/auth/session': (await import('../netlify/functions/session.mjs')).default,
  '/auth/admin': (await import('../netlify/functions/admin.mjs')).default
};
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
const siteHeaders = {};
for (const line of fs.readFileSync(path.join(root, '_headers'), 'utf8').split('\n')) { const m = line.match(/^\s+([A-Za-z-]+):\s*(.+)$/); if (m) siteHeaders[m[1].toLowerCase()] = m[2].trim(); }

function staticFile(urlPath, method = 'GET') {
  if (method === 'POST') return new Response('ok', { status: 200 });   // stands in for the form service (survey)
  let rel = decodeURIComponent(urlPath); if (rel.endsWith('/')) rel += 'index.html';
  const file = path.join(root, rel);
  if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || fs.statSync(file).isDirectory() || /^\/(tests|netlify|node_modules|\.git)\b/.test(rel)) return new Response('Not found', { status: 404 });
  return new Response(fs.readFileSync(file), { status: 200, headers: { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream', ...siteHeaders } });
}

const server = http.createServer(async (nreq, nres) => {
  const chunks = []; for await (const c of nreq) chunks.push(c);
  const url = `http://${nreq.headers.host}${nreq.url}`, body = Buffer.concat(chunks);
  if (url.endsWith('/__test/admin-passcode')) { process.env.ADMIN_PASSCODE = body.toString(); nres.writeHead(204).end(); return; }   // lets a test change the admin passcode
  const req = new Request(url, { method: nreq.method, headers: nreq.headers, body: ['GET', 'HEAD'].includes(nreq.method) ? undefined : body });
  const p = new URL(url).pathname;
  const res = fns[p] ? await fns[p](req) : await gate(req, { next: async () => staticFile(p, req.method) });
  const headers = {}; res.headers.forEach((v, k) => { headers[k] = v; });
  const setCookie = res.headers.get('set-cookie'); if (setCookie) headers['set-cookie'] = setCookie;
  nres.writeHead(res.status, headers); nres.end(Buffer.from(await res.arrayBuffer()));
});
server.listen(Number(process.argv[2] || 8913), () => console.log('gate harness on', process.argv[2] || 8913));
