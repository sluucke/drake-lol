import { unlockIn } from './unlockFields';

export type UnlockRoot = ParentNode & Node & { documentElement?: Element | null };

export interface StartUnlocksOptions {
  enabled?: boolean;
  root?: UnlockRoot;
  observe?: boolean;
  onFirstUnlock?: (count: number) => void;
}







export function startUnlocks({
  enabled,
  root = document,
  observe = true,
  onFirstUnlock,
}: StartUnlocksOptions = {}): () => void {
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
