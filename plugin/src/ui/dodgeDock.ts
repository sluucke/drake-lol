export const ROSE_BUTTON_SELECTOR = '.rose-custom-wheel-button';
export const CHAMP_SELECT_BUTTONS = '.bottom-right-buttons';
export const DOCK_GAP_PX = 8;

import { isChampSelectSession, type ChampSelectSession } from '../features/champSelect';

export interface DockStyle {
  left: string;
  right: string;
  bottom: string;
  transform: string;
}

export type DockWindow = Pick<Window, 'innerHeight'>;

export function inChampSelect(session: unknown): session is ChampSelectSession {
  return isChampSelectSession(session);
}

export function isVisible(el: Element | null | undefined): el is Element {
  if (!el || typeof el.getBoundingClientRect !== 'function') return false;
  const rect = el.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

export function findAnchor(doc: ParentNode): Element | null {
  const rose = doc.querySelector(ROSE_BUTTON_SELECTOR);
  if (isVisible(rose)) return rose;
  return null;
}

export function layoutKey(_dockEl: HTMLElement | null, anchor: Element | null, win: DockWindow): string {
  if (!anchor) return 'fallback';
  const rect = anchor.getBoundingClientRect();
  return `${Math.round(rect.left)}:${Math.round(rect.top)}:${Math.round(rect.width)}:${Math.round(rect.height)}:${win.innerHeight}`;
}

export function dockStyle(anchor: Element | null, win: DockWindow): DockStyle {
  if (!anchor) return { left: 'auto', right: '20px', bottom: '70px', transform: 'none' };
  const rect = anchor.getBoundingClientRect();
  return {
    left: `${rect.left + rect.width / 2}px`,
    right: 'auto',
    bottom: `${win.innerHeight - rect.top + DOCK_GAP_PX}px`,
    transform: 'translateX(-50%)',
  };
}

export function layoutDock(dockEl: HTMLElement | null | undefined, anchor: Element | null, win: DockWindow): boolean {
  if (!dockEl) return false;

  const key = layoutKey(dockEl, anchor, win);
  if (dockEl.dataset.layoutKey === key) return true;
  dockEl.dataset.layoutKey = key;
  Object.assign(dockEl.style, dockStyle(anchor, win));
  return true;
}

export function watchAnchor(doc: Document, win: Window, cb: () => void): () => void {
  let frame = 0;
  let intervalId = 0;

  const tick = () => {
    if (frame) return;
    frame = win.requestAnimationFrame(() => {
      frame = 0;
      cb();
    });
  };

  win.addEventListener('resize', tick);
  const mo = new MutationObserver(tick);
  mo.observe(doc.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['class', 'style', 'hidden', 'data-hidden'],
  });
  intervalId = win.setInterval(tick, 1500);
  tick();

  return () => {
    if (frame) win.cancelAnimationFrame(frame);
    win.clearInterval(intervalId);
    win.removeEventListener('resize', tick);
    mo.disconnect();
  };
}
