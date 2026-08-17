// Pure key matching, deliberately separate from the listener so the rules can
// be tested without a DOM. Measured in the client: Ctrl+D reaches us in the
// capture phase with defaultPrevented === false, so the binding is genuinely
// available -- nothing in the client competes for it.

const TEXT_ENTRY_TAGS = new Set(['INPUT', 'TEXTAREA']);

/// True when the event is somebody typing, in which case the hotkey must not
/// fire. The client has chat and several search fields; swallowing a keystroke
/// there would look like the client dropping input, and the user would have no
/// way to connect that to Drake.
function isTextEntry(target) {
  if (!target) return false;
  return TEXT_ENTRY_TAGS.has(target.tagName) || target.isContentEditable === true;
}

export function matchesToggle(event) {
  if (!event.ctrlKey) return false;
  // `key` is already case-folded by the layout: with Shift held it arrives as
  // 'D'. Accept both rather than inspecting modifiers we do not care about.
  if (event.key !== 'd' && event.key !== 'D') return false;
  return !isTextEntry(event.target);
}

export function matchesClose(event) {
  return event.key === 'Escape';
}
