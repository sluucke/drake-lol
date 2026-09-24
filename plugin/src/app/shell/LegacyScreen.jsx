import { useEffect, useRef } from 'react';
import { animate, motion } from 'motion/react';
import { useReducedMotion } from '../hooks/useReducedMotion.js';
import { REACT_SCREENS } from '../screens/registry.jsx';
import { useDrake } from '../store/StoreContext.jsx';
import { DURATION, EASE_OUT } from '../ui/motion.js';

export function LegacyScreen({ screens = REACT_SCREENS }) {
  const contentRef = useRef(null);
  const firstRef = useRef(true);
  const screenId = useDrake((state) => state.ui.screen);
  const reduced = useReducedMotion();
  const Screen = screens[screenId] || null;

  useEffect(() => {
    if (firstRef.current) {
      firstRef.current = false;
      return;
    }
    if (Screen || reduced || !contentRef.current) return;
    animate(contentRef.current, { opacity: [0, 1], y: [8, 0] }, { duration: DURATION.base, ease: EASE_OUT });
  }, [screenId, reduced, Screen]);

  return (
    <>
      <div ref={contentRef} id="content" className="content drk-legacy-screen" hidden={!!Screen} />
      {Screen && (
        <motion.div
          key={screenId}
          className="content drk-screen"
          initial={reduced ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: DURATION.base, ease: EASE_OUT }}
        >
          <Screen />
        </motion.div>
      )}
      <div id="onboard-layer" className="onboard-layer" hidden />
    </>
  );
}
