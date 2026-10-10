import type { FetchLike } from '../lcu';









export interface OpenUrlResult {
  ok: boolean;
  reason?: string;
}

export interface OpenerOptions {
  port: number;
  token: string;
  fetchImpl?: FetchLike;
}

export interface Opener {
  open(url: string): Promise<OpenUrlResult>;
}

export function makeOpener({ port, token, fetchImpl = fetch }: OpenerOptions): Opener {
  return {
    async open(url: string): Promise<OpenUrlResult> {
      try {
        const res = await fetchImpl(`http://127.0.0.1:${port}/open-url`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token, url }),
        });
        if (res.ok) return { ok: true };
        if (res.status === 403) return { ok: false, reason: 'the tray refused that address' };
        return { ok: false, reason: `the tray could not open it (${res.status})` };
      } catch {
        return { ok: false, reason: 'the Drake tray is not running' };
      }
    },
  };
}
