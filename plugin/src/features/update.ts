import type { FetchLike } from '../lcu';
import type { PluginConfig } from '../settings';

const TRAY_DOWN = 'the Drake tray is not running';

export interface UpdateFailure {
  ok: false;
  reason: string;
}

export interface UpdateStatusBody {
  status?: string;
  current?: string;
  version?: string;
  mandatory?: boolean;
}

export type UpdateCheckResult = UpdateFailure | ({ ok: true } & UpdateStatusBody);

export type UpdateApplyResult = UpdateFailure | { ok: true; installing: true; upToDate: boolean };

export interface UpdaterOptions {
  port: number;
  token: string;
  fetchImpl?: FetchLike;
  reloadConfig?: () => Promise<Pick<PluginConfig, 'token'> | null | undefined>;
}

export interface Updater {
  check(options?: { force?: boolean }): Promise<UpdateCheckResult>;
  apply(): Promise<UpdateApplyResult>;
}

type RetryOutcome = UpdateFailure | { ok?: undefined; res: Response };


export function makeUpdater({ port, token, fetchImpl = fetch, reloadConfig }: UpdaterOptions): Updater {
  let currentToken = token;

  async function post(path: string, extra: Record<string, unknown> = {}): Promise<Response> {
    return fetchImpl(`http://127.0.0.1:${port}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: currentToken, ...extra }),
    });
  }

  async function withRetry(run: () => Promise<Response>): Promise<RetryOutcome> {
    let res: Response;
    try {
      res = await run();
    } catch {
      return { ok: false, reason: TRAY_DOWN };
    }

    if (res.status !== 401 || !reloadConfig) {
      return { res };
    }

    const cfg = await reloadConfig();
    if (!cfg?.token) {
      return { res };
    }
    currentToken = cfg.token;
    try {
      return { res: await run() };
    } catch {
      return { ok: false, reason: TRAY_DOWN };
    }
  }

  return {
    async check({ force = false }: { force?: boolean } = {}): Promise<UpdateCheckResult> {
      const out = await withRetry(() => post('/update/check', force ? { force: true } : {}));
      if (out.ok === false) return out;
      const { res } = out;
      if (res.status === 409) {
        return { ok: false, reason: 'an update is already in progress' };
      }
      if (!res.ok) {
        return { ok: false, reason: `could not check for updates (${res.status})` };
      }
      const body = (await res.json()) as UpdateStatusBody;
      return { ok: true, ...body };
    },

    async apply(): Promise<UpdateApplyResult> {
      const out = await withRetry(() => post('/update/apply'));
      if (out.ok === false) return out;
      const { res } = out;
      if (res.status === 409) {
        return { ok: false, reason: 'an update is already in progress' };
      }
      if (res.status === 204 || res.ok) {
        return { ok: true, installing: true, upToDate: res.status === 204 };
      }
      return { ok: false, reason: `could not install the update (${res.status})` };
    },
  };
}
