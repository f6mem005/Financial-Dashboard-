import { checkPasscode, isConfigured, makeCookie } from "../shared/auth.mjs";

const json = (body, status = 200, headers = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store", ...headers } });

export default async (req) => {
  // refuse the default /.netlify/ route: it would bypass the rate limit that is attached to the public /auth/login path
  // (blocks only that prefix, rather than demanding an exact path, so a difference in the URL the platform reports can never lock everyone out)
  if (new URL(req.url).pathname.startsWith("/.netlify/")) return json({ error: "Not found" }, 404);
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  if (!isConfigured()) return json({ error: "Sign-in is not configured yet." }, 503);
  // only this site's own page may sign in (a page on another site cannot post a passcode here)
  const origin = req.headers.get("origin");
  try { if (origin && new URL(origin).host !== new URL(req.url).host) return json({ error: "Bad request" }, 403); } catch { return json({ error: "Bad request" }, 400); }
  if (Number(req.headers.get("content-length") || 0) > 2000) return json({ error: "Bad request" }, 413);
  let passcode = "";
  try { passcode = String((await req.json()).passcode ?? ""); } catch { return json({ error: "Bad request" }, 400); }
  if (!passcode || passcode.length > 200) return json({ error: "Incorrect passcode" }, 401);
  if (!(await checkPasscode(passcode))) return json({ error: "Incorrect passcode" }, 401);
  return json({ ok: true }, 200, { "set-cookie": await makeCookie() });
};

export const config = {
  path: "/auth/login",
  // Brute-force guard: 10 attempts per minute per IP, as in the Pari Passu app.
  rateLimit: { windowLimit: 10, windowSize: 60, aggregateBy: ["ip", "domain"] }
};
