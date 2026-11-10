import { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import type { DomScope } from '../../hooks/useDockStyle';

export const LOOT_SCREEN_SELECTOR = '.screen-root[data-screen-name="rcp-fe-lol-loot"]';
export const LOOT_POLL_MS = 1000;

const OFFSET_TOP = 14;
const OFFSET_RIGHT = 24;

export interface LootAnchor {
  top: number;
  right: number;
}

export function findLootScreen(doc: Document): Element | null {
  const root = doc.querySelector(LOOT_SCREEN_SELECTOR);
  return root && root.getClientRects().length > 0 ? root : null;
}

export function lootAnchor(root: Element | null, win: Window): LootAnchor | null {
  if (!root) return null;
  const rect = root.getBoundingClientRect();
  return {
    top: Math.round(rect.top + OFFSET_TOP),
    right: Math.round(Math.max(0, win.innerWidth - rect.right) + OFFSET_RIGHT),
  };
}

export function lootButtonStyle(anchor: LootAnchor): CSSProperties {
  return { top: anchor.top, right: anchor.right };
}

function sameAnchor(a: LootAnchor | null, b: LootAnchor | null): boolean {
  return a === b || (!!a && !!b && a.top === b.top && a.right === b.right);
}

export function useLootScreen(active: boolean, { doc = document, win = window }: DomScope = {}): LootAnchor | null {
  const [anchor, setAnchor] = useState<LootAnchor | null>(null);

  useEffect(() => {
    if (!active) {
      setAnchor(null);
      return undefined;
    }
    const update = () => {
      const next = lootAnchor(findLootScreen(doc), win);
      setAnchor((prev) => (sameAnchor(prev, next) ? prev : next));
    };
    update();
    const timer = win.setInterval(update, LOOT_POLL_MS);
    win.addEventListener('resize', update);
    return () => {
      win.clearInterval(timer);
      win.removeEventListener('resize', update);
    };
  }, [active, doc, win]);

  return anchor;
}
