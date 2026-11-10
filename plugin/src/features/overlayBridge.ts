import type { FetchLike } from '../lcu';

export interface ClientBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface OverlayResponse {
  actions?: string[];
  [key: string]: unknown;
}

export function overlayBase(port: number | string | null | undefined): string {
  return `http://127.0.0.1:${Number(port) || 48151}`;
}

export async function postOverlay(
  port: number | string | null | undefined,
  token: string,
  path: string,
  body: Record<string, unknown> = {},
  fetchImpl: FetchLike = fetch,
): Promise<OverlayResponse | null> {
  const res = await fetchImpl(`${overlayBase(port)}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ token, ...body }),
  });
  if (!res.ok) return null;
  const text = await res.text();
  return text ? (JSON.parse(text) as OverlayResponse) : {};
}

export type BoundsSource = Pick<Window, 'screenX' | 'screenY' | 'outerWidth' | 'outerHeight'>;

export function clientBoundsFromWindow(win: BoundsSource = window): ClientBounds | null {
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
