// Runs in front of EVERY request. No valid session cookie = the sign-in page and nothing else; the site's files are never sent.
// Fails closed: if the secrets are not configured, nobody gets in.
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
// Exactly the three things the sign-in page itself needs. Anything else, even under /auth/, needs a session.
const OPEN = ["/auth/login", "/auth/gate.js", "/auth/gate.css"];
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));

export function signInPage(configured: boolean) {
  const body = configured
    ? `<form id="f" class="gate-form" novalidate>
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

export default async (req: Request, context: { next: () => Promise<Response> }) => {
  const path = new URL(req.url).pathname;
  if (OPEN.includes(path)) return context.next();                   // the sign-in page's own files and the login function
  const configured = isConfigured();
  if (configured && (await readSession(req))) return context.next();
  return new Response(req.method === "HEAD" ? null : signInPage(configured), { status: configured ? 401 : 503, headers: HEADERS });
};

export const config = { path: "/*", excludedPath: OPEN };
