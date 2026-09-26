import { useEffect, useState } from 'react';

const QUERY = '(prefers-reduced-motion: reduce)';

function query() {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return null;
  return window.matchMedia(QUERY);
}

export function useReducedMotion() {
  const [reduced, setReduced] = useState(() => !!query()?.matches);
  useEffect(() => {
    const mql = query();
    if (!mql) return undefined;
    const onChange = () => setReduced(!!mql.matches);
    mql.addEventListener?.('change', onChange);
    return () => mql.removeEventListener?.('change', onChange);
  }, []);
  return reduced;
}
