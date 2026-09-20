# Deploying ASAS Challenge to Render

The whole app runs as **one Render web service plus one PostgreSQL database**.
The service serves the API under `/v1` and the built Angular bundle on every
other path, from the same origin.

That is deliberate, not a shortcut. Every call in the web app is a relative
`/v1/...` path and the realtime client opens `/v1/socket.io` on the current
origin. One origin therefore means no CORS, no reverse proxy in front of the
WebSocket, and one region for both halves. Splitting the bundle onto a separate
static host would put a proxy hop in front of every race frame, and the race
tolerance is 350-450 ms.

`render.yaml` in the repository root describes both resources.

## Before you start

| Requirement | Why |
|---|---|
| The repository pushed to GitHub or GitLab | Render builds from a Git branch; there is no upload path for a blueprint |
| A Render account with that Git account connected | Render needs read access to the repo |

`.env` is git-ignored and must stay that way. Every secret is set on Render, not
in the repository.

## Deploy

1. Push this repository to GitHub, on the branch named in `render.yaml` (`main`).
2. In Render choose **New → Blueprint**, pick the repository, and apply it.
   Render reads `render.yaml` and creates `asas-db` and `asas-challenge`.
3. Render generates `HOST_ACCESS_KEY` and `TOKEN_SECRET` automatically. Open the
   service's **Environment** tab and check both. The API refuses to boot unless
   the token secret is at least 32 characters, the host key at least 16, and the
   two differ. Replace either one if needed:

   ```bash
   openssl rand -hex 24
   ```

4. Leave `CORS_ORIGINS` empty. A same-origin deployment never uses it. Set it
   only if you later move the bundle to its own host.
5. Wait for the first deploy. The start command applies the database schema
   before the server listens, and the schema is idempotent, so it is safe on
   every boot and every redeploy.

When the service is live, open its URL:

| Path | Who |
|---|---|
| `/` | participant join screen |
| `/host` | host dashboard, asks for the host key |
| `/display` | shared display, needs the token the host generates |

Clean paths redirect to their hash route, so `/host` and `/#/host` both work.

## Region and latency

`render.yaml` pins both resources to **Frankfurt**, Render's closest region to
Riyadh. Network delay is charged to the player, and the red-signal tolerance is
350 ms in the third race, so a US region would eliminate people for their
connection rather than their reflexes. Do not change the region without
re-measuring. Keep the database in the same region as the service, otherwise
every query crosses the internet.

## Free plan limits that matter on event day

Both resources are on the free plan in the blueprint, which is right for
rehearsal and wrong for the event:

- **A free web service sleeps after 15 minutes of inactivity** and takes roughly
  a minute to wake. If the host opens the dashboard cold, the room waits.
- **A free PostgreSQL database expires 30 days after creation** and is then
  deleted.
- Free instances have less CPU and memory, which matters with 100 phones
  connected and a race ticking at 5 Hz.

Before the event, upgrade the web service to a paid instance and the database to
a paid plan, then redeploy and run a full rehearsal on the upgraded instance.
Upgrading does not change any URL.

## Verifying a deployment

Run the same checks the local build passes:

```bash
curl -s https://<your-service>.onrender.com/v1/health
```

It must report `"status":"ok"` and `"database":true`. Then open `/host`, create a
session, add simulated participants from the Rehearsal card, and play one race.
The headless rehearsal scripts also work against a deployment:

```bash
HOST_ACCESS_KEY=... BASE=https://<your-service>.onrender.com/v1 \
  bash docs/rehearsal-race-auto.sh
```

## What the build does

```
npm ci
npm run build:shared              # packages/shared -> dist
npm run build -w apps/api         # NestJS -> apps/api/dist (schema.sql copied in)
npm run build -w apps/web         # Angular -> apps/web/dist/web/browser
```

At boot the API looks for `apps/web/dist/web/browser/index.html` and serves it
when present. Set `WEB_ROOT` to override that path. When no bundle is found the
process runs as an API only, which is what `npm run dev:api` does locally while
the Angular dev server serves the UI.

## Content Security Policy

The API sends a strict policy: `script-src 'self'`, `script-src-attr 'none'`.
Two things follow, and both are already handled:

- `index.html` carries no inline script. The clean-path to hash-route
  translation runs inside the bundle, in `apps/web/src/main.ts`.
- Critical-CSS inlining is disabled in `angular.json`, because it makes the
  build defer the stylesheet with an inline `onload` handler that the policy
  refuses, which would leave part of the UI unstyled.

If you add an inline script or an inline handler later, the browser will refuse
it silently. Check the console before shipping.
