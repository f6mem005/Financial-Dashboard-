import { DUMMY, checkAdminPasscode, isConfigured, makeCookie, verifyPasscode } from "../shared/auth.mjs";
import { findByName, getPerson } from "../shared/people.mjs";
import { json, sameSiteOrigin, viaDefaultRoute } from "../shared/http.mjs";

const DENIED = "Incorrect name or passcode";

export default async (req) => {
  if (viaDefaultRoute(req)) return json({ error: "Not found" }, 404);
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  if (!isConfigured()) return json({ error: "Sign-in is not configured yet." }, 503);
  // only this site's own page may sign in (a page on another site cannot post a passcode here)
  const origin = req.headers.get("origin");
  if (origin && !sameSiteOrigin(req)) return json({ error: "Bad request" }, 403);
  let text = "";
  try { text = await req.text(); } catch { return json({ error: "Bad request" }, 400); }
  if (text.length > 2000) return json({ error: "Bad request" }, 413);   // the real body, not a header the client can leave out
  let name = "", passcode = "";
  try { const b = JSON.parse(text); name = String(b.name ?? "").trim(); passcode = String(b.passcode ?? ""); } catch { return json({ error: "Bad request" }, 400); }
  if (!passcode || passcode.length > 200 || name.length > 200) return json({ error: DENIED }, 401);

  // A blank name means the admin passcode.
  if (!name) {
    if (!(await checkAdminPasscode(passcode))) return json({ error: DENIED }, 401);
    return json({ role: "admin" }, 200, { "set-cookie": await makeCookie({ kind: "admin" }) });
  }
  let person = null;
  try { person = await findByName(name); if (!person) await getPerson("unknown-name0"); } catch { return json({ error: "Sign-in is unavailable right now. Try again in a moment." }, 503); }
  const ok = await verifyPasscode(passcode, person ?? DUMMY);   // always does the work, even for unknown names
  if (!person || !ok) return json({ error: DENIED }, 401);
  return json({ role: "person", name: person.name }, 200, { "set-cookie": await makeCookie({ kind: "person", id: person.id, ver: person.ver }) });
};

export const config = {
  path: "/auth/login",
  // Brute-force guard: 10 attempts per minute per IP, as in the Pari Passu app.
  rateLimit: { windowLimit: 10, windowSize: 60, aggregateBy: ["ip", "domain"] }
};
