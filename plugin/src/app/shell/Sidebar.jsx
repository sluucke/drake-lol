import { motion } from 'motion/react';
import { SCREENS } from '../../ui/panel.js';
import { TOUR_STEPS } from '../../ui/onboarding.js';
import { SFX } from '../../ui/sfx.js';
import { useSfx } from '../hooks/useSfx.js';
import { useT } from '../i18n/I18nProvider.jsx';
import { useDrake } from '../store/StoreContext.jsx';
import { DURATION, SPRING, staggerDelay } from '../ui/motion.js';
import { useLegacyActions } from './LegacyActions.jsx';

export function Sidebar() {
  const t = useT();
  const sfx = useSfx();
  const actions = useLegacyActions();
  const screenId = useDrake((state) => state.ui.screen);
  const overlay = useDrake((state) => state.ui.overlay);
  const tourIndex = useDrake((state) => state.ui.tourIndex);
  const tourScreen = overlay === 'tour' ? TOUR_STEPS[tourIndex]?.screen : null;

  return (
    <nav className="drk-sidebar" role="tablist" aria-orientation="vertical">
      {SCREENS.map((item, index) => {
        const active = item.id === screenId;
        return (
          <motion.button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={active}
            data-screen={item.id}
            data-tour-active={tourScreen === item.id ? 'true' : undefined}
            className={['drk-sidebar__item', active && 'is-active'].filter(Boolean).join(' ')}
            initial={{ opacity: 0, x: -6 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: staggerDelay(index), duration: DURATION.base }}
            onMouseEnter={() => sfx.play(SFX.hover)}
            onClick={() => {
              sfx.play(SFX.tab);
              actions.navigate(item.id);
            }}
          >
            {active && <motion.span className="drk-sidebar__indicator" layoutId="drk-sidebar-indicator" transition={SPRING} />}
            <span className="drk-sidebar__label">{t(`shell.nav.${item.id}`)}</span>
          </motion.button>
        );
      })}
    </nav>
  );
}
