// Leave champ select.
//
// The route is the LCDS service proxy, exactly as lol-profiler-tool used it.
// `/lol-lobby/v2/lobby/matchmaking/quit-dodge` looks like the obvious endpoint
// and simply 404s -- measured from the Practice Tool.
//
// Retried, also as the old app did: the client rejects this for a short window
// right after a pick or ban action, and a single attempt lands in that window
// often enough to leave the user stuck in a lobby they meant to leave. Only
// transient failures are retried -- see RETRYABLE.

export const DODGE_ROUTE =
  '/lol-login/v1/session/invoke?destination=lcdsServiceProxy&method=call&' +
  'args=%5B%22%22%2C%22teambuilder-draft%22%2C%22quitV2%22%2C%22%22%5D';

export const DODGE_ATTEMPTS = 5;
const DEFAULT_DELAY_MS = 250;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/// 404 and 400 are the client saying "there is nothing here to quit" -- true
/// in the Practice Tool, in a lobby, and out of game. Repeating the call five
/// times cannot change that; it only delays the message.
function retryable(status) {
  return status !== 404 && status !== 400;
}

function explain(status) {
  if (status === 404 || status === 400) {
    return 'you have to be in champ select to dodge';
  }
  return `the client refused (${status})`;
}

export function makeDodge({ lcu, attempts = DODGE_ATTEMPTS, delayMs = DEFAULT_DELAY_MS }) {
  return {
    async dodge() {
      let reason = 'the client did not respond';

      for (let i = 0; i < attempts; i += 1) {
        try {
          const res = await lcu.post(DODGE_ROUTE);
          if (!res || res.ok !== false) return { ok: true };
          reason = explain(res.status);
          if (!retryable(res.status)) return { ok: false, reason };
        } catch (e) {
          reason = `could not reach the client (${e.message})`;
        }
        if (i < attempts - 1 && delayMs > 0) await sleep(delayMs);
      }

      return { ok: false, reason };
    },
  };
}
