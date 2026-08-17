import { matchesToggle, matchesClose } from './hotkey.js';

export const HOST_ID = 'drake-ui-host';

/// Sentinel on the global, not a module-level flag: a module-level flag is
/// per-evaluation, and the thing we are defending against is the module being
/// evaluated twice.
const SENTINEL = '__drakeUIMounted';

/// Mounts the Drake overlay and wires the hotkey.
///
/// Every guard here comes from something measured against the real client, not
/// from generic caution:
///
/// - The host goes on `documentElement`, never `body`. `body` is the node the
///   client replaces; anchoring there is how the overlay goes missing.
/// - Mounting waits for `load`, because `document.body` is null at the moment
///   the loader evaluates `index.js`.
/// - A MutationObserver re-attaches the host if it disappears, because the
///   client owns the DOM and owes us no permanence.
/// - A global sentinel makes a second evaluation a no-op, because plugin
///   evaluation is not guaranteed to happen exactly once.
export function mountUI({ doc, win, render, onOpenChange, onMount }) {
  if (win[SENTINEL]) return win[SENTINEL];
  const ui = createUI({ doc, win, render, onOpenChange, onMount });
  win[SENTINEL] = ui;
  return ui;
}

function createUI({ doc, win, render, onOpenChange, onMount }) {
  let host = null;
  let open = false;

  const api = {
    isOpen: () => open,
    toggle: () => setOpen(!open),
    open: () => setOpen(true),
    close: () => setOpen(false),
    host: () => host,
  };

  function setOpen(next) {
    if (next === open) return;
    open = next;
    if (onOpenChange) onOpenChange(open);
  }

  /// The host stays mounted and visible at all times, with pointer-events off.
  /// It cannot simply be hidden when the panel is closed, because it also
  /// carries the ready-check cancel button -- which has to be usable precisely
  /// when the panel is shut. Individual children opt back into pointer events;
  /// everything else lets clicks through to the client underneath.
  function hostCss() {
    return 'position:fixed;inset:0;z-index:2147483647;pointer-events:none;';
  }

  function attach() {
    host = doc.createElement('div');
    host.id = HOST_ID;
    host.style.cssText = hostCss();
    const shadow = host.attachShadow({ mode: 'open' });
    shadow.innerHTML = render();
    doc.documentElement.appendChild(host);
    if (onMount) onMount(shadow, api);
  }

  function build() {
    attach();

    // Re-attach rather than assume permanence.
    const observer = new MutationObserver(() => {
      if (host && host.parentNode === null) {
        doc.documentElement.appendChild(host);
      }
    });
    observer.observe(doc.documentElement, { childList: true, subtree: true });
  }

  win.addEventListener(
    'keydown',
    (event) => {
      if (matchesToggle(event)) {
        event.preventDefault();
        api.toggle();
      } else if (open && matchesClose(event)) {
        event.preventDefault();
        api.close();
      }
    },
    true,
  );

  if (doc.body) build();
  else doc.addEventListener('load', build, { once: true });

  return api;
}
