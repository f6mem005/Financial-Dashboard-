// Runs in front of EVERY request. No valid session cookie = the sign-in page and nothing else; the site's files are never sent.
//  - a person's cookie is also checked against the stored record on page loads and posts, so a removed or reset code stops working at once;
//  - the /admin area needs an admin cookie;
//  - fails closed: if the secrets are not configured, nobody gets in.
import { isConfigured, readSession } from "../shared/auth.mjs";
import { SITE } from "../shared/site.mjs";

const HEADERS = {
  "content-type": "text/html; charset=utf-8",
  "cache-control": "private, no-store",
  "content-security-policy": "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; base-uri 'none'; form-action 'none'; object-src 'none'; frame-ancestors 'none'",
  "x-content-type-options": "nosniff",
  "x-frame-options": "DENY",
  "referrer-policy": "same-origin",
  "strict-transport-security": "max-age=31536000",
  "cross-origin-opener-policy": "same-origin",
  "cross-origin-resource-policy": "same-origin",
  "permissions-policy": "camera=(), microphone=(), geolocation=(), payment=()"
};
// Exactly what the sign-in page and the admin tools need. Anything else, even under /auth/, needs a session.
// (The four functions check their own sign-in; the two files are the sign-in page's script and style.)
const OPEN = ["/auth/login", "/auth/logout", "/auth/session", "/auth/admin", "/auth/gate.js", "/auth/gate.css"];
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));

export function signInPage(configured: boolean) {
  const body = configured
    ? `<form id="f" class="gate-form" novalidate>
        <label for="nm">${esc(SITE.nameLabel)}</label>
        <input id="nm" name="name" type="text" autocomplete="username" autocapitalize="none" spellcheck="false" maxlength="40" aria-describedby="nm-hint">
        <p class="hint" id="nm-hint">${esc(SITE.nameHint)}</p>
        <label for="pc">Passcode</label>
        <input id="pc" name="passcode" type="password" autocomplete="current-password" autocapitalize="none" spellcheck="false" maxlength="200" required>
        <button id="go" type="submit" class="go">Continue</button>
        <p id="err" class="err" role="alert"></p>
      </form>`
    : `<p class="err" role="alert">This site is not set up yet, so it cannot be opened right now.</p>`;
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex">
<title>${esc(SITE.title)}</title><link rel="stylesheet" href="/auth/gate.css"></head>
<body><header class="band"><div class="band-in"><svg viewBox="0 0 32 32" class="logo" aria-hidden="true" width="44" height="44"><circle cx="16" cy="16" r="16" class="logo-bg"/><path d="M7 21 L13 14 L18 18 L25 9" class="logo-line"/><path d="M20 9 L25 9 L25 14" class="logo-line"/></svg>
<div class="brand"><span class="brand-name">${esc(SITE.title)}</span><span class="brand-tag">${esc(SITE.tag)}</span></div></div></header>
<main class="gate"><h1>${esc(SITE.heading)}</h1><p class="blurb">${esc(SITE.blurb)}</p>${body}</main>
<script src="/auth/gate.js"></script></body></html>`;
}
const adminsOnly = () => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>${esc(SITE.title)}</title><link rel="stylesheet" href="/auth/gate.css"></head><body><main class="gate"><h1>Admins only</h1><p class="blurb">This part of the site is for the administrator.</p></main></body></html>`;

const decode = (s: string) => { try { return decodeURIComponent(s); } catch { return null; } };

// Every request from a person is checked against the stored record, so a removed or reset code stops working everywhere.
// A positive answer is remembered for a few seconds per cookie (in this server's memory only) to keep a page's many files fast,
// so a removal takes effect within CACHE_SECONDS, not instantly. A negative answer is never remembered.
let cacheSeconds = 10;
const checked = new Map<string, number>();
export const setCacheSeconds = (n: number) => { cacheSeconds = n; checked.clear(); };   // tests and the local harness turn it off
async function stillValid(req: Request) {
  const cookie = req.headers.get("cookie") || "", now = Date.now(), at = checked.get(cookie);
  if (cacheSeconds > 0 && at !== undefined && now - at < cacheSeconds * 1000) return true;
  try {
    const ok = (await fetch(new URL("/auth/session", req.url), { headers: { cookie } })).ok;
    if (ok && cacheSeconds > 0) { if (checked.size > 500) checked.clear(); checked.set(cookie, now); } else checked.delete(cookie);
    return ok;
  } catch { return false; }   // cannot check = not let in
}

export default async (req: Request, context: { next: () => Promise<Response> }) => {
  const path = new URL(req.url).pathname;
  if (OPEN.includes(path)) return context.next();
  const configured = isConfigured();
  const session = configured ? await readSession(req) : null;
  const refuse = () => new Response(req.method === "HEAD" ? null : signInPage(configured), { status: configured ? 401 : 503, headers: HEADERS });
  if (!session) return refuse();
  const decoded = decode(path), adminArea = decoded === null || /\/admin/i.test(decoded);   // a path that will not decode is treated as the admin area
  if (adminArea && session.kind !== "admin") return new Response(req.method === "HEAD" ? null : adminsOnly(), { status: 403, headers: HEADERS });
  if (session.kind === "person" && !(await stillValid(req))) return refuse();
  const res = await context.next();
  if (!adminArea) return res;
  const headers = new Headers(res.headers); headers.set("cache-control", "no-store");   // the admin page is never kept by the browser
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
};

export const config = { path: "/*", excludedPath: OPEN };
