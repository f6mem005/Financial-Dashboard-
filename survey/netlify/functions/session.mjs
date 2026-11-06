// "Is this cookie still good?" The gate asks this for page loads, so a removed or reset person is locked out at once.
import { clearCookie, isConfigured, readSession, safeEqual } from "../shared/auth.mjs";
import { getPerson } from "../shared/people.mjs";
import { json, viaDefaultRoute } from "../shared/http.mjs";

export default async (req) => {
  if (viaDefaultRoute(req)) return json({ error: "Not found" }, 404);
  if (req.method !== "GET") return json({ error: "Method not allowed" }, 405);
  if (!isConfigured()) return json({ error: "Not configured" }, 503);
  const s = await readSession(req);
  if (!s) return json({ error: "Sign in" }, 401);
  if (s.kind === "admin") return json({ role: "admin" });
  let person = null;
  try { person = await getPerson(s.id); } catch { return json({ error: "Unavailable" }, 503); }
  if (!person || !safeEqual(person.ver, s.ver)) return json({ error: "Sign in" }, 401, { "set-cookie": clearCookie() });   // passcode reset or person removed
  return json({ role: "person", name: person.name });
};

export const config = { path: "/auth/session" };
