// Served by the loader's own https://plugins/ scheme, so this path has no
// mixed-content or CORS question. The cache-buster stops CEF serving a stale
// copy after the tray rewrites the file.
export async function loadConfig(fetchImpl = fetch) {
  try {
    const res = await fetchImpl(`config.json?t=${Date.now()}`);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}
