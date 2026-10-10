import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { usePortalTarget } from '../hooks/usePortalTarget';

export interface LayerProps {
  children?: ReactNode;
}

export function Layer({ children }: LayerProps) {
  const target = usePortalTarget();
  return target ? createPortal(children, target) : children;
}
