// Served by the loader's own https://plugins/ scheme, so this path has no
// mixed-content or CORS question. Must be absolute: a relative URL resolves
// against the DOCUMENT's base URL (the client's own page, since the loader
// injects index.js into it), not against the script's own URL, so a relative
// fetch would silently miss config.json. The plugin folder name is fixed as
// "Drake" by a global constraint, and this is the same https://plugins/ URL
// form the loader's core already used to fetch index.js itself.
// The cache-buster stops CEF serving a stale copy after the tray rewrites
// the file.
export async function loadConfig(fetchImpl = fetch) {
  try {
    const res = await fetchImpl(`https://plugins/Drake/config.json?t=${Date.now()}`);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}
