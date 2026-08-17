// Multiline status message.
//
// Measured against the live client: the LCU stores line breaks fine and the
// social panel renders them as real lines. The only thing standing in the way
// is Riot's input, which is a single-line <input> and cannot hold a newline no
// matter how tall it is made. So the text is written through the API instead
// of through their field -- which also means none of this depends on their
// markup.

export const STATUS_ROUTE = '/lol-chat/v1/me';

export function normalise(text) {
  const folded = String(text ?? '').replace(/\r\n/g, '\n');
  // A status of pure whitespace is indistinguishable from no status, and
  // sending spaces would leave a blank line hanging in the friends list.
  return folded.trim() === '' ? '' : folded;
}

export function makeStatus({ lcu }) {
  return {
    async read() {
      try {
        const me = await lcu.get(STATUS_ROUTE);
        return (me && me.statusMessage) || '';
      } catch {
        // The panel opens whether or not this works; an empty box is a much
        // better failure than a broken screen.
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
      // `put` may resolve with a fetch Response; treat a missing `ok` as
      // success only when there is no status to contradict it.
      if (res && res.ok === false) {
        return { ok: false, reason: `the client rejected it (${res.status})` };
      }
      return { ok: true };
    },
  };
}
