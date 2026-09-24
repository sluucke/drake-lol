import { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { TOUR_STEPS } from '../../ui/onboarding.js';
import { DRAKE_ICON } from '../../ui/assets.js';
import { useT } from '../i18n/I18nProvider.jsx';
import { tourText } from '../onboarding/content.js';
import { useDrake } from '../store/StoreContext.jsx';
import { Button } from '../ui/Button.jsx';
import { DURATION, EASE_OUT } from '../ui/motion.js';
import { useLegacyActions } from './LegacyActions.jsx';

export function OnboardLayer() {
  const t = useT();
  const actions = useLegacyActions();
  const overlay = useDrake((state) => state.ui.overlay);
  const tourIndex = useDrake((state) => state.ui.tourIndex);
  const [busy, setBusy] = useState(false);
  const step = overlay === 'tour' ? TOUR_STEPS[tourIndex] : null;
  const mode = overlay === 'welcome' ? 'welcome' : step ? 'tour' : null;
  const last = tourIndex === TOUR_STEPS.length - 1;

  async function run(action) {
    if (busy) return;
    setBusy(true);
    try {
      await actions.onboard(action);
    } finally {
      setBusy(false);
    }
  }

  return (
    <AnimatePresence>
      {mode && (
        <motion.div
          key={mode}
          className={`drk-onboard is-${mode}`}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: DURATION.base }}
        >
          {mode === 'welcome' ? (
            <motion.div
              className="drk-welcome"
              role="dialog"
              aria-label={t('shell.title')}
              initial={{ opacity: 0, y: 12, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: DURATION.slow, ease: EASE_OUT }}
            >
              <img className="drk-welcome__mark" src={DRAKE_ICON} alt="" aria-hidden="true" />
              <div className="drk-welcome__name">{t('shell.title')}</div>
              <p className="drk-welcome__copy">{t('onboarding.welcome.copy')}</p>
              <div className="drk-actions drk-welcome__actions">
                <Button disabled={busy} onClick={() => run('tour')}>
                  {t('onboarding.welcome.tour')}
                </Button>
                <Button variant="secondary" disabled={busy} onClick={() => run('skip')}>
                  {t('onboarding.welcome.skip')}
                </Button>
              </div>
            </motion.div>
          ) : (
            <motion.div
              key={tourIndex}
              className="drk-tour"
              role="dialog"
              aria-label={tourText(t, tourIndex, step, 'title')}
              initial={{ opacity: 0, x: -12 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: DURATION.base, ease: EASE_OUT }}
            >
              <div className="drk-tour__meta">
                {t('onboarding.tour.progress', { current: tourIndex + 1, total: TOUR_STEPS.length })}
              </div>
              <h3 className="drk-tour__title">{tourText(t, tourIndex, step, 'title')}</h3>
              <p className="drk-tour__body">{tourText(t, tourIndex, step, 'body')}</p>
              <div className="drk-tour__dots" aria-hidden="true">
                {TOUR_STEPS.map((_, index) => (
                  <span key={index} className={index === tourIndex ? 'is-on' : ''} />
                ))}
              </div>
              <div className="drk-actions">
                <Button disabled={busy} onClick={() => run('tour-next')}>
                  {last ? t('onboarding.tour.done') : t('onboarding.tour.next')}
                </Button>
                <Button variant="secondary" disabled={busy} onClick={() => run('skip')}>
                  {t('onboarding.tour.skip')}
                </Button>
              </div>
            </motion.div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
