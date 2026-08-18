import { matchesToggle, matchesClose } from './hotkey.js';

export const HOST_ID = 'drake-ui-host';




const SENTINEL = '__drakeUIMounted';














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
