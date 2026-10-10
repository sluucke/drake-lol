// @ts-nocheck
import { AnimatePresence, motion } from 'motion/react';
import { SFX } from '../../../ui/sfx';
import { useDockStyle } from '../../hooks/useDockStyle';
import { useSfx } from '../../hooks/useSfx';
import { useInClientChromeHidden } from '../../hooks/useStreaming';
import { useT } from '../../i18n/I18nProvider';
import { useLegacyActions } from '../../shell/LegacyActions';
import { useDrake } from '../../store/StoreContext';
import { Button } from '../../ui/Button';
import { Layer } from '../../ui/Layer';
import { DURATION, EASE_OUT } from '../../ui/motion';

const DODGE_LABELS = { idle: 'dodgeButton', busy: 'dodging', done: 'dodged', failed: 'dodgeFailed' };

const RISE = {
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: 10 },
  transition: { duration: DURATION.base, ease: EASE_OUT },
};

function DodgeDock({ dodge, onDodge }) {
  const t = useT();
  const sfx = useSfx();
  const style = useDockStyle(dodge !== 'busy');
  return (
    <div className="drk-dock drk-dock--dodge" style={style}>
      <motion.div {...RISE}>
        <button
          type="button"
          className="drk-hextech-btn drk-hextech-btn--danger"
          disabled={dodge === 'busy'}
          onMouseEnter={() => sfx.play(SFX.hover)}
          onClick={() => {
            sfx.play(SFX.secondary);
            onDodge();
          }}
        >
          {t(`screens.queue.${DODGE_LABELS[dodge] || DODGE_LABELS.idle}`)}
        </button>
      </motion.div>
    </div>
  );
}

function CancelDock({ onCancel }) {
  const t = useT();
  return (
    <div className="drk-dock drk-dock--cancel">
      <motion.div {...RISE}>
        <Button variant="danger" onClick={onCancel}>
          {t('overlays.docks.cancelQueue')}
        </Button>
      </motion.div>
    </div>
  );
}

export function ClientDocks() {
  const actions = useLegacyActions();
  const inGame = useDrake((s) => !!s.session.idle);
  const chromeHidden = useInClientChromeHidden();
  const overlayHost = useDrake((s) => s.session.streaming?.host === 'overlay');
  const idle = inGame || chromeHidden || overlayHost;
  const champSelect = useDrake((s) => s.champSelect);
  const dodgeEnabled = useDrake((s) => s.settings.values?.queue_dodge_in_client !== false);
  const showDodge = !idle && champSelect.active && dodgeEnabled;
  const showCancel = !idle && champSelect.cancelable;

  return (
    <Layer>
      <AnimatePresence>
        {showCancel ? <CancelDock key="cancel" onCancel={() => void actions.cancelQueue()} /> : null}
        {showDodge ? (
          <DodgeDock key="dodge" dodge={champSelect.dodge} onDodge={() => void actions.dodge()} />
        ) : null}
      </AnimatePresence>
    </Layer>
  );
}
