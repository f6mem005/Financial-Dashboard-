# Finance Sense: instructions for Claude

Personal finance and budgeting dashboard for people with little budgeting experience. Static site
(`index.html`, `css/`, `js/`), no build step, no account, no backend. Data lives in the visitor's browser
(`localStorage`). See `README.md` for the layout and the list of what is stubbed or simplified.

## Standing rule: review every code change

**Every time you change code, hand the change to an independent code reviewer and a security check before you
report it done.**

1. Make the change and test it (see below).
2. Get an independent code review of the change (the `code-review` skill, or a separate reviewer agent), and a
   separate security-impact check (the `security-review` skill, or a separate reviewer agent).
3. Check each finding against the code yourself before acting; reviewers are sometimes wrong or repeat
   themselves. Fix the ones that are real, and re-test.
4. Fixes are code changes too, so they go back to the reviewers. Stop when a pass returns only repeats,
   theoretical races or matters of taste, and say so in your report.
5. In your report, list what was fixed and what was declined (with the reason). Never present unreviewed
   code as done.

Documentation-only changes (`README.md`, this file) don't need a review.

## Standing rule: never deploy without approval

Do not deploy or publish anything (Netlify or anywhere else), link hosting to Git, rename a hosting project, or
change who can open a site unless the user has explicitly approved that specific action. Approval for one
deploy is not approval for the next. The Netlify site is deployed by manual upload only; it is not linked to
GitHub, so a push does not deploy. If that ever changes, a push could publish, so ask first.

## Testing

- Unit tests: `node --test tests/*.test.js tests/*.test.mjs` (engine, config mapping, CSV, store, ideas, backup, sign-in gate; pass
  explicit globs, a bare directory fails). Every fix to forecast, safe-to-spend, bill, goal, debt, suggestion or backup logic needs a
  regression test.
- Browser tests: `tests/browser/gate-flow.js` (starts its own harness), `tests/browser/demo-only-flow.js`, `tests/browser/theme-flow.js` and `tests/browser/ideas-flow.js` (needs Playwright and the repo served on port 8912; see the top of the file).
- In the browser: serve the repo root (`python3 -m http.server`) and drive it with the preinstalled Chromium and
  Playwright. Check phone-sized and desktop screens, light and dark mode, the demo, and a real onboarding run
  (including skipping every question).
- The console must stay clean: no errors, no CSP or Trusted Types violations, and no `h(): attribute not allowed`
  warnings. The one exception: on a plain file server (no sign-in) the browser logs a 404 for `/auth/session`, the "who is signed in" check behind the Sign out button; browser tests ignore that exact address and nothing else.
- Test hostile input, not just friendly input: tampered `localStorage`, hostile CSV files (huge cells, formula
  text, odd headers), two tabs open at once, and a failing `localStorage.setItem`.
- Note: `node --check` cannot catch a `return` followed by a newline. Run the browser tests after editing JS.

## Things to keep true

- No `innerHTML`, `eval` or string timers. All DOM goes through the `h()` builder in `js/util.js`, which only
  allows listed tags and attributes; user text is only ever set as a text node.
- Anything read back from `localStorage` or a CSV goes through `js/store.js` validation before use. Never trust it.
- The sign-in gate (`netlify/`, `auth/`, `admin/`) fails closed and never serves the site without a valid session. `SESSION_SECRET` and
  `ADMIN_PASSCODE` are set by the owner in Netlify, never by an assistant, and never appear in the repo, tests, logs or chat. Personal
  passcodes are stored only as PBKDF2 hashes and shown once. Any change there needs a test and the independent security check.
- Nothing leaves the browser: no third-party scripts, fonts or hosts. The only requests the app page makes are to its own site (`connect-src 'self'`,
  in both the page's meta policy and `_headers`): the `/version.json` update check, sign-in and the admin tools. Never loosen it past `'self'`.
- The storage key `fd.v1` stays the same, because renaming it would hide existing users' data. A schema change
  needs a migration. Unreadable or newer-version data is backed up, never overwritten.
- Money math must stay honest: paying a bill moves real money (it is recorded as an expense), nothing is
  deducted after a goal or debt is finished, and estimates are labelled as estimates.
- Not financial advice: keep the disclaimer on every screen and never recommend specific investments. The growth
  illustration may only use generic fund types (no tickers, providers or brands) and must stay labelled as an illustration.
- Backup files are untrusted input: they only enter through `FD.backup.open`, which passes them through `store.sanitize`.
  Never read a file's contents any other way, and keep the PBKDF2 iteration bounds.
- Phone fit: nothing may be wider than the screen, or the page can be dragged sideways and looks like it is floating. `tests/browser/mobile-fit-flow.js` checks every screen at 320, 360, 390 and 430px
  (and that sticky bars still stick), so run it after any CSS or layout change. A flex or grid child that holds an input or a long word needs `min-width: 0`.
  **Never put `overflow` (hidden, clip, auto) on `html` or `body`**: on iPhone Safari and home-screen apps it can strand `position: fixed` bars (the tab bar vanished on the very tall Ideas page).
  The sideways guard lives on `#app` (`overflow-x: clip`), which is not a scroller. The logo and name in the top bar are a Home button, so there is always a way back.
- Pop-ups: today the only pop-ups are the browser's own confirm boxes, which already block the page behind them. If a custom pop-up, sheet or menu is ever added, it must lock the page behind it
  (`overflow: hidden` on `html` while open, `overscroll-behavior: contain` on the pop-up's own scroller), keep keyboard focus inside, close on Escape, restore focus when it closes,
  and have a browser test (touch-emulated) proving that scrolling moves the pop-up and not the page behind it.
- Appearance (Match my device / Light / Dark): `js/theme.js` (loaded in `<head>` so nothing flashes) sets `data-theme` on `<html>`; the choice is one word under its own key `fd.theme`, never inside `fd.v1`, a backup or "Delete all my data". Dark tokens live in two places in `css/styles.css` (the device-is-dark media query, guarded with `:not([data-theme="light"])`, and `:root[data-theme="dark"]`): change both together, and new dark-only rules need both selectors too. `tests/browser/theme-flow.js` covers it.
- Never put secrets, tokens or API keys in the repo.

## Deploying: stamp the build

Before every upload, run `node scripts/stamp-version.mjs <staging folder>` so open pages are told to refresh (see README). Never commit the stamped
`js/version.js`; the repo copy keeps the `'dev'` placeholder. Stage exactly the files listed in README, from the committed code.

## Git

- Develop on `claude/finance-dashboard-young-adults-sj8pd9` and push to that branch only.
- Commit and push as separate steps. Do not open a pull request unless asked.

- `survey/` is a separate site (the questionnaire) stored in this repo for backup. Never stage it into the app deploy, never put secrets in it (this repo is public), and keep its own tests green: `cd survey && node --test tests/*.test.js tests/*.test.mjs`.
- The survey's `/demo/` page runs this app's own code in demo-only mode (`window.FD_DEMO_ONLY` in `js/app.js`; files copied into `survey/demo/app/` by `survey/scripts/sync-demo.mjs`, git-ignored). That mode must stay read-only toward real data: sample data only, no Settings, nothing saved, Continue goes to a same-site path only. Changes to it need `tests/browser/demo-only-flow.js` (app, port 8912) and `survey/tests/browser/demo-flow.js` (survey, port 8771, after running the sync script), plus the security check.
