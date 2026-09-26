import { useEffect, useState } from 'react';
import { watchAnchor } from '../../ui/dodgeDock.js';
import { ensureToggleHost, findSocialBar, injectSocialToggleStyles } from '../../ui/socialToggle.js';

export function useSocialHost(active, { doc = document, win = window } = {}) {
  const [host, setHost] = useState(null);

  useEffect(() => {
    if (!active) return undefined;
    let last = null;
    const update = () => {
      const bar = findSocialBar(doc);
      if (bar) injectSocialToggleStyles(bar.ownerDocument || doc);
      const next = bar ? ensureToggleHost(bar) : null;
      if (next === last) return;
      if (last && last !== next) last.remove();
      last = next;
      setHost(next);
    };
    update();
    const stop = watchAnchor(doc, win, update);
    return () => {
      stop();
      if (last) last.remove();
      setHost(null);
    };
  }, [active, doc, win]);

  return host;
}
