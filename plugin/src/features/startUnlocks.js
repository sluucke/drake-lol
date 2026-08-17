import { unlockIn } from './unlockFields.js';

/// Keeps the client's status input unlocked.
///
/// It has to keep running rather than patch once: the field is created and
/// destroyed by the client every time the social menu opens, so a single pass
/// at load would patch nothing (the field does not exist yet) and a pass at
/// first sight would be undone by the next re-render.
export function startUnlocks({
  enabled,
  root = document,
  observe = true,
  onFirstUnlock,
} = {}) {
  if (!enabled) return () => {};

  let announced = false;
  const scan = () => {
    const n = unlockIn(root);
    if (n > 0 && !announced) {
      announced = true;
      if (onFirstUnlock) onFirstUnlock(n);
    }
  };

  scan();
  if (!observe || typeof MutationObserver === 'undefined') return () => {};

  const observer = new MutationObserver(scan);
  observer.observe(root.documentElement || root, { childList: true, subtree: true });
  return () => observer.disconnect();
}
