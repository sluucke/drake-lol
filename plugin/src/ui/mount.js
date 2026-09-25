import {
  matchesToggle,
  matchesClose,
  matchesTeamRevealCardsToggle,
  matchesBuildPanelToggle,
} from './hotkey.js';

export const HOST_ID = 'drake-ui-host';




const SENTINEL = '__drakeUIMounted';














export function mountUI({
  doc,
  win,
  render,
  onOpenChange,
  onMount,
  onTeamRevealCardsToggle,
  onBuildPanelToggle,
  isIdle,
  onEscape,
  onToggleIntent,
  mountParent,
  hostId = HOST_ID,
}) {
  if (win[SENTINEL]) return win[SENTINEL];
  const ui = createUI({
    doc,
    win,
    render,
    onOpenChange,
    onMount,
    onTeamRevealCardsToggle,
    onBuildPanelToggle,
    isIdle,
    onEscape,
    onToggleIntent,
    mountParent,
    hostId,
  });
  win[SENTINEL] = ui;
  return ui;
}

function createUI({
  doc,
  win,
  render,
  onOpenChange,
  onMount,
  onTeamRevealCardsToggle,
  onBuildPanelToggle,
  isIdle,
  onEscape,
  onToggleIntent,
  mountParent,
  hostId = HOST_ID,
}) {
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

  function parentNode() {
    return mountParent || doc.documentElement;
  }

  function hostCss() {
    return 'position:fixed;inset:0;z-index:2147483647;pointer-events:none;';
  }

  function attach() {
    host = doc.createElement('div');
    host.id = hostId;
    host.style.cssText = hostCss();
    const shadow = host.attachShadow({ mode: 'open' });
    if (render) shadow.innerHTML = render();
    parentNode().appendChild(host);
    if (onMount) onMount(shadow, api);
  }

  function build() {
    attach();

    const observer = new MutationObserver(() => {
      if (host && host.parentNode === null) {
        parentNode().appendChild(host);
      }
    });
    observer.observe(parentNode(), { childList: true, subtree: true });
  }

  win.addEventListener(
    'keydown',
    (event) => {
      if (isIdle && isIdle()) return;
      if (event.repeat) return;
      if (matchesToggle(event)) {
        event.preventDefault();
        if (onToggleIntent && onToggleIntent() === false) return;
        api.toggle();
      } else if (matchesTeamRevealCardsToggle(event)) {
        event.preventDefault();
        if (onTeamRevealCardsToggle) onTeamRevealCardsToggle();
      } else if (matchesBuildPanelToggle(event)) {
        event.preventDefault();
        if (onBuildPanelToggle) onBuildPanelToggle();
      } else if (matchesClose(event)) {
        // onEscape covers things that can be open independently of the main
        // panel (e.g. the build panel via Ctrl+B). It must get a chance to
        // run even when the main panel itself is closed.
        if (typeof onEscape === 'function' && onEscape()) {
          event.preventDefault();
          return;
        }
        if (open) {
          event.preventDefault();
          api.close();
        }
      }
    },
    true,
  );

  if (doc.body || mountParent) build();
  else doc.addEventListener('load', build, { once: true });

  return api;
}
