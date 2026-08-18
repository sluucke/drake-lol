








export const STATUS_ROUTE = '/lol-chat/v1/me';

export function normalise(text) {
  const folded = String(text ?? '').replace(/\r\n/g, '\n');
  
  
  return folded.trim() === '' ? '' : folded;
}

export function makeStatus({ lcu }) {
  return {
    async read() {
      try {
        const me = await lcu.get(STATUS_ROUTE);
        return (me && me.statusMessage) || '';
      } catch {
        return '';
      }
    },

    async write(text) {
      const statusMessage = normalise(text);
      let res;
      try {
        res = await lcu.put(STATUS_ROUTE, { statusMessage });
      } catch (e) {
        return { ok: false, reason: `could not reach the client (${e.message})` };
      }
      
      
      if (res && res.ok === false) {
        return { ok: false, reason: `the client rejected it (${res.status})` };
      }
      return { ok: true };
    },
  };
}
