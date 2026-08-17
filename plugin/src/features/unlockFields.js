// Lifts restrictions on the client's OWN inputs, instead of rebuilding them.
//
// This is the one place Drake reaches into Riot's markup rather than staying
// inside its shadow root, so it is deliberately narrow: one selector, measured
// from the live client, and a recorded copy of the limit it found. Everything
// else about the field -- how it saves, what it is bound to -- stays Riot's.
//
// The trade is explicit: a selector into somebody else's UI can stop matching
// after any patch. `unlockIn` returns a count so the caller can say so out
// loud rather than silently doing nothing.

export const UNLOCKS = {
  statusMessage: {
    // Measured 2026-08-16 in the live client (pt_BR):
    //   placeholder "Mensagem de status personalizada", maxlength 25, 30px tall
    selector: 'input.social-status-change-input',
    measuredMaxLength: 25,
    // Left at the client's own height on purpose. Making a single-line <input>
    // taller just centres one line in a tall box -- it cannot show a second
    // line, so the extra height reads as a bug. Multiline lives in Drake's own
    // Status screen, which writes through the LCU.
    height: null,
  },
};

const MARK = 'drakeUnlocked';

export function isUnlockTarget(el) {
  return el.matches(UNLOCKS.statusMessage.selector);
}

/// Strips the character cap from the status input and gives it room. Returns
/// how many fields it changed.
///
/// Idempotent via a dataset marker: this runs from a MutationObserver in a
/// client that mutates constantly, so re-patching an already-patched node on
/// every mutation would be pure waste.
export function unlockIn(root) {
  let fields;
  try {
    fields = root.querySelectorAll('input, textarea');
  } catch {
    // A detached or cross-origin root. Nothing to do, and nothing worth
    // crashing the client's page over.
    return 0;
  }

  let count = 0;
  for (const f of fields) {
    if (!isUnlockTarget(f)) continue;
    if (f.dataset[MARK]) continue;
    f.dataset[MARK] = '1';
    f.removeAttribute('maxlength');
    if (UNLOCKS.statusMessage.height) f.style.height = UNLOCKS.statusMessage.height;
    count += 1;
  }
  return count;
}
