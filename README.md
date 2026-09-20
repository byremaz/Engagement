# ASAS Challenge

Real-time website for a 30-minute employee engagement event (Elm visual identity, **Built using ASAS**).
More than 50 participants play from their phones in one room while a host controls the flow and a large
shared display shows the arena, reveals and the ceremony.

Games, in event order:

1. **Red Light, Green Light** - hold to move on GREEN; moving on RED eliminates you for the current race only.
2. **Pin the Country** - rotate the globe and drop a pin inside the named country; distance decides the score.
3. **Order It!** - arrange four cards in the requested order; each correct position earns 20 points, and a perfect fast lock adds a speed bonus.

Each game is worth up to 1,000 points (tournament total 3,000). All scoring runs on the server.

**Scoring v2 (rule version `2.0.0`, see `docs/redesign-plan-v2.md` §7):** every round is worth 100 — up to **80 for the achievement** (finish / inside the country / 4 of 4) plus up to **20 for speed**. Speed counts only with the full achievement and a manual lock, so a fast wrong answer never beats a slow right one. Eliminated in a race = 0 for that race. Sessions created before v2 keep their frozen `1.2.0` rules.

## Repository layout

```
apps/api           NestJS backend: REST under /v1, Socket.IO gateway, PostgreSQL persistence
apps/web           Angular 19 frontend: participant phone (/), shared display (/display), host (/host)
packages/shared    Types, content bank and pure scoring engine shared by both apps
```

## Prerequisites

- Node.js 20 LTS or newer
- Docker (for PostgreSQL) or a reachable PostgreSQL 14+ instance

### No Docker? Use a locally installed PostgreSQL

Docker is optional. If PostgreSQL is installed directly on the machine (Windows
service `postgresql-x64-NN`), create the role and database from `.env` instead
of running `npm run db:up`:

```powershell
$env:PGSUPERPASS = '<password of the postgres superuser>'
npm run db:provision -w apps/api
Remove-Item Env:PGSUPERPASS
npm run db:migrate -w apps/api
```

`npm run db:diagnose -w apps/api` reports which server actually owns port 5432
and why a connection failed, without printing any secret.

## First-time setup

```bash
npm install
cp .env.example .env          # then fill in the values below
npm run db:up                 # starts PostgreSQL via docker compose
npm run build:shared
npm run db:migrate -w apps/api
```

`.env` values you must set (never commit this file):

| Variable | Purpose |
|---|---|
| `POSTGRES_PASSWORD` / `DATABASE_URL` | Database credentials |
| `HOST_ACCESS_KEY` | Long random secret typed into the host dashboard; the API refuses to start without it |
| `TOKEN_SECRET` | 32+ character secret used to sign participant and display tokens |
| `PUBLIC_WEB_URL` | Public URL encoded in the lobby QR code (e.g. `https://challenge.example.com`) |
| `CORS_ORIGINS` | Comma-separated browser origins allowed to call the API |

## Running locally

```bash
npm run dev:api     # http://localhost:3000  (REST at /v1, WebSocket on the same port)
npm run dev:web     # http://localhost:4200  (proxies /v1 to the API)
```

Routes:

| Route | Audience |
|---|---|
| `/` or `/join/:code` | Participant phones (QR code or session code + name) |
| `/display` | Shared large screen (1920 x 1080, main audio source, no admin controls) |
| `/host` | Protected host dashboard (requires `HOST_ACCESS_KEY`) |

## Tests and checks

```bash
npm test                      # shared scoring engine + API engine/transition/device tests
npm run lint                  # API type check
npm run build                 # shared -> api -> web production build
```

## Documentation

| Document | Contents |
|---|---|
| `docs/operating-guide.md` | Host operating guide: setup, display/audio test, joining, device capture, explanations, signal modes, transitions, recovery, export (§16 deliverable 5). |
| `docs/deploy-render.md` | Deploying to Render: one web service serves the API and the bundle from a single origin, region and latency, free-plan limits to fix before event day. |
| `docs/acceptance-evidence.md` | Evidence per acceptance criterion, data sources, deviations and known operational limitations (§16 deliverables 6-7). |

## Event-day checklist

1. Start PostgreSQL, the API and the web app on the venue network; confirm `GET /v1/health` returns OK.
2. Open `/host`, enter the host key, create the session (title, capacity 100) and open joining.
3. Open `/display` on the big screen and enter full screen; verify the QR code resolves to `PUBLIC_WEB_URL`.
4. Use **Rehearsal** on the host dashboard to walk through every game without recording tournament points.
5. Follow the stage buttons in order: Show Instructions -> Start Practice -> Start Game -> Start Round -> Reveal Results -> Next Round ... -> Show Game Results -> Next Game -> Show Final Results -> Ceremony.
6. Timers only close input; nothing advances without a host action. Pause / Resume and Void & Replay are available for technical problems.
7. Export `standings.csv` (public) or `standings.csv?scope=private` (adds device columns) and `rounds.csv`, then close the session.

## Design notes

- Server-authoritative gameplay: signal state, elimination, pin distance and card scoring are computed on the API; clients never send scores.
- Identity survives reloads via a private recovery code stored on the device; one active controller per participant.
- Timers, reveals and stage changes are separate: a closed round shows "Waiting for the host" until the host reveals.
- Content and scoring rules are frozen per session; a defective round is voided and replayed for everyone with the reason retained.
