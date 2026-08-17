// Opens an external URL through the tray, not through the client.
//
// `window.open` inside the client's CEF is unreliable: it can be swallowed
// with no error at all, so the user just sees nothing happen. The tray is a
// normal Windows process and can hand the URL to the shell.
//
// The tray refuses anything outside its allow-list (configd::is_openable), so
// this cannot be used as a general launcher.

export function makeOpener({ port, token, fetchImpl = fetch }) {
  return {
    async open(url) {
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
