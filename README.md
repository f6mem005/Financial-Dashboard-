# Finance Sense

A simple personal finance dashboard for young adults (18–30) with little budgeting experience.
Static, dependency-free, no build step, no account, no network calls. Data stays in the browser (`localStorage`).

## Run

    python3 -m http.server 8000      # then open http://localhost:8000
    node --test tests/*.test.js tests/*.test.mjs   # engine / config / csv / store / ideas / backup / sign-in gate tests

Serve over `http://` (the Content-Security-Policy meta tag is written for `'self'`).

## Sign-in passcode (the whole site)

The same design as the Pari Passu app, with one shared passcode instead of people accounts. A small **gate**
(`netlify/edge-functions/gate.ts`) runs in front of every request. Without a valid session cookie the browser is sent the
sign-in page and **none of the site's files**. `netlify/functions/login.mjs` checks the passcode and sets the session cookie.

| Environment variable (Netlify > Project configuration > Environment variables) | Purpose |
|---|---|
| `SESSION_SECRET` | Random string, 16+ characters, that signs the session cookie |
| `SITE_PASSCODE` | The passcode people type, 12+ characters |

Mark both as **secret** and scope them to **Functions**. **It fails closed:** if either is missing or too short, nobody can open
the site (the page says it is not set up). Never put either value in the repo.

**Order matters:** set both variables in Netlify BEFORE the first deploy that includes the gate, and use a different `SESSION_SECRET` and
passcode on every site. Changing a variable needs a redeploy to take effect. Deployed without them, the site refuses everyone
(the page says it is "not set up yet"). The gate also keeps the cookie tied to one site, so sites that share a secret still cannot
open each other. After a deploy, check unsigned requests: `curl -sI <site>/` should show exactly one `content-security-policy`
header and a 401, and `curl -s --path-as-is -o /dev/null -w '%{http_code}' '<site>/auth/..%2findex.html'` should not return the page.

- The session is a signed cookie (HMAC-SHA256), `HttpOnly; Secure; SameSite=Lax` (Lax so a link from an email still arrives signed in), 14 days. Changing `SITE_PASSCODE` signs everyone out.
- The passcode is compared through HMACs of both values (no timing leak). The login function is rate limited to 10 tries a minute per IP.
- Only the site's own page can sign in (an `Origin` from another site is refused).
- To change the passcode: edit `SITE_PASSCODE` in Netlify and redeploy (or trigger a deploy). Tell people the new one.
- The wording on the sign-in page is in `netlify/shared/site.mjs`.
- Test locally with `node tests/gate-server.mjs 8913` (the real gate, login and site files together; set both variables first).

## What to publish

Stage exactly: `index.html`, `_headers`, `css/`, `js/`, `auth/gate.js`, `auth/gate.css`, `netlify.toml`, `netlify/edge-functions/gate.ts`,
`netlify/functions/login.mjs`, `netlify/shared/auth.mjs`, `netlify/shared/site.mjs`. **Not** `tests/`, `README.md`, `CLAUDE.md`, `.git`.
Your numbers still never leave the browser; the only new request is the passcode sent to this site's own login.

## Hosting (security)

- Host on **its own origin** (own subdomain / Netlify or Pages site), not under a shared path like `user.github.io/finance-sense/`:
  `localStorage` is per-origin, so any other app on the same origin could read the saved data.
- A `<meta>` CSP can't set `frame-ancestors`. Production headers are in `_headers` (Netlify / Cloudflare Pages format);
  other hosts need the same headers. The app also hides itself when it detects it is framed (defence in depth only; `frame-ancestors` is the real control).
- Data is stored **unencrypted** in `localStorage` (the Settings screen says so).

## Layout

| File | Role |
|---|---|
| `js/catalog.js` | Option lists, typical defaults, the 13 question definitions |
| `js/config.js` | **Answers → dashboard configuration** (features on/off, widget order, budget style, flagged assumptions) |
| `js/engine.js` | Forecast, safe-to-spend, cash calendar, leaks, goals, debt payoff, subscriptions, alerts |
| `js/store.js` | State shape, field-by-field validation of anything loaded, persistence |
| `js/ideas.js` | **Suggestions** from your own numbers: how much you could set aside, a growth illustration for generic fund types, ways to spend less, duplicate finder, "what changed" check |
| `js/backup.js` | Backup file for moving to another device: plain or passphrase-locked (AES-256-GCM, PBKDF2), re-validated on the way in |
| `netlify/`, `auth/` | The sign-in gate (edge function), login function, shared auth code and the sign-in page's files. Not part of the app itself |
| `js/csv.js` | Bank CSV parser/mapper with size and row limits |
| `js/charts.js`, `js/ui.js`, `js/onboarding.js`, `js/views.js`, `js/ideas-view.js`, `js/transfer.js`, `js/app.js` | UI. All DOM is built with a text-only builder (no `innerHTML`). `app.js` also holds the first screen and the How it works screen, opened from a button in the top bar of every screen |
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
- **Ideas tab is guidance, not advice, and never guesses your pay:** if pay was skipped it asks for it instead of showing a number; if bills or everyday spending were skipped it says the figure uses typical amounts. Savings amounts are half ("comfortable") and 80% ("stretch") of what is left after bills, usual spending, debt minimums, yearly costs and the monthly amount your goals need (slow-month pay if income varies). The growth illustration uses four *generic* fund types (savings account, bond index fund, 60/40 mixed fund, broad stock index fund) with rough yearly growth ranges **after inflation and fees**, editable by the person, and never names a product or ticker. Spend-less amounts are rough per-year figures that overlap; duplicates are only *possible* duplicates and can be dismissed.
- **"What changed" check** compares logged paychecks, bill payments, everyday spending, repeating charges and balance age with the answers; suggestions apply from today forward and leave logged transactions alone, with one exception: "Add as a bill" re-tags that bill's matching past charges so they are not counted twice (as everyday spending and as a bill). Needs a few weeks of logged data, and trend ideas wait until day 10 of a month. The "update your balance" nudge goes by when you last *confirmed* the balance (`settings.balanceChecked`), and is always shown first.
- **Single checking balance**, no multiple accounts, no transfers, no currency options (USD formatting).
- **Not financial advice.** Disclaimer in the footer of every screen; goals such as "Investing" are just savings targets.
- **Known gaps found in review and left as-is:** "Mark paid" is undone with the Undo button on the bill (unmatched CSV rows land in “Other” spending, which counts as everyday spending); re-adding a goal of the same type re-attaches its earlier contributions (goal ids are `g-<type>`); debt payoff uses the balances you entered and is not reduced by payments you log; twice-monthly pay assumes 1st & 15th, 15th & last day, or d and d±15.
