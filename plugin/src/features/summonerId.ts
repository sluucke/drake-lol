import type { Lcu } from '../lcu';

export const CURRENT_SUMMONER_ROUTE = '/lol-summoner/v1/current-summoner';

export interface CurrentSummoner {
  summonerId?: number | string;
  accountId?: number | string;
  puuid?: string;
  gameName?: string;
  tagLine?: string;
}

export interface SummonerIdLoaderOptions {
  lcu: Pick<Lcu, 'get'>;
  route?: string;
}

export interface SummonerIdLoader {
  load(): Promise<number>;
  get(): number;
}

// The client answers this route only once it is booted and logged in, which is
// often not yet true at plugin mount. Cache the id once we actually have one,
// but keep retrying on every call until then - a single failed attempt must not
// disable item-set creation for the rest of the session.
export function makeSummonerIdLoader({ lcu, route = CURRENT_SUMMONER_ROUTE }: SummonerIdLoaderOptions): SummonerIdLoader {
  let summonerId = 0;
  let inFlight: Promise<number> | null = null;

  async function load(): Promise<number> {
    if (summonerId) return summonerId;
    if (inFlight) return inFlight;
    inFlight = (async () => {
      try {
        const me = await lcu.get<CurrentSummoner | null>(route);
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
