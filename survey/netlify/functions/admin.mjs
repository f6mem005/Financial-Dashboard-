// The admin's tools: list the people, add one with a passcode, give someone a new passcode, remove someone.
// Admin only. One exact path and a JSON action (no wildcard path), POST only, from this site's own pages only.
import { MIN_PASSCODE, isConfigured, readSession } from "../shared/auth.mjs";
import { createPerson, listPeople, publicView, removePerson, resetPasscode } from "../shared/people.mjs";
import { json, sameSiteOrigin, viaDefaultRoute } from "../shared/http.mjs";

const MAX_PASSCODE = 64;
const goodCode = (c) => typeof c === "string" && c.length >= MIN_PASSCODE && c.length <= MAX_PASSCODE && c.trim() === c;

export default async (req) => {
  if (viaDefaultRoute(req)) return json({ error: "Not found" }, 404);
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  if (!isConfigured()) return json({ error: "Not configured" }, 503);
  const s = await readSession(req);
  if (!s) return json({ error: "Sign in" }, 401);
  if (s.kind !== "admin") return json({ error: "Admins only" }, 403);
  if (!sameSiteOrigin(req)) return json({ error: "Bad request" }, 403);
  let text = ""; try { text = await req.text(); } catch { return json({ error: "Bad request" }, 400); }
  if (text.length > 4000) return json({ error: "Bad request" }, 413);   // the real body, not a header the client can leave out
  let b; try { b = JSON.parse(text); } catch { return json({ error: "Bad request" }, 400); }
  if (!b || typeof b !== "object") return json({ error: "Bad request" }, 400);
  try {
    if (b.action === "list") return json({ people: (await listPeople()).map(publicView) });
    if (b.action === "create") {
      if (!goodCode(b.passcode)) return json({ error: `The passcode needs ${MIN_PASSCODE} to ${MAX_PASSCODE} characters, with no space at either end.` }, 400);
      const r = await createPerson(b.name, b.passcode);
      if (r.error) return json({ error: r.error }, /already/.test(r.error) ? 409 : 400);
      return json({ person: publicView(r) }, 201);
    }
    if (b.action === "reset") {
      if (!goodCode(b.passcode)) return json({ error: `The passcode needs ${MIN_PASSCODE} to ${MAX_PASSCODE} characters, with no space at either end.` }, 400);
      const r = await resetPasscode(String(b.id ?? ""), b.passcode);
      return r ? json({ person: publicView(r) }) : json({ error: "Not found" }, 404);
    }
    if (b.action === "remove") return (await removePerson(String(b.id ?? ""))) ? json({ ok: true }) : json({ error: "Not found" }, 404);
  } catch { return json({ error: "Storage is unavailable right now. Try again in a moment." }, 503); }
  return json({ error: "Unknown action" }, 400);
};

export const config = { path: "/auth/admin", rateLimit: { windowLimit: 60, windowSize: 60, aggregateBy: ["ip", "domain"] } };
