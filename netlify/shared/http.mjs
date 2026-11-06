// Small helpers shared by the sign-in functions.
export const json = (body, status = 200, headers = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store", ...headers } });

// Refuse the platform's default /.netlify/ route: it would bypass the rate limit attached to the public path.
// (Blocks only that prefix, so a difference in the URL the platform reports can never lock everyone out.)
export const viaDefaultRoute = (req) => new URL(req.url).pathname.startsWith("/.netlify/");

// State-changing calls must come from this site's own pages: an Origin that is missing, or from another site, is refused.
export function sameSiteOrigin(req) {
  const origin = req.headers.get("origin");
  if (!origin) return false;
  // The page's own host (and port) must match. The page itself must be on HTTPS (or localhost, for testing); the scheme the platform
  // reports for req.url is not trusted either way, so a proxy in between cannot make real admin calls fail.
  try {
    const o = new URL(origin), u = new URL(req.url);
    return o.host === u.host && (o.protocol === "https:" || /^(localhost|127\.0\.0\.1|\[::1\])$/.test(o.hostname));
  } catch { return false; }
}
