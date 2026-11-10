import {
  matchesToggle,
  matchesClose,
  matchesTeamRevealCardsToggle,
  matchesBuildPanelToggle,
} from './hotkey';

export const HOST_ID = 'drake-ui-host';




const SENTINEL = '__drakeUIMounted';

export interface MountedUI {
  isOpen: () => boolean;
  toggle: () => void;
  open: () => void;
  close: () => void;
  host: () => HTMLDivElement | null;
}

export type MountWindow = Window & { [SENTINEL]?: MountedUI };

export interface MountOptions {
  doc: Document;
  win: MountWindow;
  render?: (() => string) | null;
  onOpenChange?: ((open: boolean) => void) | null;
  onMount?: ((shadow: ShadowRoot, api: MountedUI) => void) | null;
  onTeamRevealCardsToggle?: (() => void) | null;
  onBuildPanelToggle?: (() => void) | null;
  isIdle?: (() => boolean) | null;
  onEscape?: (() => boolean | void) | null;
  onToggleIntent?: (() => boolean | void) | null;
  mountParent?: Element | null;
  hostId?: string;
}














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
}: MountOptions): MountedUI {
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
}: MountOptions): MountedUI {
  let host: HTMLDivElement | null = null;
  let open = false;

  const api: MountedUI = {
    isOpen: () => open,
    toggle: () => setOpen(!open),
    open: () => setOpen(true),
    close: () => setOpen(false),
    host: () => host,
  };

  function setOpen(next: boolean) {
    if (next === open) return;
    open = next;
    if (onOpenChange) onOpenChange(open);
  }

  function parentNode(): Element {
    return mountParent || doc.documentElement;
  }

  function hostCss() {
    return 'position:fixed;inset:0;z-index:2147483647;pointer-events:none;';
  }

  function attach() {
    const el = doc.createElement('div');
    host = el;
    el.id = hostId;
    el.style.cssText = hostCss();
    const shadow = el.attachShadow({ mode: 'open' });
    if (render) shadow.innerHTML = render();
    parentNode().appendChild(el);
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
