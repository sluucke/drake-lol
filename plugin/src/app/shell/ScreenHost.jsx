import { motion } from 'motion/react';
import { useReducedMotion } from '../hooks/useReducedMotion.js';
import { REACT_SCREENS } from '../screens/registry.jsx';
import { OnboardLayer } from './OnboardLayer.jsx';
import { useDrake } from '../store/StoreContext.jsx';
import { DURATION, EASE_OUT } from '../ui/motion.js';

export function ScreenHost({ screens = REACT_SCREENS }) {
  const screenId = useDrake((state) => state.ui.screen);
  const reduced = useReducedMotion();
  const Screen = screens[screenId] || null;

  return (
    <>
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
      <OnboardLayer />
    </>
  );
}
