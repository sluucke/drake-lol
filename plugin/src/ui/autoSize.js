// Grows the status box to fit its content, instead of leaving a manual resize
// grip. The grip is browser furniture -- the client has nothing like it, and
// it fought the CSS max-height anyway.

export function fittedHeight({ scrollHeight, min, max }) {
  return Math.min(Math.max(scrollHeight, min), max);
}

/// Resets the height before measuring.
///
/// `scrollHeight` on an element that already has an explicit height reports
/// that height, not the content's -- so measuring without the reset makes the
/// box able to grow but never shrink when lines are deleted.
export function autoSize(el, { min, max }) {
  if (!el) return;
  // The user's own choice outranks ours. Without this, the next keystroke
  // would snap the box back to the fitted height and undo the drag.
  if (el.dataset && el.dataset[MANUAL]) return;
  el.style.height = 'auto';
  el.style.height = `${fittedHeight({ scrollHeight: el.scrollHeight, min, max })}px`;
}

const MANUAL = 'manualHeight';

/// Called once the user drags the resize grip: from then on the box keeps the
/// height they picked.
export function markManual(el) {
  if (!el || !el.dataset) return;
  el.dataset[MANUAL] = '1';
}
