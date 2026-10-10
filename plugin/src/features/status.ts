








import type { Lcu } from '../lcu';
import type { ActionResult, ChatMeResponse } from './presence';

export interface StatusMessage {
  read(): Promise<string>;
  write(text: unknown): Promise<ActionResult>;
}

export const STATUS_ROUTE = '/lol-chat/v1/me';

export function normalise(text: unknown): string {
  const folded = String(text ?? '').replace(/\r\n/g, '\n');
  
  
  return folded.trim() === '' ? '' : folded;
}

export function makeStatus({ lcu }: { lcu: Pick<Lcu, 'get' | 'put'> }): StatusMessage {
  return {
    async read() {
      try {
        const me = await lcu.get<ChatMeResponse | null>(STATUS_ROUTE);
        return (me && me.statusMessage) || '';
      } catch {
        return '';
      }
    },

    async write(text) {
      const statusMessage = normalise(text);
      let res: Response;
      try {
        res = await lcu.put(STATUS_ROUTE, { statusMessage });
      } catch (e) {
        return { ok: false, reason: `could not reach the client (${(e as Error).message})` };
      }
      
      
      if (res && res.ok === false) {
        return { ok: false, reason: `the client rejected it (${res.status})` };
      }
      return { ok: true };
    },
  };
}
