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

---

## Catalyst Components Used

### Catalyst Slate
- **App name:** `pr-trail-ui`
- **Framework:** React + Vite
- Hosts the frontend SPA at `https://own-pr.onslate.in`
- Configured via `pr-trail-ui/dist/.catalyst/slate-config.toml` (recreated after each build)
- Auth handled via the Catalyst Web SDK CDN (`catalystWebSDK.js`) loaded in `index.html`

### Catalyst Advanced I/O Function
- **Function name:** `pr_trail_api`
- **Runtime:** Node.js 24 (`node24`)
- **Type:** `advancedio` (raw HTTP handler — full control over request/response)
- Serves as the REST API backend for all data operations
- Uses `zcatalyst-sdk-node` for DataStore and ZCQL access
- **Function URL:** `https://ownpr-60047186223.development.catalystserverless.in/server/pr_trail_api/execute`

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
│   └── pr_trail_api/
│       ├── index.js                   # Advanced I/O handler — all API routes
│       ├── package.json
│       ├── package-lock.json
│       └── catalyst-config.json       # Function type/stack config
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
            ├── ExerciseTable.jsx      # Pivot table with exercise locking, inline edit/delete
            ├── HistoryAccordion.jsx   # Month-grouped sessions with supplement badges
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
# Deploy function
catalyst deploy --only functions:pr_trail_api -ni

# Build + deploy Slate (slate-config.toml must be recreated after each build)
cd pr-trail-ui && npm run build
mkdir -p dist/.catalyst && printf '[app]\nname = "pr-trail-ui"\n' > dist/.catalyst/slate-config.toml
cd .. && catalyst deploy slate pr-trail-ui -ni
```

> **Note:** `slate-config.toml` lives inside `dist/.catalyst/` and is wiped by every `npm run build`. Always recreate it before deploying Slate.
