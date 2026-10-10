import type { CSSProperties } from 'react';

export type SkeletonVariant = 'line' | 'circle';

export interface SkeletonProps {
  width?: CSSProperties['width'];
  height?: CSSProperties['height'];
  radius?: CSSProperties['borderRadius'];
  variant?: SkeletonVariant;
  className?: string;
}

export function Skeleton({ width = '100%', height = 12, radius, variant = 'line', className = '' }: SkeletonProps) {
  const circle = variant === 'circle';
  const style: CSSProperties = {
    width,
    height: circle ? width : height,
    borderRadius: circle ? '50%' : radius,
  };
  return <span aria-hidden="true" className={['drk-skel', `drk-skel--${variant}`, className].filter(Boolean).join(' ')} style={style} />;
}
