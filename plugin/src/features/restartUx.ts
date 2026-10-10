





import type { Lcu } from '../lcu';

export const RESTART_UX_ROUTE = '/riotclient/kill-and-restart-ux';

export interface RestartUxResult {
  ok: boolean;
  reason?: string;
}

export interface RestartUx {
  restart(): Promise<RestartUxResult>;
}

export function makeRestartUx({ lcu }: { lcu: Pick<Lcu, 'post'> }): RestartUx {
  return {
    async restart(): Promise<RestartUxResult> {
      try {
        const res = await lcu.post(RESTART_UX_ROUTE);
        if (res && res.ok === false) {
          return { ok: false, reason: `the client refused (${res.status})` };
        }
        return { ok: true };
      } catch (e) {
        return { ok: false, reason: `could not reach the client (${(e as Error).message})` };
      }
    },
  };
}
