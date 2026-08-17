// Push when available, polling otherwise, both behind one interface.
//
// The only client-side API actually measured against the League Client is
// same-origin fetch (see the viability spike). A push mechanism such as
// `socket.observe` has never been confirmed to exist or to be named that in
// the loader we run under, so it is used opportunistically and guarded with
// `typeof` checks — never assumed. If it is absent (or wrong), the feature
// still works via polling, which only relies on the measured fetch path.
//
// Polling always runs, even when push is present: `socket.observe` does not
// reliably emit Delete after a dodge, and a 404 is how we learn the session
// ended. The first tick is immediate so a subscriber that just attached sees
// the current session instead of waiting a full interval.
const DEFAULT_POLL_INTERVAL_MS = 1000;

export function subscribe(route, handler, { fetchImpl = fetch, intervalMs = DEFAULT_POLL_INTERVAL_MS } = {}) {
  const push =
    typeof socket !== 'undefined' && socket && typeof socket.observe === 'function';

  let stopped = false;
  let idle = false;
  let seen = false;

  const tick = async () => {
    if (stopped) return;
    try {
      const res = await fetchImpl(route);
      if (!res.ok) {
        // A 404 (or any non-2xx) between matches is the normal idle state of
        // this endpoint, not an error — do not throw or log. Tell the handler
        // once so Auto Pick can forget the last action ids.
        if (!idle) {
          idle = true;
          if (!stopped) handler(null);
        }
        return;
      }
      const payload = await res.json();
      if (stopped) return;
      const reentered = idle;
      idle = false;
      if (push && seen && !reentered) return;
      seen = true;
      handler(payload);
    } catch {
      // Transient network hiccup between matches — not an error state,
      // do not spam the console.
    }
  };

  void tick();
  const id = setInterval(tick, intervalMs);

  let unobserve = () => {};
  if (push) {
    const observer = (message) => handler(message && message.data);
    socket.observe(route, observer);
    unobserve = () => {
      if (typeof socket !== 'undefined' && socket && typeof socket.unobserve === 'function') {
        socket.unobserve(route, observer);
      }
    };
  }

  return () => {
    stopped = true;
    clearInterval(id);
    unobserve();
  };
}
