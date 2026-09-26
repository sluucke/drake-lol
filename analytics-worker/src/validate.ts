export type EventKind = 'startup' | 'heartbeat' | 'close';

export interface Ping {
  install_id: string;
  session_id: string;
  app_version: string;
  event: EventKind;
  lol_region: string | null;
  locale: string | null;
  mode: string | null;
  streaming: string | null;
  os_build: string | null;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const VERSION = /^\d{1,4}\.\d{1,4}\.\d{1,4}(?:[-+][0-9A-Za-z.-]{1,24})?$/;
const REGION = /^[A-Z0-9]{2,8}$/;
const LOCALE = /^[a-z]{2}_[A-Z]{2}$/;
const LABEL = /^[a-z][a-z_-]{0,15}$/;
const BUILD = /^\d{1,8}$/;
const EVENTS: readonly EventKind[] = ['startup', 'heartbeat', 'close'];
const MODES = ['own', 'guest', 'inactive'];

function optional(value: unknown, pattern: RegExp): string | null {
  return typeof value === 'string' && pattern.test(value) ? value : null;
}

export function parsePing(body: unknown): Ping | null {
  if (!body || typeof body !== 'object') return null;
  const b = body as Record<string, unknown>;
  if (typeof b.install_id !== 'string' || !UUID.test(b.install_id)) return null;
  if (typeof b.session_id !== 'string' || !UUID.test(b.session_id)) return null;
  if (typeof b.app_version !== 'string' || !VERSION.test(b.app_version)) return null;
  if (typeof b.event !== 'string' || !EVENTS.includes(b.event as EventKind)) return null;
  const mode = optional(b.mode, LABEL);
  return {
    install_id: b.install_id,
    session_id: b.session_id,
    app_version: b.app_version,
    event: b.event as EventKind,
    lol_region: optional(b.lol_region, REGION),
    locale: optional(b.locale, LOCALE),
    mode: mode && MODES.includes(mode) ? mode : null,
    streaming: optional(b.streaming, LABEL),
    os_build: optional(b.os_build, BUILD),
  };
}

export function countryOf(value: unknown): string | null {
  return typeof value === 'string' && /^[A-Z]{2}$/.test(value) && value !== 'XX' && value !== 'T1' ? value : null;
}

export function utcDay(epochSeconds: number): string {
  return new Date(epochSeconds * 1000).toISOString().slice(0, 10);
}
