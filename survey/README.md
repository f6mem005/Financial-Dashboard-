# Finance Sense survey (interactive)

A small standalone web survey for prospective users: what they want to see in a money dashboard, what matters most,
and what they'd change. It is **separate from the Finance Sense app** and shares no code with it.
No build step. Answers are collected by Netlify Forms once the survey is published (see below); until then nothing is sent anywhere.
The published survey sits behind a sign-in (see below): invitees use the name and passcode from their invitation.

## What respondents can do

- Tap an answer to select it, and **tap it again to undo it** (ratings, single choices, multi choices, the pick-three).
- Rate 15 features from 1 to 5 (or "Not sure what this is"). The row order is randomized per respondent.
- Pick exactly three features, then **put them in order by dragging** (mouse or touch) **or with the up/down arrows**
  (keyboard friendly, announced to screen readers).
- Write free-text answers (up to 2,000 characters each): the one thing they wish a dashboard would tell them, any missing features or ideas (asked in the first section, after the feature questions and the two questions about what would make them stop and what they wish it would tell them), apps they loved or hated, and a final "anything else?". Only the first is required. They can also optionally leave an email to try an early version.
- Close the page and come back: progress is kept in their own browser until they finish.

## Try it on your computer

Double-click `index.html` (or run `python3 -m http.server 8000` and open http://localhost:8000).
Opened this way it is in **preview mode**: at the end the person can only download their own answers, and nothing is sent.
To see the results page, open `results/index.html` and click "Show me with fake sample data".

## How answers are collected (Netlify Forms)

When the survey is published on an https site, finishing it sends **two separate form submissions**:

| Form name | Contains | Purpose |
|---|---|---|
| `survey` | one column per answer, a random `response_id`, "would try an early version" yes/no, quote consent | the anonymous answers |
| `survey-contact` | the email address only | so you can invite testers; never joined to the answers |

Things to know:

- **Netlify finds the forms by reading `index.html` when the site is published.** The two hidden forms near the top of
  `index.html` list every field. Do not remove or rename them: a test checks they match the code, and Netlify rejects
  fields it was not told about. Form detection must be switched on once for the site (Netlify: Forms, then enable form
  detection) before publishing.
- **Testing the live form:** Netlify's spam filter hides (counts, but does not list) posts that arrive with no referrer or with an automated-browser user agent such as "HeadlessChrome". The survey sends a same-site referrer on purpose, and a test from a script needs an ordinary phone user agent, or it will land in the Spam tab and look like nothing arrived. Confirmed live: a post with a normal phone user agent and the same-site referrer appeared in the normal list; the same post from headless Chrome did not.
- **Spam:** each form has a hidden trap field. Netlify also runs its own spam filter, which now and then flags real
  people. **Check the Spam tab** and mark genuine ones as verified before you export.
- **Retries:** if someone's connection drops and they retry, the survey does not re-send a part that already arrived, but a lost
  reply can still produce a second copy. The same `response_id` arrives twice; the results tool keeps the earliest copy by
  timestamp, tells you how many it dropped, and warns if the copies disagreed. If the export has no readable timestamps, the first
  listed copy is kept (Netlify may list newest first, so check that warning). Emails can repeat too: remove duplicates yourself.
- **Size:** with four large text answers the main submission can be tens of kilobytes. I could not confirm Netlify's per-submission size limit, so after publishing, send one test response with all four boxes filled to their limit and check it arrives.
- **Limits and cost:** check how many form submissions your Netlify plan includes. Export and delete submissions when you
  are done; they hold personal data (the email) and Netlify keeps them until you remove them.
- **Notifications** (optional, in Netlify): the recipient must be an active member of your Netlify team.

## Getting results you can analyse

Three ways, from simplest:

1. **The results page (recommended).** In Netlify open Forms, then the `survey` form, and export the submissions as
   CSV. Open `results/index.html` on your computer and choose the file. It shows, for each of the 15 features: how many
   people put it in their top three, the home-screen votes (3 points for #1, 2 for #2, 1 for #3), how many rated it 4 or
   5, the average, how many were "not sure", and how many said they'd never use it. Below that: how often and on what
   device they'd use it, budgeting style, reminders, why they'd quit, and every written answer (searchable). You can
   download a Markdown summary, a feature table, and a spreadsheet-safe copy of every response (the CSVs start with an
   invisible marker so Excel shows accents and emoji correctly). The file is read on your computer only; nothing is uploaded.
   The page tells you when something looks wrong instead of showing a bare zero: wrong form's export, skipped rows, repeated
   sends with different answers, many identical responses, and thin sample sizes for a given question.
2. **The command line.** `node results/analyze-cli.js export.csv > report.md` produces the same report as text
   (add `--features f.csv --responses r.csv` for the spreadsheets).
3. **Ask Claude.** With the Netlify connection, Claude can read the `survey` form's submissions and run the same
   analysis for you, then explain the results. This relies on the connection being available in that session.

How the numbers are worked out (so you can trust or challenge them):

- **Votes** come from the ranking question. They show what people would put at the top of the home screen.
- **Rated 4-5** is out of the people who gave that feature a 1-5 rating ("Not sure" is shown separately).
- **Percentages** are out of the people who answered that question, which can be fewer than everyone. The page prints those
  bases under the table and flags any under 30. "Never use" is an optional question, so its base is usually the smallest.
- Multi-choice questions add up to more than 100%, because people can choose several.
- **Under about 30 responses** the page says so: treat percentages as hints. Comparing groups needs more.
- The survey asks no personal questions, so you cannot split results by age or income. To compare audiences (for
  example a campus group and a community page), publish separate copies of the survey and combine the files.
- A tie in votes is broken by the importance rating, then alphabetically.
- **Anyone can submit the public form**, so the results can be skewed by someone sending many fake responses. Nothing here
  prevents that. Practical protection: publish a separate copy of the survey per audience, watch your Netlify submission count
  for sudden jumps, and read the "identical responses" warning. Hand-check a sample of rows before you act on close results.

## Sign-in (admin and personal passcodes)

The same design as the Pari Passu app. **You are the admin.** You sign in with an admin passcode; from the admin page you generate a personal passcode for each
of the people you invite. A small **gate** (`netlify/edge-functions/gate.ts`) runs in front of every request: without a valid session cookie the browser is sent the sign-in
page and **none of the site's files**. Each invitee needs the **name and passcode you give them in the invitation**. Names are kept apart from answers and are never attached to them; the survey's privacy note says so.

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

## Telling people to refresh after an update

Every deploy gets a build id. The survey page knows the id it loaded (`js/version.js`); while it is open, `js/update.js` asks `/version.json` which
build is live (when the tab comes back into view, when the window is focused, and every 5 minutes). If the answer differs, a blue bar appears at the top with a
**Refresh** button. It never reloads by itself, so nothing anyone is typing is lost. If the sign-in has ended it says "You have been signed out". Unclear answers (offline, an error) show nothing.

**The deploy step that makes it work:** after staging the files and before uploading, run `node scripts/stamp-version.mjs <staging folder>`. It writes the same
new build id into the staged `js/version.js` and `version.json`. The copy in the repo keeps its `'dev'` placeholder, and a page with `'dev'` (running locally, or a stage that was not
stamped) never shows the bar. **Skipping the stamp means nobody is told about that update.** Pages that were open before the first stamped deploy do not have the checker yet, so only updates after that one are announced.
The page's security policy allows connections to its own site only (`connect-src 'self'`) so it can read `/version.json`; no other host.

## What gets published (and what does not)

Stage exactly: `index.html`, `_headers`, `css/`, `js/`, `auth/gate.js`, `auth/gate.css`, `admin/` (3 files), `netlify.toml`, `package.json`, `package-lock.json`, `netlify/edge-functions/gate.ts`, `netlify/functions/` (login, session, logout, admin), `netlify/shared/` (auth, people, http, site), then stamp it: `node scripts/stamp-version.mjs <staging folder>` (see above). **Do not publish** `results/`, `tests/`, `README.md` or
this folder's other files: the results page is for your own computer, and the tests are for development.

Nothing is published or deployed by working in this folder.

## Run the tests

    node --test tests/*.test.js tests/*.test.mjs   # ordering, validation, cleaning, sending, results analysis, sign-in gate

Browser tests (taps, drag, resume, double-tap, sending, other windows, the results page) are in `tests/browser/`.
They need Playwright, which is not a dependency of this project: see the comment at the top of each file.

## Files

| File | Role |
|---|---|
| `js/questions.js` | **All the wording.** Edit questions, options and the welcome/thank-you text here. |
| `js/logic.js` | Pure logic: random order, tap/untap rules, validation, cleaning, and turning answers into form fields. |
| `js/survey.js` | The screens and interaction (grid, pick, drag/arrow ranking, text, contact). |
| `js/dom.js` | Safe DOM builder: text only, listed tags and attributes only. |
| `js/config.js` | Sending (Netlify Forms, https sites only) and the optional privacy note shown on the first screen. |
| `index.html`, `css/survey.css` | The page, with the hidden forms Netlify reads and a strict Content-Security-Policy. |
| `_headers` | Production security headers for when it is hosted. |
| `results/` | Your analysis tools: `index.html` (page), `analyze.js` (the numbers), `analyze-cli.js`, `sample.js` (fake data). |

## Privacy and safety

- Asks for no bank details, age, income or amounts. The only personal data is an optional email at the very end, kept
  in its own submission. Both submissions are sent within a moment of each other from the same browser, and Netlify may
  record details such as time, IP address and browser type with each, so someone with access to your Netlify account could still
  match them. Treat both forms as personal data, and delete the contact submissions once the invitations have gone out.
- The **privacy note** in `js/config.js` (`privacyNote`) is shown on the first screen. It promises: answers kept 90 days after the survey closes, emails deleted once invitations go out (or within 90 days of closing), and removal on request by email. **Keep those promises:** put a date in your calendar to export and delete the Netlify submissions, and update the note if you change anything.
- Progress is saved in the respondent's own browser (`localStorage`), is forgotten after 7 days, is cleared when they
  finish, and a second open window resets itself if another finished the response. An email typed and then
  un-chosen ("No, thanks") is removed.
- Every answer is checked against the list of allowed options and cleaned before it is sent: invisible characters
  (zero-width, direction marks, emoji selectors, soft hyphens) are deleted, control and unassigned characters become a
  space, half-emoji are replaced, text is normalised, and lengths are capped. Ordinary text, accents, other scripts and
  emoji are unchanged (emoji lose their colour-style selector). Text is only ever shown as text, never as HTML.
- The email must be a plain ASCII address and cannot start with a symbol. Treat it as data only if you use it anywhere:
  it can contain characters such as `'` or `&`, so use parameterised queries, never put it on a command line, and
  escape it wherever it is displayed or mailed.
- The page's security policy blocks scripts from elsewhere and inline scripts, and allows network requests only to the
  same site (to send the answers). The results page allows no network requests at all.

## Reading results safely

Answers are stored as typed, so a free-text answer can begin with `=`, `+`, `-` or `@` (even after spaces). **If you open Netlify's own CSV
export directly in Excel or Google Sheets, those cells can run as formulas.** Use the results page's downloads (they add
a protective prefix, shown as a leading apostrophe), or look at the export in a plain-text editor first. Do not strip these
characters at input, because `-` and `+` are normal in sentences. The Markdown summary escapes other people's text so it
cannot create links, images or headings, but open it in a plain-text editor or a viewer you trust.

## Hosting

`_headers` has the response headers to set (Netlify / Cloudflare Pages format). A `<meta>` policy can't forbid other
sites from framing the page; the header version can. Put the survey on its own address, not one shared with another
app, because browser storage is shared per address.

## Known limits (reviewed and left as they are)

- **No browser Back-button support.** The in-page Back button works; the phone's Back button leaves the survey.
  Progress is kept, so reopening it resumes on the same question.
- **Compound emoji** (e.g. family or profession emoji) fall apart into their parts in free text. Safer than allowing invisible characters.
- **Tap protection:** Next/Back ignore a second tap within 0.3 seconds, and "Start over" within 0.6 seconds of arming, to survive double-taps. A very fast, deliberate second tap is ignored too.
- **Another window** that clears the saved response resets this page; if a send fails after that, the next edit can save progress again.
- **Clock:** saved progress is dropped when it is older than 7 days or timestamped in the future, which also happens if the device clock is changed a lot.
- **English only.** Dragging doesn't auto-scroll the page; the arrow buttons cover long lists.
- **The results tool reads only the survey's own columns** and refuses files with more than 300 columns or 50,000 rows or over 5 MB, so a hostile export cannot use up your computer's memory.
- **Not verified live yet:** the Netlify side (forms detected, submissions arriving) can only be confirmed after publishing.
  The sending code is tested against a pretend server, not the real one.
