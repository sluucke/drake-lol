export function gameDataUrl(path) {
  const proxy = globalThis.__DRAKE_ASSET_PROXY__;
  if (!proxy || !path || !String(path).startsWith('/lol-')) return path;
  return `${proxy}${encodeURIComponent(path)}`;
}
