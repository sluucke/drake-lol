




const TEXT_ENTRY_TAGS = new Set(['INPUT', 'TEXTAREA']);





export interface TextEntryTarget {
  tagName?: string;
  isContentEditable?: boolean;
}

export interface HotkeyEventLike {
  ctrlKey?: boolean;
  shiftKey?: boolean;
  key?: string;
  code?: string;
  target?: EventTarget | TextEntryTarget | null;
}

function isTextEntry(target: EventTarget | TextEntryTarget | null | undefined): boolean {
  if (!target) return false;
  const el = target as TextEntryTarget;
  return TEXT_ENTRY_TAGS.has(el.tagName ?? '') || el.isContentEditable === true;
}

export function matchesToggle(event: HotkeyEventLike): boolean {
  if (!event.ctrlKey) return false;
  if (event.shiftKey) return false;
  if (event.key !== 'd' && event.key !== 'D') return false;
  return !isTextEntry(event.target);
}

export function matchesTeamRevealCardsToggle(event: HotkeyEventLike): boolean {
  if (!event.ctrlKey) return false;
  if (!event.shiftKey) return false;
  if (event.key !== 'd' && event.key !== 'D' && event.code !== 'KeyD') return false;
  return true;
}

export function matchesBuildPanelToggle(event: HotkeyEventLike): boolean {
  if (!event.ctrlKey) return false;
  if (event.shiftKey) return false;
  if (event.key !== 'b' && event.key !== 'B' && event.code !== 'KeyB') return false;
  return !isTextEntry(event.target);
}

export function matchesClose(event: HotkeyEventLike): boolean {
  return event.key === 'Escape';
}
