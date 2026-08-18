












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
