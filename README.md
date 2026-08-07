# OwnPR — Personal Gym Progress Tracker

**Live URL:** https://own-pr.onslate.in

OwnPR is a personal gym tracking application built entirely on Catalyst by Zoho. Log workout sessions, track sets/reps/weight per exercise, detect personal records (PRs) automatically, and monitor supplement intake (preworkout + BCAA).

---

## Features

- Landing page with brand identity and quick entry CTA
- Start a new session with body part selection and preworkout logging
- Add exercises with set-by-set weight and rep tracking
- Exercise locking — stay on the same exercise across sets; switch with "Next Exercise"
- Automatic PR detection — alerts when you beat a previous best (volume or max weight)
- Inline edit and delete for individual sets
- Close session with BCAA intake logging
- Delete entire sessions (with in-app confirmation modal)
- History view grouped by month — shows exercises, sets, and supplement data per session

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
- If 2 or more consecutive REST days are detected going backwards from yesterday, an email is sent to the owner:
  - **Subject:** `Move your Ass`
  - **Body:** `Hit your PRs don't lose out on the progress just cause you're lazy....`
- The email fires every day until an active session is logged — no manual intervention needed to start or stop it

---

## Catalyst Components Used

### Catalyst Slate
- **App name:** `pr-trail-ui`
- **Framework:** React + Vite
- Hosts the frontend SPA at `https://own-pr.onslate.in`
- Configured via `pr-trail-ui/dist/.catalyst/slate-config.toml` (recreated after each build)
- Auth handled via the Catalyst Web SDK CDN (`catalystWebSDK.js`) loaded in `index.html`

### Catalyst Functions

**`pr_trail_api`** — Advanced I/O
- **Runtime:** Node.js 24 (`node24`)
- **Type:** `advancedio` (raw HTTP handler — full control over request/response)
- Serves as the REST API backend for all data operations
- Uses `zcatalyst-sdk-node` for DataStore and ZCQL access
- **Function URL:** `https://ownpr-60047186223.development.catalystserverless.in/server/pr_trail_api/execute`

**`rest_day_checker`** — Job
- **Runtime:** Node.js 24 (`node24`)
- **Type:** `job` — invoked by the Catalyst cron scheduler, not via HTTP
- Queries WorkoutLog for consecutive REST days; sends a reminder email if 2+ are found
- Triggered daily at **8:00 AM IST** by the `rest_day_reminder` cron job

### Catalyst DataStore
Two tables with ZCQL queries for all reads and writes:

**WorkoutLog**
| Column | Type | Notes |
|---|---|---|
| `log_date` | Text | `YYYY-MM-DD` |
| `body_part` | Text | e.g. Chest, Push Day |
| `preworkout_taken` | Text | `'true'` / `'false'` |
| `preworkout_qty` | Number | Scoops |
| `bcaa_taken` | Text | `'true'` / `'false'` |
| `bcaa_qty` | Number | Scoops |
| `is_closed` | Text | `'true'` / `'false'` |

**ExerciseEntry**
| Column | Type | Notes |
|---|---|---|
| `log_id` | Number | FK → WorkoutLog.ROWID |
| `exercise_name` | Text | e.g. Bench Press |
| `set_number` | Number | 1-based, gaps allowed after deletes |
| `reps` | Number | |
| `weight` | Number | kg |

### Catalyst Auth Client
- **Package:** `@zcatalyst/auth-client`
- Used in the frontend (`src/api.js`) via `addDefaultAppHeaders()` to attach Catalyst auth tokens to every API request from the browser

---

## API Routes

| Method | Path | Description |
|---|---|---|
| `POST` | `/log` | Create a new workout session |
| `GET` | `/logs` | Fetch all sessions |
| `PUT` | `/log/:id/close` | Close session, record BCAA data |
| `DELETE` | `/log/:id` | Delete session and all its entries |
| `GET` | `/log/:id/entries` | Fetch all sets for a session |
| `POST` | `/entry` | Add a set; triggers PR check |
| `PUT` | `/entry/:id` | Edit a set (reps/weight) |
| `DELETE` | `/entry/:id` | Delete a single set |

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
    ├── .env.production                # VITE_API_BASE — function URL baked at build time
    │
    ├── public/
    │   ├── ownpr-logo.png             # Brand logo (favicon + landing + header)
    │   ├── _redirects                 # SPA fallback: /* /index.html 200
    │   └── client-package.json        # Slate client config (login_redirect)
    │
    └── src/
        ├── main.jsx                   # Catalyst getCredentials() before React mount
        ├── App.jsx                    # Screen router: landing → app (today/history tabs)
        ├── api.js                     # All fetch helpers with Catalyst auth headers
        ├── index.css                  # Global dark theme styles
        ├── App.css
        │
        └── components/
            ├── LandingPage.jsx        # Logo + "Power Through Now" CTA
            ├── TodayLog.jsx           # Active session: create, log sets, close/delete
            ├── ExerciseTable.jsx      # Pivot table with exercise locking, inline edit/delete + totals column
            ├── HistoryAccordion.jsx   # Month-grouped sessions, REST day rows, make-active flow
            ├── CloseLog.jsx           # BCAA intake form on session close
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
mkdir -p dist/.catalyst && printf '[app]\nname = "pr-trail-ui"\n' > dist/.catalyst/slate-config.toml
cd .. && catalyst deploy slate pr-trail-ui -ni
```

> **Note:** `slate-config.toml` lives inside `dist/.catalyst/` and is wiped by every `npm run build`. Always recreate it before deploying Slate.

## Job Scheduling

| Cron | Schedule | Function | Purpose |
|---|---|---|---|
| `rest_day_reminder` | `0 8 * * *` (8 AM IST daily) | `rest_day_checker` | Sends reminder email when 2+ consecutive REST days are detected |
