import { AnimatePresence, motion } from 'motion/react';
import { DRAKE_ICON } from '../../../ui/assets.js';
import { useStreaming } from '../../hooks/useStreaming.js';
import { useT } from '../../i18n/I18nProvider.jsx';
import { useLegacyActions } from '../../shell/LegacyActions.jsx';
import { useDrake } from '../../store/StoreContext.jsx';
import { Layer } from '../../ui/Layer.jsx';
import { DURATION, EASE_OUT } from '../../ui/motion.js';
import { OVERLAY_SIZES, overlayChromeLayout } from './overlayLayout.js';

const DODGE_LABELS = { idle: 'dodgeButton', busy: 'dodging', done: 'dodged', failed: 'dodgeFailed' };

const FADE = {
  initial: { opacity: 0, scale: 0.92 },
  animate: { opacity: 1, scale: 1 },
  exit: { opacity: 0, scale: 0.92 },
  transition: { duration: DURATION.base, ease: EASE_OUT },
};

function place(position, size) {
  return { left: `${position.left}px`, top: `${position.top}px`, width: `${size.width}px`, height: `${size.height}px` };
}

export function OverlayChrome() {
  const t = useT();
  const actions = useLegacyActions();
  const streaming = useStreaming();
  const panelOpen = useDrake((s) => s.ui.panelOpen);
  const geometry = useDrake((s) => s.session.overlayGeometry);
  const champSelect = useDrake((s) => s.champSelect);
  const dodgeEnabled = useDrake((s) => s.settings.values?.queue_dodge_in_client !== false);
  if (streaming.host !== 'overlay') return null;
  const layout = overlayChromeLayout(geometry?.client, geometry?.chrome);
  const visible = !panelOpen && !!layout;

  return (
    <Layer>
      <AnimatePresence>
        {visible ? (
          <motion.button
            key="fab"
            type="button"
            className="drk-overlay-fab"
            style={place(layout.fab, OVERLAY_SIZES.fab)}
            aria-label={t('overlays.socialToggle.open')}
            title="Drake (Ctrl+D)"
            onClick={() => actions.togglePanel()}
            {...FADE}
          >
            <img src={DRAKE_ICON} alt="" />
          </motion.button>
        ) : null}
        {visible && champSelect.cancelable ? (
          <motion.button
            key="cancel"
            type="button"
            className="drk-overlay-dock drk-overlay-dock--danger"
            style={place(layout.cancel, OVERLAY_SIZES.cancel)}
            onClick={() => void actions.cancelQueue()}
            {...FADE}
          >
            {t('overlays.docks.cancelQueue')}
          </motion.button>
        ) : null}
        {visible && champSelect.active && dodgeEnabled ? (
          <motion.button
            key="dodge"
            type="button"
            className="drk-overlay-dock drk-overlay-dock--danger"
            style={place(layout.dodge, OVERLAY_SIZES.dodge)}
            disabled={champSelect.dodge === 'busy'}
            onClick={() => void actions.dodge()}
            {...FADE}
          >
            {t(`screens.queue.${DODGE_LABELS[champSelect.dodge] || DODGE_LABELS.idle}`)}
          </motion.button>
        ) : null}
      </AnimatePresence>
    </Layer>
  );
}
