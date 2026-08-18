





export const RESTART_UX_ROUTE = '/riotclient/kill-and-restart-ux';

export function makeRestartUx({ lcu }) {
  return {
    async restart() {
      try {
        const res = await lcu.post(RESTART_UX_ROUTE);
        if (res && res.ok === false) {
          return { ok: false, reason: `the client refused (${res.status})` };
        }
        return { ok: true };
      } catch (e) {
        return { ok: false, reason: `could not reach the client (${e.message})` };
      }
    },
  };
}
