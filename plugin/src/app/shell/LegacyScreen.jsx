import { useEffect, useRef } from 'react';
import { animate } from 'motion/react';
import { useReducedMotion } from '../hooks/useReducedMotion.js';
import { useDrake } from '../store/StoreContext.jsx';
import { DURATION, EASE_OUT } from '../ui/motion.js';

export function LegacyScreen() {
  const contentRef = useRef(null);
  const firstRef = useRef(true);
  const screenId = useDrake((state) => state.ui.screen);
  const reduced = useReducedMotion();

  useEffect(() => {
    if (firstRef.current) {
      firstRef.current = false;
      return;
    }
    if (reduced || !contentRef.current) return;
    animate(contentRef.current, { opacity: [0, 1], y: [8, 0] }, { duration: DURATION.base, ease: EASE_OUT });
  }, [screenId, reduced]);

  return (
    <>
      <div ref={contentRef} id="content" className="content drk-legacy-screen" />
      <div id="onboard-layer" className="onboard-layer" hidden />
    </>
  );
}
