import { useEffect, useState } from 'react';
import { dockStyle, findAnchor, layoutKey, watchAnchor } from '../../ui/dodgeDock.js';

export function useDockStyle(active, { doc = document, win = window } = {}) {
  const [style, setStyle] = useState(() => dockStyle(null, win));

  useEffect(() => {
    if (!active) return undefined;
    let key = '';
    const update = () => {
      const anchor = findAnchor(doc);
      const next = layoutKey(null, anchor, win);
      if (next === key) return;
      key = next;
      setStyle(dockStyle(anchor, win));
    };
    update();
    return watchAnchor(doc, win, update);
  }, [active, doc, win]);

  return style;
}
