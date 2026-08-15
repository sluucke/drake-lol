// Two write paths behind one interface, so the choice never leaks into
// feature code. Which one is primary was measured in Task 1.
export function makeTransport({ port, token, fetchImpl = fetch, dataStore = null }) {
  async function viaLocalhost(host) {
    const res = await fetchImpl(`http://127.0.0.1:${port}/checkin`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, host }),
    });
    return res.ok;
  }

  function viaDataStore(host) {
    if (!dataStore) return false;
    dataStore.set('drake_checkin', JSON.stringify({ host, at: Date.now() }));
    return true;
  }

  return {
    async checkIn(host) {
      try {
        if (await viaLocalhost(host)) return true;
      } catch {
        // fall through to the fallback
      }
      return viaDataStore(host);
    },
  };
}
