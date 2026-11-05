# Finance Sense: instructions for Claude

Personal finance and budgeting dashboard for young adults (18-30) with little budgeting experience. Static site
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

- Unit tests: `node --test tests/run.test.js` (engine, config mapping, CSV, store). Every fix to forecast,
  safe-to-spend, bill, goal or debt logic needs a regression test.
- In the browser: serve the repo root (`python3 -m http.server`) and drive it with the preinstalled Chromium and
  Playwright. Check phone-sized and desktop screens, light and dark mode, the demo, and a real onboarding run
  (including skipping every question).
- The console must stay clean: no errors, no CSP or Trusted Types violations, and no `h(): attribute not allowed`
  warnings.
- Test hostile input, not just friendly input: tampered `localStorage`, hostile CSV files (huge cells, formula
  text, odd headers), two tabs open at once, and a failing `localStorage.setItem`.
- Note: `node --check` cannot catch a `return` followed by a newline. Run the browser tests after editing JS.

## Things to keep true

- No `innerHTML`, `eval` or string timers. All DOM goes through the `h()` builder in `js/util.js`, which only
  allows listed tags and attributes; user text is only ever set as a text node.
- Anything read back from `localStorage` or a CSV goes through `js/store.js` validation before use. Never trust it.
- Nothing leaves the browser: no network requests, no third-party scripts or fonts (CSP `connect-src 'none'`).
- The storage key `fd.v1` stays the same, because renaming it would hide existing users' data. A schema change
  needs a migration. Unreadable or newer-version data is backed up, never overwritten.
- Money math must stay honest: paying a bill moves real money (it is recorded as an expense), nothing is
  deducted after a goal or debt is finished, and estimates are labelled as estimates.
- Not financial advice: keep the disclaimer on every screen and never recommend specific investments.
- Never put secrets, tokens or API keys in the repo.

## Git

- Develop on `claude/finance-dashboard-young-adults-sj8pd9` and push to that branch only.
- Commit and push as separate steps. Do not open a pull request unless asked.
