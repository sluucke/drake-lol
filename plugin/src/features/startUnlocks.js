import { unlockIn } from './unlockFields.js';







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
