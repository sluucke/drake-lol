export const OVERLAY_SIZES = {
  fab: { width: 52, height: 52 },
  cancel: { width: 120, height: 48 },
  dodge: { width: 110, height: 48 },
};

const MARGIN = 14;
const CANCEL_BOTTOM = 48;
const DODGE_RIGHT = 72;

export function overlayChromeLayout(client, chrome) {
  if (!client || !chrome) return null;
  const right = client.x + client.width;
  const bottom = client.y + client.height;
  const { fab, cancel, dodge } = OVERLAY_SIZES;
  return {
    fab: {
      left: right - MARGIN - fab.width - chrome.x,
      top: bottom - MARGIN - fab.height - chrome.y,
    },
    cancel: {
      left: client.x + Math.floor(client.width / 2) - Math.floor(cancel.width / 2) - chrome.x,
      top: bottom - CANCEL_BOTTOM - cancel.height - chrome.y,
    },
    dodge: {
      left: right - DODGE_RIGHT - dodge.width - chrome.x,
      top: bottom - MARGIN - dodge.height - chrome.y,
    },
  };
}
