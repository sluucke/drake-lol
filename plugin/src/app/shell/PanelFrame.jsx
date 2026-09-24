import { motion } from 'motion/react';
import { DRAKE_ICON } from '../../ui/assets.js';
import { SFX } from '../../ui/sfx.js';
import { useSfx } from '../hooks/useSfx.js';
import { useT } from '../i18n/I18nProvider.jsx';
import { useDrake, useDrakeStore } from '../store/StoreContext.jsx';
import { DURATION, EASE_OUT } from '../ui/motion.js';
import { useLegacyActions } from './LegacyActions.jsx';
import { LegacyScreen } from './LegacyScreen.jsx';
import { ShellFooter } from './ShellFooter.jsx';
import { Sidebar } from './Sidebar.jsx';

const SCRIM = {
  open: { opacity: 1, visibility: 'visible', transition: { duration: DURATION.base } },
  closed: { opacity: 0, transition: { duration: DURATION.fast }, transitionEnd: { visibility: 'hidden' } },
};

const WINDOW = {
  open: { opacity: 1, scale: 1, y: 0, transition: { duration: DURATION.slow, ease: EASE_OUT } },
  closed: { opacity: 0, scale: 0.97, y: 8, transition: { duration: DURATION.fast } },
};

export function PanelFrame() {
  const t = useT();
  const sfx = useSfx();
  const store = useDrakeStore();
  const actions = useLegacyActions();
  const open = useDrake((state) => state.ui.panelOpen);

  return (
    <motion.div
      className="drk-panel"
      data-open={open ? 'true' : 'false'}
      initial={false}
      animate={open ? 'open' : 'closed'}
      variants={SCRIM}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) actions.close();
      }}
    >
      <motion.div className="drk-panel__window" role="dialog" aria-label={t('shell.title')} variants={WINDOW}>
        <header className="drk-panel__titlebar">
          <img className="drk-panel__mark" src={DRAKE_ICON} alt="" aria-hidden="true" />
          <h1 className="drk-panel__title">{t('shell.title')}</h1>
          <kbd className="drk-panel__hint">{t('shell.hotkeyHint')}</kbd>
          <div className="drk-panel__actions">
            <button
              type="button"
              className="drk-panel__icon-btn"
              aria-label={t('shell.creditsButton')}
              onMouseEnter={() => sfx.play(SFX.hover)}
              onClick={() => {
                sfx.play(SFX.tab);
                store.getState().setCreditsOpen(true);
              }}
            >
              ?
            </button>
            <button
              type="button"
              className="drk-panel__icon-btn"
              aria-label={t('shell.close')}
              onMouseEnter={() => sfx.play(SFX.hover)}
              onClick={() => {
                sfx.play(SFX.close);
                actions.close();
              }}
            >
              ✕
            </button>
          </div>
        </header>
        <div className="drk-panel__body">
          <Sidebar />
          <LegacyScreen />
        </div>
        <ShellFooter />
      </motion.div>
    </motion.div>
  );
}
