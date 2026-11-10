import type { FetchLike } from './lcu';
import type { PluginConfig } from './settings';

export async function loadConfig(fetchImpl: FetchLike = fetch): Promise<PluginConfig | null> {
  try {
    const res = await fetchImpl(`https://plugins/Drake/config.json?t=${Date.now()}`);
    if (!res.ok) return null;
    return (await res.json()) as PluginConfig;
  } catch {
    return null;
  }
}
