// Sign-in for the whole site, the same design as the Pari Passu app:
//   - an ADMIN passcode (a Netlify environment variable) and, for everyone else, a personal passcode the admin generates;
//   - personal passcodes are stored only as PBKDF2 hashes (never readable again); the admin passcode is compared through HMACs;
//   - a session is a signed cookie (HMAC-SHA256), HttpOnly, Secure, SameSite=Lax, tied to this site (SITE.id);
//   - changing the admin passcode signs every admin session out; resetting or removing a person's code signs that person out;
//   - it FAILS CLOSED: with SESSION_SECRET or ADMIN_PASSCODE missing (or too short) nobody can get in.
// The secrets live only in Netlify environment variables, never in this repo. Runs in Netlify Functions and Edge Functions.
import { SITE } from "./site.mjs";

const enc = new TextEncoder();
// "__Host-": the browser only accepts it from this exact site over HTTPS with Path=/, and no sibling subdomain can set or shadow it
export const COOKIE = "__Host-fs_gate";
export const SESSION_SECONDS = 60 * 60 * 24 * 14;   // a person: 14 days
export const ADMIN_SESSION_SECONDS = 60 * 60 * 12;   // the admin: 12 hours (a stolen admin cookie is the worst case)
export const MIN_PASSCODE = 8;   // same minimum as the Pari Passu app; the login is rate limited to 10 tries a minute per IP
const ITERATIONS = 100_000;

const b64url = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const fromB64url = (s) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));

async function hmac(secret, data) {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return b64url(await crypto.subtle.sign("HMAC", key, enc.encode(data)));
}
export function safeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export const secrets = () => ({ secret: Netlify.env.get("SESSION_SECRET") || "", admin: Netlify.env.get("ADMIN_PASSCODE") || "" });
// whitespace does not count: a blank-looking secret is not a secret
export const isConfigured = () => { const s = secrets(); return s.secret.trim().length >= 16 && s.admin.trim().length >= MIN_PASSCODE; };
export const randomId = () => b64url(crypto.getRandomValues(new Uint8Array(9)));

// ---- personal passcodes (PBKDF2, salted) ----
async function pbkdf2(passcode, salt, iter) {
  const key = await crypto.subtle.importKey("raw", enc.encode(passcode), "PBKDF2", false, ["deriveBits"]);
  return b64url(await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations: iter }, key, 256));
}
export async function hashPasscode(passcode) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return { salt: b64url(salt), hash: await pbkdf2(passcode, salt, ITERATIONS), iter: ITERATIONS };
}
export async function verifyPasscode(passcode, rec) {
  if (typeof passcode !== "string" || !rec) return false;
  return safeEqual(await pbkdf2(passcode, fromB64url(rec.salt), rec.iter), rec.hash);
}
// Used when the name is unknown, so the response time does not reveal which names exist.
export const DUMMY = { salt: "AAAAAAAAAAAAAAAAAAAAAA", hash: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA", iter: ITERATIONS };

// Compares HMACs of both values so length and content do not leak through timing.
export async function checkAdminPasscode(input) {
  const s = secrets();
  if (!isConfigured() || typeof input !== "string" || !input) return false;
  return safeEqual(await hmac(s.secret, `pc:${input}`), await hmac(s.secret, `pc:${s.admin}`));
}

// ---- session cookie ----
// An admin cookie carries a fingerprint of the current ADMIN_PASSCODE, so changing it signs every admin session out.
// A person cookie carries that person's `ver`, which the server checks against the stored record (so a reset or removal signs them out).
const adminVer = async (siteId) => (await hmac(secrets().secret, `adminver:${siteId}:${secrets().admin}`)).slice(0, 16);

// SameSite=Lax (not Strict): a link in an invitation email must still arrive signed in. Lax never sends the cookie on cross-site POSTs.
export async function makeCookie(session, nowMs = Date.now(), siteId = SITE.id) {
  const ttl = session.kind === "admin" ? ADMIN_SESSION_SECONDS : SESSION_SECONDS;
  const exp = Math.floor(nowMs / 1000) + ttl;
  const who = session.kind === "admin" ? `a::${await adminVer(siteId)}` : `p:${session.id}:${session.ver}`;
  const sig = await hmac(secrets().secret, `sess:${siteId}:${who}.${exp}`);
  return `${COOKIE}=${who}.${exp}.${sig}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${ttl}`;
}
export const clearCookie = () => `${COOKIE}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`;

// Checks the signature, the expiry and this site. For an admin it also checks the admin fingerprint.
// For a person it returns { kind: "person", id, ver }: the CALLER must still check `ver` against the stored record.
export async function readSession(req, nowMs = Date.now(), siteId = SITE.id) {
  if (!isConfigured()) return null;
  const raw = (req.headers.get("cookie") || "").split(/;\s*/).find((c) => c.startsWith(`${COOKIE}=`));
  if (!raw) return null;
  const [who, exp, sig] = raw.slice(COOKIE.length + 1).split(".");
  if (!who || !exp || !sig || !/^\d{1,12}$/.test(exp) || Number(exp) < nowMs / 1000) return null;
  if (!safeEqual(sig, await hmac(secrets().secret, `sess:${siteId}:${who}.${exp}`))) return null;
  const [kind, id, ver] = who.split(":");
  if (kind === "a") return !id && ver && safeEqual(ver, await adminVer(siteId)) ? { kind: "admin" } : null;
  if (kind === "p" && /^[A-Za-z0-9_-]{6,40}$/.test(id || "") && /^[A-Za-z0-9_-]{6,40}$/.test(ver || "")) return { kind: "person", id, ver };
  return null;
}
