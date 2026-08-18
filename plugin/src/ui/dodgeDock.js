export const ROSE_BUTTON_SELECTOR = '.rose-custom-wheel-button';
export const CHAMP_SELECT_BUTTONS = '.bottom-right-buttons';
export const DOCK_GAP_PX = 8;

export function inChampSelect(session) {
  return session != null;
}

export function isVisible(el) {
  if (!el || typeof el.getBoundingClientRect !== 'function') return false;
  const rect = el.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

export function findAnchor(doc) {
  const rose = doc.querySelector(ROSE_BUTTON_SELECTOR);
  if (isVisible(rose)) return rose;
  const stack = doc.querySelector(CHAMP_SELECT_BUTTONS);
  if (isVisible(stack)) return stack;
  return null;
}

export function layoutKey(dockEl, anchor, win) {
  if (!anchor) return 'fallback';
  const rect = anchor.getBoundingClientRect();
  return `${Math.round(rect.left)}:${Math.round(rect.top)}:${Math.round(rect.width)}:${Math.round(rect.height)}:${win.innerHeight}`;
}

export function layoutDock(dockEl, anchor, win) {
  if (!dockEl) return false;

  const key = layoutKey(dockEl, anchor, win);
  if (dockEl.dataset.layoutKey === key) return true;
  dockEl.dataset.layoutKey = key;

  if (!anchor) {
    dockEl.style.left = 'auto';
    dockEl.style.right = '24px';
    dockEl.style.bottom = '120px';
    dockEl.style.transform = 'none';
    return true;
  }

  const rect = anchor.getBoundingClientRect();
  dockEl.style.right = 'auto';
  dockEl.style.left = `${rect.left + rect.width / 2}px`;
  dockEl.style.bottom = `${win.innerHeight - rect.top + DOCK_GAP_PX}px`;
  dockEl.style.transform = 'translateX(-50%)';
  return true;
}

export function watchAnchor(doc, win, cb) {
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
