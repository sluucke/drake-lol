// Push when available, polling otherwise, both behind one interface.
//
// The only client-side API actually measured against the League Client is
// same-origin fetch (see the viability spike). A push mechanism such as
// `socket.observe` has never been confirmed to exist or to be named that in
// the loader we run under, so it is used opportunistically and guarded with
// `typeof` checks — never assumed. If it is absent (or wrong), the feature
// still works via polling, which only relies on the measured fetch path.
const DEFAULT_POLL_INTERVAL_MS = 1000;

export function subscribe(route, handler, { fetchImpl = fetch, intervalMs = DEFAULT_POLL_INTERVAL_MS } = {}) {
  if (typeof socket !== 'undefined' && socket && typeof socket.observe === 'function') {
    const observer = (message) => handler(message && message.data);
    socket.observe(route, observer);
    return () => {
      if (typeof socket !== 'undefined' && socket && typeof socket.unobserve === 'function') {
        socket.unobserve(route, observer);
      }
    };
  }

  let stopped = false;
  const tick = async () => {
    if (stopped) return;
    try {
      const res = await fetchImpl(route);
      // A 404 (or any non-2xx) between matches is the normal idle state of
      // this endpoint, not an error — do not throw or log.
      if (!res.ok) return;
      const payload = await res.json();
      if (!stopped) handler(payload);
    } catch {
      // Transient network hiccup between matches — not an error state,
      // do not spam the console.
    }
  };
  const id = setInterval(tick, intervalMs);
  return () => {
    stopped = true;
    clearInterval(id);
  };
}
