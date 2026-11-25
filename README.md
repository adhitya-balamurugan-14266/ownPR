# HypertrophyMAX — Personal Gym Progress Tracker

**Live URL:** https://hypertrophy-max.onslate.in (invite-only — sign in required)

HypertrophyMAX (formerly OwnPR) is a personal gym tracking application built entirely on Catalyst by Zoho. Log workout sessions, track sets/reps/weight per exercise, detect personal records (PRs) automatically, and monitor supplement intake (preworkout + Whey).

> Internal resource names keep the original naming (Catalyst project `OwnPR`, function `pr_trail_api`) since renaming them would change the deployed API URL. The Slate app itself is `hypertrophyMAX`.

---

## Features

- **Invite-only sign-in** via Catalyst hosted login — every user sees only their own data (see [Authentication](#authentication))
- Landing page with brand identity and three buttons: **Power Through Now** (opens Today), **Current PRs** (at-a-glance snapshot) and **History** (opens the past-sessions view directly)
- Start a new session with body part selection and preworkout logging
- Add exercises with set-by-set weight and rep tracking
- Exercise locking — stay on the same exercise across sets; switch with "Next Exercise"
- Automatic PR detection — alerts when you beat a previous best (volume, reps, or weight — with inverted weight logic for assisted-machine exercises)
- Inline edit and delete for individual sets
- Close session with Whey intake logging (named BCAA before 2026-10-03 — see below)
- Delete entire sessions (with in-app confirmation modal)
- History view grouped by month — shows exercises, sets, and supplement data per session
- **Download JSON** menu in the History tab: export today, any day, any month, or the full history

### Authentication
- **Invite-only:** public sign-up is disabled; only users invited from the Catalyst console (Authentication → Users) can sign in
- **Hosted login:** opening the app while signed out redirects to Catalyst's hosted Sign In page (`/__catalyst/auth/login`); after sign-in it returns to `/`
- **Signed-in state is visible:** the landing page shows *Signed in as &lt;email&gt; · Log out*, and the app header has a **Log out** button
- **Per-user data:** every row in WorkoutLog, ExerciseEntry, PRRecord and ExerciseLibrary carries an `owner_id` (the Catalyst user ID). Every API query is filtered by it, inserts are stamped with it, and edits/deletes on another user's rows return `404`
- **Per-user exercise dropdown:** the exercise list is built from each user's own ExerciseLibrary rows
- **All pre-auth history belongs to the owner account** (`owner_id` back-filled on every existing row); invited users start with an empty slate
- **How identity reaches the API:** the frontend calls the function on Slate's own domain (`https://hypertrophy-max.onslate.in/server/pr_trail_api/execute/...`). Slate forwards `/server/...` requests to the function when they carry the Catalyst app headers (`Accept: application/vnd.catalyst.v2+json`, `CATALYST-COMPONENT: true`, added by `addDefaultAppHeaders()`); without those headers Slate serves `index.html` instead. Because the call is same-origin, the login cookie goes with it, and the function resolves the caller with `userManagement().getCurrentUser()`, answering `401 Not signed in` when there is no user
- **Why not a cross-domain token:** the app previously called the `catalystserverless.in` URL with a token from `catalyst.auth.generateAuthToken()`. On 2026-11-24 Catalyst started rejecting the SDK's internal `custom-token` request (400 `PATTERN_NOT_MATCHED`) and the SDK then hung without resolving, leaving the app stuck on "Loading…". The same-origin route needs no token at all
- **CSRF:** `X-ZCSRF-TOKEN: zd_csrparam=<ZD_CSRF_TOKEN cookie>` is added only when that cookie is readable; an empty value is never sent (Catalyst rejects `zd_csrparam=` with `PATTERN_NOT_MATCHED`)
- **No endless loading:** every API call has a 20-second timeout, and a `401` shows *Session expired: tap Log out and sign in again*

### REST Day Tracking
- Every day between the first ever log and today that has no workout session is automatically shown as a **REST DAY** row in the history view
- REST day rows are visually dimmed and non-interactive — they exist purely for continuity
- **Make REST Day Active** — each REST day row has a "Make Active" button that expands an inline form (body part + preworkout) to retroactively create a session for that date
- After activation, the row becomes a live session with the full exercise logging table (add, edit, delete sets) and an inline **Close Session** button with BCAA logging
- The session count in each month header counts only real workout sessions — REST days are not counted

### Month Stats Counter
- Each month section header shows three counters inline:
  - **Active Days** (green) — number of logged workout sessions
  - **Rest Days** (red) — number of rest days in that month
  - **Total Days** (purple) — total calendar days in the month

### Exercise Totals
- Every exercise row in the pivot table (both active session and history) has a green **Total** column on the right
- Shows **total reps** (sum across all sets) and **total volume** (sum of weight × reps per set, in kg)
- Updates live in the active session as new sets are added

### Daily Rest Day Reminder Email
- A Catalyst Job function (`rest_day_checker`) runs daily at **8:00 AM IST** via a Catalyst cron
- Runs **per user**: loops every app user and checks only that user's own WorkoutLog rows
- If 3 or more consecutive REST days are detected going backwards from yesterday, the reminder goes to **that user's own email**:
  - **Subject:** `Move your Ass`
  - **Body:** `Hit your PRs don't lose out on the progress just cause you're lazy....`
- The email fires every day until an active session is logged — no manual intervention needed to start or stop it
- Sent via a verified Catalyst Mail sender configuration (Catalyst console → Mail → Email Configuration)

### Current PRs Quick View
- A **Current PRs** button sits beside "Power Through Now" on the landing page
- Opens a popup table listing every exercise ever logged with its current-best weight, reps, and sets — a live snapshot, not the full PR event history
- Recomputed fresh from every logged set (not from the PR event log), so exercises with only a single session ever logged are still included

### Inverted PR Logic for Assisted Exercises
- **Assisted Dips** and **Assisted Pullups** use assisted machines, where *less* assistance weight means *more* real strength
- For these two exercises only, a **lower** weight than the previous best counts as a PR — reps and sets still follow the normal "higher is better" rule
- Applied consistently across live PR detection, the PR history rebuild, and the Current PRs snapshot

### JSON Data Export
- The **⬇ Download JSON ▾** button in the History tab opens a menu with four options:
  - **Download Today**: today's session
  - **Download Any Day**: opens a date picker (up to today), then exports that day's session
  - **Download Any Month**: opens a month picker (year arrows + Jan–Dec grid, future months disabled), then exports every session in that month
  - **Download Legacy**: the full history, every session from the latest back to the first
- Files are named `hypertrophymax-<today|day|month|legacy>-<date>.json` (for example `hypertrophymax-month-2026-10.json`)
- Each file has `exported_at`, a `scope` (`{type, value}`), the matching workout `logs` (newest first, each with its exercise entries nested inside) and the matching `prs` events
- If a Today, Day or Month pick has no sessions (for example, a rest day), nothing is downloaded and an inline "No sessions logged…" message is shown
- Filtering happens in the browser on top of `GET /export`, which only ever returns the signed-in user's data
- Meant for feeding into external AI tools for a fuller picture of progress over time

### Body Parts & Supplement Naming
- Body part options include **Arms and Legs**, plus split days **Push Day A / B (Chest, Shoulder, Triceps)**, **Pull Day A / B (Back, Shoulder, Biceps)** and **Leg Day** (these replaced the old generic Push Day / Pull Day options; past sessions logged under the old names keep their label in history)
- The supplement checkbox reads **Whey** for any session closed on or after **2026-10-03**; sessions closed before that date keep showing **BCAA** in history, since only the label for new entries changed

---

## Catalyst Components Used

### Catalyst Slate
- **App name:** `hypertrophyMAX` (must match `catalyst.json` → `slate[0].name`; the CLI deploys Slate by name and creates a new app if the name doesn't exist)
- **Framework:** React + Vite
- Hosts the frontend SPA at `https://hypertrophy-max.onslate.in`
- Configured via `pr-trail-ui/dist/.catalyst/slate-config.toml` (recreated after each build)
- Auth handled via the Catalyst Web SDK **4.6.1** CDN (`catalystWebSDK.js`) + `/__catalyst/sdk/init.js` loaded in `index.html` (login gate + sign-out)
- Also fronts the API: `/server/pr_trail_api/execute/...` on the Slate domain is forwarded to the function (see [Authentication](#authentication))

### Catalyst Functions

**`pr_trail_api`** — Advanced I/O
- **Runtime:** Node.js 24 (`node24`)
- **Type:** `advancedio` (raw HTTP handler — full control over request/response)
- Serves as the REST API backend for all data operations
- Uses `zcatalyst-sdk-node` for DataStore and ZCQL access
- **Function URL:** `https://ownpr-60047186223.development.catalystserverless.in/server/pr_trail_api/execute` (the app itself calls it through Slate as `/server/pr_trail_api/execute`)

**`rest_day_checker`** — Job
- **Runtime:** Node.js 24 (`node24`)
- **Type:** `job` — invoked by the Catalyst cron scheduler, not via HTTP
- For each app user, queries their WorkoutLog rows for consecutive REST days; emails that user if 3+ are found
- Triggered daily at **8:00 AM IST** by the `rest_day_reminder` cron job

### Catalyst DataStore
Four tables with ZCQL queries for all reads and writes. Every table has an `owner_id` column (Text, Catalyst user ID) that scopes rows to their user:

**WorkoutLog**
| Column | Type | Notes |
|---|---|---|
| `log_date` | Text | `YYYY-MM-DD` |
| `body_part` | Text | e.g. Chest, Push Day A (Chest, Shoulder, Triceps) |
| `preworkout_taken` | Text | `'true'` / `'false'` |
| `preworkout_qty` | Number | Scoops |
| `bcaa_taken` | Text | `'true'` / `'false'` |
| `bcaa_qty` | Number | Scoops |
| `is_closed` | Text | `'true'` / `'false'` |
| `owner_id` | Text | Catalyst user ID of the owner |

**ExerciseEntry**
| Column | Type | Notes |
|---|---|---|
| `log_id` | Number | FK → WorkoutLog.ROWID |
| `exercise_name` | Text | e.g. Bench Press |
| `set_number` | Number | 1-based, gaps allowed after deletes |
| `reps` | Number | |
| `weight` | Number | kg |
| `owner_id` | Text | Catalyst user ID of the owner |

**PRRecord** — one row per PR event (exercise, weight, reps, sets, date, `owner_id`)

**ExerciseLibrary** — each user's exercise names for the dropdown (`name`, `owner_id`; the same name can exist once per user)

### Catalyst Auth Client
- **Package:** `@zcatalyst/auth-client`
- Used in the frontend (`src/api.js`) via `addDefaultAppHeaders()` for the Catalyst app headers, which Slate needs in order to forward `/server/...` calls to the function

---

## API Routes

All routes require a signed-in user (`401` otherwise) and only ever read or write that user's rows.

| Method | Path | Description |
|---|---|---|
| `GET` | `/whoami` | The signed-in user's ID and email |
| `POST` | `/log` | Create a new workout session |
| `GET` | `/logs` | Fetch all sessions |
| `PUT` | `/log/:id/close` | Close session, record BCAA data |
| `DELETE` | `/log/:id` | Delete session and all its entries |
| `GET` | `/log/:id/entries` | Fetch all sets for a session |
| `POST` | `/entry` | Add a set; triggers PR check |
| `PUT` | `/entry/:id` | Edit a set (reps/weight) |
| `DELETE` | `/entry/:id` | Delete a single set |
| `GET` | `/exercises` | The user's exercise names (dropdown) |
| `GET` | `/prs` | The user's PR event history |
| `POST` | `/backfill-prs` | Rebuild the user's PR history from their logged sets |
| `GET` | `/current-prs` | Current best weight/reps/sets per exercise (snapshot view) |
| `GET` | `/export` | Full data export — all logs (with nested entries) + PR records, as JSON |

---

## Project Structure

```
OwnPR/
├── .catalystrc                        # Catalyst project config (project ID, env)
├── catalyst.json                      # Catalyst CLI manifest (functions + slate targets)
├── .gitignore
├── README.md
│
├── functions/
│   ├── pr_trail_api/
│   │   ├── index.js                   # Advanced I/O handler — all API routes
│   │   ├── package.json
│   │   ├── package-lock.json
│   │   └── catalyst-config.json       # Function type/stack config
│   └── rest_day_checker/
│       ├── index.js                   # Job function — daily REST day email check
│       ├── package.json
│       └── catalyst-config.json       # type: job, stack: node24
│
└── pr-trail-ui/
    ├── index.html                     # Catalyst SDK script tags + favicon
    ├── vite.config.js
    ├── package.json
    ├── package-lock.json
    ├── .env.production                # VITE_API_BASE=/server/pr_trail_api/execute (same-origin via Slate)
    │
    ├── public/
    │   ├── hypertrophymax-logo.png    # Full brand logo (landing page)
    │   ├── hm-mark.png                # HM monogram (header)
    │   ├── favicon.png                # HM monogram, 64px
    │   ├── apple-touch-icon.png       # HM monogram, 180px
    │   ├── _redirects                 # SPA fallback: /* /index.html 200
    │   └── client-package.json        # Slate client config (login_redirect)
    │
    └── src/
        ├── main.jsx                   # Auth gate: hosted-login redirect if signed out, then React mount
        ├── App.jsx                    # Screen router: landing → app (today/history tabs) + Log out
        ├── api.js                     # Same-origin fetch helpers (Catalyst headers, CSRF, 20s timeout) + signOut()
        ├── index.css                  # Global dark theme styles
        ├── App.css
        │
        └── components/
            ├── LandingPage.jsx        # Logo + Power Through Now / Current PRs / History + "Signed in as … · Log out"
            ├── CurrentPRsModal.jsx    # Popup table of current-best weight/reps/sets per exercise
            ├── DownloadMenu.jsx       # Download JSON menu: Today / Any Day / Any Month / Legacy + pickers
            ├── TodayLog.jsx           # Active session: create, log sets, close/delete
            ├── ExerciseTable.jsx      # Pivot table with exercise locking, inline edit/delete + totals column
            ├── HistoryAccordion.jsx   # Month-grouped sessions, REST day rows, make-active flow, Download menu
            ├── CloseLog.jsx           # Whey/BCAA intake form on session close
            ├── PRBanner.jsx           # Animated PR alert banner
            └── ConfirmModal.jsx       # In-app delete confirmation overlay
```

---

## Local Development

```bash
# Install frontend deps
cd pr-trail-ui && npm install

# Install function deps
cd functions/pr_trail_api && npm install

# Build frontend
cd pr-trail-ui && npm run build
```

## Deploy

```bash
# Deploy API function
catalyst deploy --only functions:pr_trail_api -ni

# Deploy rest day checker job function
catalyst deploy --only functions:rest_day_checker -ni

# Build + deploy Slate (slate-config.toml must be recreated after each build)
cd pr-trail-ui && npm run build
mkdir -p dist/.catalyst && printf '[app]\nname = "hypertrophyMAX"\n' > dist/.catalyst/slate-config.toml
cd .. && catalyst deploy slate hypertrophyMAX -ni
# Expect: App Url(hypertrophyMAX): https://hypertrophy-max.onslate.in
```

> **Note:** `slate-config.toml` lives inside `dist/.catalyst/` and is wiped by every `npm run build`. Always recreate it before deploying Slate.

## Job Scheduling

| Cron | Schedule | Function | Purpose |
|---|---|---|---|
| `rest_day_reminder` | `0 8 * * *` (8 AM IST daily) | `rest_day_checker` | Emails each user whose own history shows 3+ consecutive REST days |
