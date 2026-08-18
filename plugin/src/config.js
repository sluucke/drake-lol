








export async function loadConfig(fetchImpl = fetch) {
  try {
    const res = await fetchImpl(`https://plugins/Drake/config.json?t=${Date.now()}`);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}
