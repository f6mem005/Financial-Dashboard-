import { clearCookie } from "../shared/auth.mjs";
import { json, sameSiteOrigin, viaDefaultRoute } from "../shared/http.mjs";

export default async (req) => {
  if (viaDefaultRoute(req)) return json({ error: "Not found" }, 404);
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  if (!sameSiteOrigin(req)) return json({ error: "Bad request" }, 403);
  return json({ ok: true }, 200, { "set-cookie": clearCookie() });
};

export const config = { path: "/auth/logout" };
