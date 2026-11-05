# Money Map

A simple personal finance dashboard for young adults (18–30) with little budgeting experience.
Static, dependency-free, no build step, no account, no network calls. Data stays in the browser (`localStorage`).

## Run

    python3 -m http.server 8000      # then open http://localhost:8000
    node --test tests/run.test.js    # engine / config / csv / store tests

Serve over `http://` (the Content-Security-Policy meta tag is written for `'self'`).

## Hosting (security)

- Host on **its own origin** (own subdomain / Netlify or Pages site), not under a shared path like `user.github.io/money-map/`:
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
| `js/csv.js` | Bank CSV parser/mapper with size and row limits |
| `js/charts.js`, `js/ui.js`, `js/onboarding.js`, `js/views.js`, `js/app.js` | UI. All DOM is built with a text-only builder (no `innerHTML`) |
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
- **Several tabs:** if another tab changes your data while this one has unsaved typing, this tab stops saving and asks you to reload (it never overwrites the other tab's data).
- **Storage:** plain `localStorage` (not encrypted); JSON export but no JSON import/restore; no multi-device sync.
- **Single checking balance**, no multiple accounts, no transfers, no currency options (USD formatting).
- **Not financial advice.** Disclaimer in the footer of every screen; goals such as "Investing" are just savings targets.
- **Known gaps found in review and left as-is:** "Mark paid" is undone with the Undo button on the bill (unmatched CSV rows land in \u201cOther\u201d spending, which counts as everyday spending); re-adding a goal of the same type re-attaches its earlier contributions (goal ids are `g-<type>`); debt payoff uses the balances you entered and is not reduced by payments you log; twice-monthly pay assumes 1st & 15th, 15th & last day, or d and d±15.
