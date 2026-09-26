import { countryOf, parsePing, utcDay, type Ping } from './validate';
import { collectStats } from './stats';
import { DASHBOARD_HTML } from './dashboard';

export interface Env {
  DB: D1Database;
  DASHBOARD_TOKEN: string;
}

const HEARTBEAT_FLOOR_S = 60;
const SESSION_RETENTION_DAYS = 180;
const DAILY_RETENTION_DAYS = 400;
const MAX_BODY_BYTES = 2048;

export function ingestStatements(db: D1Database, ping: Ping, country: string | null, now: number): D1PreparedStatement[] {
  const ended = ping.event === 'close' ? 1 : 0;
  return [
    db
      .prepare(
        `INSERT INTO installs (install_id, first_seen, last_seen, app_version, lol_region, locale, country, os_build, mode, streaming)
         VALUES (?1, ?2, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
         ON CONFLICT (install_id) DO UPDATE SET
           last_seen = excluded.last_seen,
           app_version = excluded.app_version,
           lol_region = COALESCE(excluded.lol_region, installs.lol_region),
           locale = COALESCE(excluded.locale, installs.locale),
           country = COALESCE(excluded.country, installs.country),
           os_build = COALESCE(excluded.os_build, installs.os_build),
           mode = COALESCE(excluded.mode, installs.mode),
           streaming = COALESCE(excluded.streaming, installs.streaming)`,
      )
      .bind(ping.install_id, now, ping.app_version, ping.lol_region, ping.locale, country, ping.os_build, ping.mode, ping.streaming),
    db
      .prepare(
        `INSERT INTO sessions (session_id, install_id, started_at, last_seen, ended, app_version, lol_region, country)
         VALUES (?1, ?2, ?3, ?3, ?4, ?5, ?6, ?7)
         ON CONFLICT (session_id) DO UPDATE SET
           last_seen = excluded.last_seen,
           ended = MAX(sessions.ended, excluded.ended),
           lol_region = COALESCE(excluded.lol_region, sessions.lol_region)
         WHERE sessions.install_id = excluded.install_id
           AND (excluded.ended = 1 OR excluded.last_seen - sessions.last_seen >= ${HEARTBEAT_FLOOR_S})`,
      )
      .bind(ping.session_id, ping.install_id, now, ended, ping.app_version, ping.lol_region, country),
    db
      .prepare(
        `INSERT INTO daily (day, install_id, app_version, lol_region, country) VALUES (?1, ?2, ?3, ?4, ?5)
         ON CONFLICT (day, install_id) DO UPDATE SET
           app_version = excluded.app_version,
           lol_region = COALESCE(excluded.lol_region, daily.lol_region)`,
      )
      .bind(utcDay(now), ping.install_id, ping.app_version, ping.lol_region, country),
  ];
}

function timingSafeEqual(a: string, b: string): boolean {
  if (!a || !b || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function ingest(request: Request, env: Env): Promise<Response> {
  const length = Number(request.headers.get('content-length') ?? '0');
  if (length > MAX_BODY_BYTES) return new Response(null, { status: 413 });
  const text = await request.text();
  if (text.length > MAX_BODY_BYTES) return new Response(null, { status: 413 });
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return new Response(null, { status: 400 });
  }
  const ping = parsePing(body);
  if (!ping) return new Response(null, { status: 400 });
  const country = countryOf((request as Request & { cf?: { country?: unknown } }).cf?.country);
  await env.DB.batch(ingestStatements(env.DB, ping, country, Math.floor(Date.now() / 1000)));
  return new Response(null, { status: 204 });
}

async function stats(request: Request, env: Env): Promise<Response> {
  const auth = request.headers.get('authorization') ?? '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!timingSafeEqual(token, env.DASHBOARD_TOKEN ?? '')) return new Response(null, { status: 401 });
  const data = await collectStats(env.DB, Math.floor(Date.now() / 1000));
  return Response.json(data, { headers: { 'cache-control': 'no-store' } });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === '/v1/events' && request.method === 'POST') return ingest(request, env);
    if (url.pathname === '/api/stats' && request.method === 'GET') return stats(request, env);
    if (url.pathname === '/' && request.method === 'GET') {
      return new Response(DASHBOARD_HTML, {
        headers: {
          'content-type': 'text/html; charset=utf-8',
          'content-security-policy': "default-src 'self'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self'",
          'x-frame-options': 'DENY',
        },
      });
    }
    return new Response(null, { status: 404 });
  },

  async scheduled(_event: ScheduledController, env: Env): Promise<void> {
    const now = Math.floor(Date.now() / 1000);
    await env.DB.batch([
      env.DB.prepare('DELETE FROM sessions WHERE last_seen < ?1').bind(now - SESSION_RETENTION_DAYS * 86400),
      env.DB.prepare('DELETE FROM daily WHERE day < ?1').bind(utcDay(now - DAILY_RETENTION_DAYS * 86400)),
    ]);
  },
};
