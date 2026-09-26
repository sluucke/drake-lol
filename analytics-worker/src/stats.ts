import { utcDay } from './validate';

export const ONLINE_WINDOW_S = 20 * 60;
const DAY = 86400;

export interface Bucket {
  key: string;
  count: number;
}

export interface Stats {
  generated_at: number;
  online: number;
  dau: number;
  wau: number;
  mau: number;
  total_installs: number;
  new_installs_7d: number;
  avg_session_minutes_7d: number | null;
  daily: { day: string; active: number; new_installs: number }[];
  versions: Bucket[];
  regions: Bucket[];
  countries: Bucket[];
  modes: Bucket[];
  streaming: Bucket[];
}

async function scalar(db: D1Database, sql: string, ...args: unknown[]): Promise<number> {
  const row = await db.prepare(sql).bind(...args).first<{ n: number | null }>();
  return Number(row?.n ?? 0);
}

async function buckets(db: D1Database, column: string, since: number): Promise<Bucket[]> {
  const { results } = await db
    .prepare(
      `SELECT COALESCE(${column}, 'unknown') AS key, COUNT(*) AS count
       FROM installs WHERE last_seen >= ?1 GROUP BY key ORDER BY count DESC LIMIT 12`,
    )
    .bind(since)
    .all<Bucket>();
  return results.map((r) => ({ key: String(r.key), count: Number(r.count) }));
}

export function lastDays(now: number, n: number): string[] {
  return Array.from({ length: n }, (_, i) => utcDay(now - (n - 1 - i) * DAY));
}

export async function collectStats(db: D1Database, now: number): Promise<Stats> {
  const today = utcDay(now);
  const days = lastDays(now, 30);
  const weekAgo = now - 7 * DAY;

  const [online, dau, wau, mau, total, fresh, avg] = await Promise.all([
    scalar(db, 'SELECT COUNT(*) AS n FROM sessions WHERE ended = 0 AND last_seen >= ?1', now - ONLINE_WINDOW_S),
    scalar(db, 'SELECT COUNT(*) AS n FROM daily WHERE day = ?1', today),
    scalar(db, 'SELECT COUNT(DISTINCT install_id) AS n FROM daily WHERE day >= ?1', days[23]),
    scalar(db, 'SELECT COUNT(DISTINCT install_id) AS n FROM daily WHERE day >= ?1', days[0]),
    scalar(db, 'SELECT COUNT(*) AS n FROM installs'),
    scalar(db, 'SELECT COUNT(*) AS n FROM installs WHERE first_seen >= ?1', weekAgo),
    db
      .prepare(
        `SELECT AVG(last_seen - started_at) / 60.0 AS n FROM sessions
         WHERE started_at >= ?1 AND (ended = 1 OR last_seen < ?2)`,
      )
      .bind(weekAgo, now - ONLINE_WINDOW_S)
      .first<{ n: number | null }>(),
  ]);

  const [active, created] = await Promise.all([
    db
      .prepare('SELECT day, COUNT(*) AS n FROM daily WHERE day >= ?1 GROUP BY day')
      .bind(days[0])
      .all<{ day: string; n: number }>(),
    db
      .prepare(
        `SELECT strftime('%Y-%m-%d', first_seen, 'unixepoch') AS day, COUNT(*) AS n
         FROM installs WHERE first_seen >= ?1 GROUP BY day`,
      )
      .bind(now - 30 * DAY)
      .all<{ day: string; n: number }>(),
  ]);
  const activeBy = new Map(active.results.map((r) => [r.day, Number(r.n)]));
  const createdBy = new Map(created.results.map((r) => [r.day, Number(r.n)]));

  const [versions, regions, countries, modes, streaming] = await Promise.all([
    buckets(db, 'app_version', weekAgo),
    buckets(db, 'lol_region', weekAgo),
    buckets(db, 'country', weekAgo),
    buckets(db, 'mode', weekAgo),
    buckets(db, 'streaming', weekAgo),
  ]);

  return {
    generated_at: now,
    online,
    dau,
    wau,
    mau,
    total_installs: total,
    new_installs_7d: fresh,
    avg_session_minutes_7d: avg?.n == null ? null : Math.round(Number(avg.n)),
    daily: days.map((day) => ({ day, active: activeBy.get(day) ?? 0, new_installs: createdBy.get(day) ?? 0 })),
    versions,
    regions,
    countries,
    modes,
    streaming,
  };
}
