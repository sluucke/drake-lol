// Two write paths behind one interface, so the choice never leaks into
// feature code. Which one is primary was measured in Task 1.
//
// The fallback exists for one reason only: the localhost transport being
// UNREACHABLE (a thrown fetch error), in case a future Chromium policy blocks
// it. A response that comes back with a non-2xx status — most importantly a
// 401 from a stale token, which happens whenever the tray restarts and
// regenerates its token while an old config.json is still on disk — is the
// tray working correctly and saying "no". That must not be silently upgraded
// to "yes" by falling through to DataStore.
export function makeTransport({ port, token, fetchImpl = fetch, dataStore = null }) {
  async function viaLocalhost(host) {
    // Let a thrown error (network/transport failure) propagate to the
    // caller, which treats it as "unreachable" and falls back.
    return fetchImpl(`http://127.0.0.1:${port}/checkin`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, host }),
    });
  }

  function viaDataStore(host) {
    if (!dataStore) return false;
    dataStore.set('drake_checkin', JSON.stringify({ host, at: Date.now() }));
    return true;
  }

  return {
    async checkIn(host) {
      let res;
      try {
        res = await viaLocalhost(host);
      } catch {
        // Transport unavailable — fall back to DataStore.
        return viaDataStore(host);
      }
      if (res.ok) return true;
      // The tray answered and rejected the check-in (e.g. stale token).
      // That is a real "no", not an unreachable transport — do not fall back.
      console.log('[Drake] check-in rejected, status', res.status);
      return false;
    },
  };
}
