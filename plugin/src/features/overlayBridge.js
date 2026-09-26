export function overlayBase(port) {
  return `http://127.0.0.1:${Number(port) || 48151}`;
}

export async function postOverlay(port, token, path, body = {}, fetchImpl = fetch) {
  const res = await fetchImpl(`${overlayBase(port)}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ token, ...body }),
  });
  if (!res.ok) return null;
  const text = await res.text();
  return text ? JSON.parse(text) : {};
}

export function clientBoundsFromWindow(win = window) {
  try {
    const x = Math.round(Number(win.screenX) || 0);
    const y = Math.round(Number(win.screenY) || 0);
    const width = Math.round(Number(win.outerWidth) || 0);
    const height = Math.round(Number(win.outerHeight) || 0);
    if (width <= 0 || height <= 0) return null;
    return { x, y, width, height };
  } catch {
    return null;
  }
}
