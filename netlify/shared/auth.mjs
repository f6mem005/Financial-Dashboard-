// Sign-in for the whole site: one passcode (a secret environment variable) opens it. The same design as the Pari Passu app:
//   - the secrets live only in Netlify environment variables, never in this repo;
//   - a session is a signed cookie (HMAC-SHA256), HttpOnly, Secure, SameSite=Strict;
//   - the passcode is compared through HMACs of both values, so length and content do not leak through timing;
//   - changing the passcode signs every session out (the cookie carries a fingerprint of the passcode);
//   - the cookie is bound to this site (SITE.id), so a cookie from another site is refused even if the secrets were reused;
//   - it FAILS CLOSED: with SESSION_SECRET or SITE_PASSCODE missing (or too short) nobody can get in.
// Runs in Netlify Functions and Edge Functions (both provide Netlify.env and Web Crypto).
import { SITE } from "./site.mjs";

const enc = new TextEncoder();
export const COOKIE = "fs_gate";
export const SESSION_SECONDS = 60 * 60 * 24 * 14;
export const MIN_PASSCODE = 12;

const b64url = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

async function hmac(secret, data) {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return b64url(await crypto.subtle.sign("HMAC", key, enc.encode(data)));
}
function safeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export const secrets = () => ({ secret: Netlify.env.get("SESSION_SECRET") || "", passcode: Netlify.env.get("SITE_PASSCODE") || "" });
// whitespace does not count: a blank-looking secret is not a secret
export const isConfigured = () => { const s = secrets(); return s.secret.trim().length >= 16 && s.passcode.trim().length >= MIN_PASSCODE; };

export async function checkPasscode(input) {
  const s = secrets();
  if (!isConfigured() || typeof input !== "string" || !input) return false;
  return safeEqual(await hmac(s.secret, `pc:${input}`), await hmac(s.secret, `pc:${s.passcode}`));
}

// The cookie carries a fingerprint of the current passcode, so changing the passcode signs everyone out.
const version = async (siteId) => (await hmac(secrets().secret, `ver:${siteId}:${secrets().passcode}`)).slice(0, 16);

// SameSite=Lax (not Strict): a link in an invitation email must still arrive signed in. Lax never sends the cookie on cross-site POSTs.
export async function makeCookie(nowMs = Date.now(), siteId = SITE.id) {
  const exp = Math.floor(nowMs / 1000) + SESSION_SECONDS, ver = await version(siteId);
  const sig = await hmac(secrets().secret, `sess:${siteId}:${ver}.${exp}`);
  return `${COOKIE}=${ver}.${exp}.${sig}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${SESSION_SECONDS}`;
}
export const clearCookie = () => `${COOKIE}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`;

// True only for a cookie with a good signature, not expired, made under the CURRENT passcode.
export async function readSession(req, nowMs = Date.now(), siteId = SITE.id) {
  if (!isConfigured()) return false;
  const raw = (req.headers.get("cookie") || "").split(/;\s*/).find((c) => c.startsWith(`${COOKIE}=`));
  if (!raw) return false;
  const [ver, exp, sig] = raw.slice(COOKIE.length + 1).split(".");
  if (!ver || !exp || !sig || !/^\d{1,12}$/.test(exp) || Number(exp) < nowMs / 1000) return false;
  if (!safeEqual(sig, await hmac(secrets().secret, `sess:${siteId}:${ver}.${exp}`))) return false;
  return safeEqual(ver, await version(siteId));
}
