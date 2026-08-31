export const CURRENT_SUMMONER_ROUTE = '/lol-summoner/v1/current-summoner';

// The client answers this route only once it is booted and logged in, which is
// often not yet true at plugin mount. Cache the id once we actually have one,
// but keep retrying on every call until then - a single failed attempt must not
// disable item-set creation for the rest of the session.
export function makeSummonerIdLoader({ lcu, route = CURRENT_SUMMONER_ROUTE } = {}) {
  let summonerId = 0;
  let inFlight = null;

  async function load() {
    if (summonerId) return summonerId;
    if (inFlight) return inFlight;
    inFlight = (async () => {
      try {
        const me = await lcu.get(route);
        summonerId = Number(me?.summonerId) || Number(me?.accountId) || 0;
      } catch {
        summonerId = 0;
      }
      inFlight = null;
      return summonerId;
    })();
    return inFlight;
  }

  return { load, get: () => summonerId };
}
