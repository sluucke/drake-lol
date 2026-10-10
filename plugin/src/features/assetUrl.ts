export function gameDataUrl(path: string): string;
export function gameDataUrl(path: string | null | undefined): string | null | undefined;
export function gameDataUrl(path: string | null | undefined): string | null | undefined {
  const proxy = globalThis.__DRAKE_ASSET_PROXY__;
  if (!proxy || !path || !String(path).startsWith('/lol-')) return path;
  return `${proxy}${encodeURIComponent(path)}`;
}
