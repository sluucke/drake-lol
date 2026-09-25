export const OVERLAY_SIZES = {
  fab: { width: 52, height: 52 },
  cancel: { width: 120, height: 48 },
  dodge: { width: 96, height: 32 },
  hint: { width: 200, height: 56 },
};

export const REL_SCALE = 10000;

const MARGIN = 14;
const CANCEL_BOTTOM = 48;
const DODGE_RIGHT = 72;
const HINT_GAP = 8;

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), Math.max(min, max));
}

export function clampToClient(client, point, size) {
  return {
    x: clamp(Math.round(point.x), client.x, client.x + client.width - size.width),
    y: clamp(Math.round(point.y), client.y, client.y + client.height - size.height),
  };
}

function placePiece(client, rel, fallback, size) {
  if (!rel) return fallback;
  return clampToClient(
    client,
    {
      x: client.x + Math.trunc((client.width * rel.x) / REL_SCALE),
      y: client.y + Math.trunc((client.height * rel.y) / REL_SCALE),
    },
    size,
  );
}

export function overlayPieces(client, positions, { hint = false } = {}) {
  if (!client) return null;
  const right = client.x + client.width;
  const bottom = client.y + client.height;
  const { fab, cancel, dodge } = OVERLAY_SIZES;
  const fabAt = placePiece(
    client,
    positions?.fab,
    { x: right - MARGIN - fab.width, y: bottom - MARGIN - fab.height },
    fab,
  );
  return {
    fab: fabAt,
    ...(hint
      ? {
          hint: clampToClient(
            client,
            { x: fabAt.x + fab.width - OVERLAY_SIZES.hint.width, y: fabAt.y - HINT_GAP - OVERLAY_SIZES.hint.height },
            OVERLAY_SIZES.hint,
          ),
        }
      : {}),
    cancel: {
      x: client.x + Math.trunc(client.width / 2) - Math.trunc(cancel.width / 2),
      y: bottom - CANCEL_BOTTOM - cancel.height,
    },
    dodge: placePiece(
      client,
      positions?.dodge,
      { x: right - DODGE_RIGHT - dodge.width, y: bottom - MARGIN - dodge.height },
      dodge,
    ),
  };
}

export function toRelative(client, point, size) {
  const inside = clampToClient(client, point, size);
  return {
    x: Math.round(((inside.x - client.x) / client.width) * REL_SCALE),
    y: Math.round(((inside.y - client.y) / client.height) * REL_SCALE),
  };
}
