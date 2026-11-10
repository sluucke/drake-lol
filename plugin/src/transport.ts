














import type { FetchLike } from './lcu';

export interface ClientInfo {
  region?: string;
  locale?: string;
}

export interface CheckInDataStore {
  set(key: string, value: unknown): unknown;
}

export interface TransportOptions {
  port: number;
  token: string;
  fetchImpl?: FetchLike;
  dataStore?: CheckInDataStore | null;
  reloadConfig?: (() => Promise<{ token?: string } | null | undefined>) | null;
  pluginBuild?: string;
  clientInfo?: () => ClientInfo | null | undefined;
}

export interface CheckInBody {
  token: string;
  host: string;
  plugin_build: string;
  region?: string;
  locale?: string;
}

export interface Transport {
  checkIn(host: string): Promise<boolean>;
}

export function makeTransport({
  port,
  token,
  fetchImpl = fetch,
  dataStore = null,
  reloadConfig = null,
  pluginBuild = '',
  clientInfo = () => null,
}: TransportOptions): Transport {
  let currentToken = token;
  let refreshed = false;
  const loadedBuild = pluginBuild;

  function checkInBody(host: string): CheckInBody {
    const body: CheckInBody = { token: currentToken, host, plugin_build: loadedBuild };
    const info: ClientInfo = clientInfo() || {};
    if (info.region) body.region = info.region;
    if (info.locale) body.locale = info.locale;
    return body;
  }

  async function viaLocalhost(host: string): Promise<Response> {
    return fetchImpl(`http://127.0.0.1:${port}/checkin`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(checkInBody(host)),
    });
  }

  function viaDataStore(host: string): boolean {
    if (!dataStore) return false;
    dataStore.set('drake_checkin', JSON.stringify({ host, at: Date.now() }));
    return true;
  }

  return {
    async checkIn(host: string) {
      let res: Response;
      try {
        res = await viaLocalhost(host);
      } catch {
        
        return viaDataStore(host);
      }
      if (res.ok) return true;

      if (res.status === 401 && reloadConfig && !refreshed) {
        refreshed = true;
        const cfg = await loadFreshToken(reloadConfig);
        if (cfg) {
          currentToken = cfg;
          try {
            const retry = await viaLocalhost(host);
            if (retry.ok) return true;
            console.log('[Drake] check-in rejected after refreshing the token, status', retry.status);
            return false;
          } catch {
            return viaDataStore(host);
          }
        }
      }

      
      
      console.log('[Drake] check-in rejected, status', res.status);
      return false;
    },
  };
}

async function loadFreshToken(
  reloadConfig: NonNullable<TransportOptions['reloadConfig']>,
): Promise<string | null> {
  try {
    const cfg = await reloadConfig();
    return cfg && cfg.token ? cfg.token : null;
  } catch {
    return null;
  }
}
