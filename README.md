# Finance Sense

A simple personal finance dashboard for young adults (18–30) with little budgeting experience.
Static, no build step. Your numbers stay in the browser (`localStorage`) and are never sent anywhere. The site itself sits behind a sign-in (see below), which is the only part that uses a server (Netlify Functions and Netlify Blobs).

## Run

    python3 -m http.server 8000      # then open http://localhost:8000
    node --test tests/*.test.js tests/*.test.mjs   # engine / config / csv / store / ideas / backup / sign-in gate tests

Serve over `http://` (the Content-Security-Policy meta tag is written for `'self'`).

## Sign-in (admin and personal passcodes)

The same design as the Pari Passu app. **You are the admin.** You sign in with an admin passcode; from the admin page you generate a personal passcode for each
of the people who use it. A small **gate** (`netlify/edge-functions/gate.ts`) runs in front of every request: without a valid session cookie the browser is sent the sign-in
page and **none of the site's files**. 
**You set these two variables yourself, in Netlify** (Project configuration > Environment variables). No assistant should be given or set the values.

| Variable | Purpose |
|---|---|
| `SESSION_SECRET` | Random string, 16+ characters, that signs the session cookie. Different on every site |
| `ADMIN_PASSCODE` | Your admin passcode, 8+ characters. Longer is better |

**It fails closed:** if either is missing or too short, nobody can open the site (the page says it is "not set up yet"). Set both BEFORE the first deploy of the
gate, scope them to Functions (and, if the sign-in page says "not set up yet", also to Builds and Runtime: the gate runs as an edge function), and redeploy after changing them.
Never put either value in the repo. (On a plan that allows it, mark them secret.)

**Signing in:** everyone uses the same sign-in page. Admin: leave the name blank and type the admin passcode (you land on `/admin/`). Everyone else: their name and personal passcode.

**The admin page (`/admin/`):** add a person (name + passcode), press **Generate** for an easy 8-character code like `rakobu47` (or type your own, 8+ characters),
give a person a **new passcode** (the old one stops working at once), or **remove** them. A passcode is shown **once**, when you make it: only a salted PBKDF2 hash is stored
(in Netlify Blobs), so it cannot be read again. Names are unique (any letter case).

How it holds together:
- The session is a signed cookie (HMAC-SHA256), `HttpOnly; Secure; SameSite=Lax` (Lax so a link from an email still arrives signed in), 14 days, tied to this site (`SITE.id`).
- Changing `ADMIN_PASSCODE` signs the admin out. Admin sessions last 12 hours, people's 14 days. Resetting or removing a person ends their sessions: the gate checks the stored
  record (through `/auth/session`) on **every request from a person**, and remembers a good answer for 10 seconds per cookie, so a removal takes effect within about 10 seconds, not instantly.
  The cookie is named `__Host-fs_gate` (the browser only accepts it from this exact site over HTTPS).
- The admin passcode is compared through HMACs of both values (no timing leak). Login is rate limited to 10 tries a minute per IP; unknown names take as long as known ones.
- Admin tools need an admin cookie AND an `Origin` from this site. The `/admin` area is refused for everyone else however the path is written.
- Wording on the sign-in page: `netlify/shared/site.mjs`. Local test: `node tests/gate-server.mjs 8913` (real gate and functions with an in-memory store) with both variables set.
- Easy 8-character codes are fine because of the rate limit; use a longer one for anything sensitive.

After a deploy, check from outside: `curl -sI <site>/` shows 401 and exactly one `content-security-policy` header;
`curl -s --path-as-is -o /dev/null -w '%{http_code}' '<site>/auth/..%2findex.html'` is 401; and an unsigned `POST /` is refused.

## Installing it like an app

The site is an installable web app: `manifest.webmanifest`, four icons in `icons/` (drawn by `scripts/make-icons.py`; `--no-calculator` gives the plainer version),
and the head tags in `index.html`. Settings has an **Install on your phone** card (`js/install.js`): a button where the browser offers one (Chrome, Edge),
plain steps for iPhone Safari, and a warning that an installed iPhone app keeps its own storage and can open empty (use the backup to move your numbers).
There is **no service worker and no offline mode**, so the app still needs a connection to open.
Because a browser fetches the manifest and icons without cookies, those five exact paths are on the sign-in gate's open list (`OPEN` in `netlify/edge-functions/gate.ts`);
they are public images and one small JSON file. The page's policy adds `manifest-src 'self'` (in the page and in `_headers`).
After a deploy, check `curl -s <site>/manifest.webmanifest` returns the JSON without signing in.
**Known, verified on the live site (2026-11-07):** Netlify serves `.webmanifest` as `application/octet-stream`. Chromium parses it fine anyway (checked with `Page.getAppManifest` against a server sending that type: no errors, no installability errors),
so Chrome and Edge are unaffected; other browsers are not verified. To fix it, add a `Content-Type: application/manifest+json` rule for `/manifest.webmanifest` to `_headers` and confirm there is still only one `Content-Type` header after the deploy.
**Also known:** Netlify's open-path matching ignores a trailing slash, so `<site>/manifest.webmanifest/` and `<site>/icons/icon-192.png/` return the same public file (and so do the existing `/auth/gate.css/` and `/auth/gate.js/`). Same bytes, no HTML, nothing private, so this is harmless.
Also check the look-alikes stay gated: `curl -s -o /dev/null -w '%{http_code}\n'` on `<site>/icons/`, `<site>/icons/icon-192.png/`, `<site>/ICONS/icon-192.png`, `<site>/manifest.webmanifest/` and
`--path-as-is '<site>/icons/..%2findex.html'` must each print 401 or 404, never 200 (and never the app's `index.html`), except the two trailing-slash forms noted above, which may print 200 with the same public file.

## Telling people to refresh after an update

Every deploy gets a build id. The page knows the id it loaded (`js/version.js`); while it is open, `js/update.js` asks `/version.json` which
build is live (when the tab comes back into view, when the window is focused, and every 5 minutes). If the answer differs, a blue bar appears at the top with a
**Refresh** button. It never reloads by itself, so nothing anyone is typing is lost. If the sign-in has ended it says "You have been signed out". Unclear answers (offline, an error) show nothing.

**The deploy step that makes it work:** after staging the files and before uploading, run `node scripts/stamp-version.mjs <staging folder>`. It writes the same
new build id into the staged `js/version.js` and `version.json`. The copy in the repo keeps its `'dev'` placeholder, and a page with `'dev'` (running locally, or a stage that was not
stamped) never shows the bar. **Skipping the stamp means nobody is told about that update.** Pages that were open before the first stamped deploy do not have the checker yet, so only updates after that one are announced.
The page's security policy allows connections to its own site only (`connect-src 'self'`) so it can read `/version.json`; no other host.

## What to publish

Stage exactly: `index.html`, `_headers`, `manifest.webmanifest`, `icons/` (4 PNGs), `css/`, `js/` (including `js/install.js`), `auth/gate.js`, `auth/gate.css`, `admin/` (3 files), `netlify.toml`, `package.json`, `package-lock.json`,
`netlify/edge-functions/gate.ts`, `netlify/functions/` (login, session, logout, admin), `netlify/shared/` (auth, people, http, site), then stamp it (see above). **Not** `tests/`, `README.md`, `CLAUDE.md`, `.git`, `node_modules`.
Your numbers still never leave the browser. The only requests are the sign-in itself (name and passcode to this site's own login), the per-request check that a person's passcode is still valid, and, for the admin, the admin page's own calls.

## Hosting (security)

- Host on **its own origin** (own subdomain / Netlify or Pages site), not under a shared path like `user.github.io/finance-sense/`:
  `localStorage` is per-origin, so any other app on the same origin could read the saved data.
- A `<meta>` CSP can't set `frame-ancestors`. Production headers are in `_headers` (Netlify / Cloudflare Pages format);
  other hosts need the same headers. The app also hides itself when it detects it is framed (defence in depth only; `frame-ancestors` is the real control).
- Data is stored **unencrypted** in `localStorage` (the Settings screen says so).

## The survey (`survey/`)

`survey/` is the source of the separate prospective-user questionnaire (its own Netlify site, `finance-sense-survey`). It is kept here only so it is backed up and
versioned; it has its own README, tests, sign-in and deploy steps, and is **never** part of this app's deploy (the stage list above names every file, and `survey/` is not in it).
Run its tests from inside that folder: `cd survey && node --test tests/*.test.js tests/*.test.mjs`. This repo is public, so nothing secret may ever go in `survey/` (its
passcodes and secrets live only in Netlify).

## Layout

| File | Role |
|---|---|
| `js/catalog.js` | Option lists, typical defaults, the 13 question definitions |
| `js/config.js` | **Answers → dashboard configuration** (features on/off, widget order, budget style, flagged assumptions) |
| `js/engine.js` | Forecast, safe-to-spend, cash calendar, leaks, goals, debt payoff, subscriptions, alerts |
| `js/store.js` | State shape, field-by-field validation of anything loaded, persistence |
| `js/ideas.js` | **Suggestions** from your own numbers: how much you could set aside, a growth illustration for generic fund types, ways to spend less, duplicate finder, "what changed" check |
| `js/backup.js` | Backup file for moving to another device: plain or passphrase-locked (AES-256-GCM, PBKDF2), re-validated on the way in |
| `netlify/`, `auth/`, `admin/` | The sign-in gate (edge function), the login/session/logout/admin functions, shared auth and people-store code, the sign-in page's files and the admin page. Not part of the app itself |
| `js/csv.js` | Bank CSV parser/mapper with size and row limits |
| `js/version.js`, `js/update.js`, `scripts/stamp-version.mjs` | The "new version, please refresh" bar and the deploy-time build stamp |
| `js/charts.js`, `js/ui.js`, `js/onboarding.js`, `js/views.js`, `js/ideas-view.js`, `js/transfer.js`, `js/install.js`, `js/app.js` | UI. All DOM is built with a text-only builder (no `innerHTML`). `app.js` also holds the first screen and the How it works screen, opened from a button in the top bar of every screen |
| `js/sample.js` | Demo persona (relative to today, never saved) |

## Stubbed or simplified in v1

- **13 questions, not 12.** The spec's sections contain 13 distinct questions once amounts/dates are folded into the selection screens.
- **Current balance is not in the questionnaire.** It is asked on the final screen (optional) and in Settings; without it the forecast starts at $0 and says so.
- **Forecast timing assumptions:** extra income and debt minimums land on the 1st; yearly costs land on the 1st of their month; goal savings = amount needed per month to hit the target date. Weekends/holidays are ignored.
- **Variable spending** uses your questionnaire estimate until there are 28+ days of logged expenses, then the logged 90-day average.
- **Irregular income:** low month = the line, high month = shaded range. No seasonality or per-month history.
- **Budget styles** are light: *track* has no limits; *envelopes*/*50-30-20*/*every dollar* use your category estimates as limits. No rollover, no per-paycheck assignment.
- **Debt payoff** assumes fixed minimums, monthly compounding, extra payment constant; no promo/deferred interest or BNPL fee modelling. Unknown rates use typical defaults and are flagged.
- **Subscriptions** are itemised manually; no automatic recurring-charge detection from CSV.
- **CSV import:** generic header detection (date / description / amount or debit+credit), keyword auto-categorising, duplicate skip by date+amount+note. No per-bank presets, no rules editor.
- **No notifications.** "Alerts" show in-app only; the check-in cadence answer is stored but does not schedule anything.
- **Yearly costs** due today are skipped if an expense of about the same amount (any category) is already logged today, so an unrelated same-size payment can hide one on that single day.
- **Several tabs:** if another tab changes your data while this one has unsaved typing, this tab stops saving and asks you to reload (it never overwrites the other tab's data).
- **Storage:** plain `localStorage` (not encrypted). Moving to another device is a **backup file** you save and restore by hand (Settings, or the first screen on the new device); there is no automatic sync and the file is a snapshot. A passphrase is optional: a plain file is readable by anyone who gets it; a locked file cannot be opened if the passphrase is forgotten. Restoring replaces what is on that device after a summary and a confirmation.
- **The money questions cannot be skipped.** How you are paid, pay, other income, bills, everyday spending, yearly costs and debts each need real amounts (0 is fine) or an explicit "None / N/A"; nothing is filled in with a typical amount for new setups. Older saved data that skipped them (left blank) keeps working with typical amounts, flagged, until they are edited; an older answer of exactly 0 for pay is now respected as $0 instead of being replaced by a typical amount. Everything else (goals, what you want, style) can still be skipped.
- **Leaving setup partway.** Every question screen has a **Home** button in the banner and a **Save and exit** link; both return to the landing page and keep what was typed. Save and exit only leaves once the save really worked, and says so. The question you were on is stored (`setupStep`), so **Continue setup** resumes there, even after the tab is closed. The Finance Sense banner is on every screen, including the sign-in, admins-only and admin pages.
- **Ideas tab is guidance, not advice, and never guesses your pay:** if pay was skipped (older data) it asks for it instead of showing a number; if bills or everyday spending were skipped it says the figure uses typical amounts. Savings amounts are half ("comfortable") and 80% ("stretch") of what is left after bills, usual spending, debt minimums, yearly costs and the monthly amount your goals need (slow-month pay if income varies). The growth illustration uses four *generic* fund types (savings account, bond index fund, 60/40 mixed fund, broad stock index fund) with rough yearly growth ranges **after inflation and fees**, editable by the person, and never names a product or ticker. Spend-less amounts are rough per-year figures that overlap; duplicates are only *possible* duplicates and can be dismissed.
- **"What changed" check** compares logged paychecks, bill payments, everyday spending, repeating charges and balance age with the answers; suggestions apply from today forward and leave logged transactions alone, with one exception: "Add as a bill" re-tags that bill's matching past charges so they are not counted twice (as everyday spending and as a bill). Needs a few weeks of logged data, and trend ideas wait until day 10 of a month. The "update your balance" nudge goes by when you last *confirmed* the balance (`settings.balanceChecked`), and is always shown first.
- **Single checking balance**, no multiple accounts, no transfers, no currency options (USD formatting).
- **Not financial advice.** Disclaimer in the footer of every screen; goals such as "Investing" are just savings targets.
- **Known gaps found in review and left as-is:** "Mark paid" is undone with the Undo button on the bill (unmatched CSV rows land in “Other” spending, which counts as everyday spending); re-adding a goal of the same type re-attaches its earlier contributions (goal ids are `g-<type>`); debt payoff uses the balances you entered and is not reduced by payments you log; twice-monthly pay assumes 1st & 15th, 15th & last day, or d and d±15.
