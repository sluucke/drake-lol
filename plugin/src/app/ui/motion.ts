import type { Transition } from 'motion/react';

export const DURATION = { fast: 0.12, base: 0.18, slow: 0.28 };
export const EASE_OUT: [number, number, number, number] = [0.22, 1, 0.36, 1];
export const EASE_SPRING: [number, number, number, number] = [0.34, 1.56, 0.64, 1];
export const SPRING: Transition = { type: 'spring', stiffness: 520, damping: 36, mass: 0.8 };
export const STAGGER = 0.03;
export const MAX_STAGGERED = 10;

export function staggerDelay(index: number): number {
  return Math.min(index, MAX_STAGGERED) * STAGGER;
}
