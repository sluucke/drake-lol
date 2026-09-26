# drake-analytics

Cloudflare Worker + D1 that counts Drake installs and sessions, and serves a private dashboard.

## What the tray sends

`POST /v1/events`, at startup, every 15 minutes, and on quit:

| Field | Example | Notes |
|---|---|---|
| `install_id` | `3f2b8c1e-…` | random UUID v4 in `%PROGRAMDATA%\Drake\state\install-id` |
| `session_id` | `a1b2c3d4-…` | random UUID v4 per Drake run |
| `app_version` | `0.3.25` | |
| `event` | `startup` / `heartbeat` / `close` | |
| `lol_region` | `BR` | from the client's `/riotclient/region-locale` |
| `locale` | `pt_BR` | client locale |
| `mode` | `own` / `guest` / `inactive` | injection mode |
| `streaming` | `in-client` / `overlay` | |
| `os_build` | `26200` | Windows build |

The country comes from Cloudflare's `request.cf.country`. The IP is never stored. There is no summoner name, PUUID or account data. Users can switch it off under Settings → Updates in the in-client panel.

## Deploy

```bash
npm install
npx wrangler d1 create drake-analytics
```

Put the `database_id` it prints into `wrangler.toml`, then:

```bash
npm run db:migrate
npx wrangler secret put DASHBOARD_TOKEN
npm run deploy
```

Open the deployed URL and log in with `DASHBOARD_TOKEN`. Point the tray at `https://<worker-host>/v1/events` by setting `ENDPOINT` in `src-tauri/src/analytics.rs`, or by building with `DRAKE_ANALYTICS_URL` set.

## Local

```bash
echo DASHBOARD_TOKEN=dev > .dev.vars
npm run db:migrate:local
npm run dev
```

## Retention

A daily cron deletes sessions older than 180 days and daily activity older than 400 days. `installs` keeps one row per install.
