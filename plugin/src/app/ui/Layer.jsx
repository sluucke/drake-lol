import { createPortal } from 'react-dom';
import { usePortalTarget } from '../hooks/usePortalTarget.js';

export function Layer({ children }) {
  const target = usePortalTarget();
  return target ? createPortal(children, target) : children;
}
