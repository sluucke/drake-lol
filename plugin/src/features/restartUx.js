// Reloads the League client UI.
//
// Same route the tray menu uses (`lcu::restart_ux`). From inside the client
// it is a same-origin POST -- no lockfile, no password. This is always an
// explicit click: restarting someone's client unasked is hostile.

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
