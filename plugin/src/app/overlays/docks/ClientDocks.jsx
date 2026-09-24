import { AnimatePresence, motion } from 'motion/react';
import { useDockStyle } from '../../hooks/useDockStyle.js';
import { useT } from '../../i18n/I18nProvider.jsx';
import { useLegacyActions } from '../../shell/LegacyActions.jsx';
import { useDrake } from '../../store/StoreContext.jsx';
import { Button } from '../../ui/Button.jsx';
import { Layer } from '../../ui/Layer.jsx';
import { DURATION, EASE_OUT } from '../../ui/motion.js';

const DODGE_LABELS = { idle: 'dodgeButton', busy: 'dodging', done: 'dodged', failed: 'dodgeFailed' };

const RISE = {
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: 10 },
  transition: { duration: DURATION.base, ease: EASE_OUT },
};

function DodgeDock({ dodge, onDodge }) {
  const t = useT();
  const style = useDockStyle(dodge !== 'busy');
  return (
    <div className="drk-dock drk-dock--dodge" style={style}>
      <motion.div {...RISE}>
        <Button variant="danger" disabled={dodge === 'busy'} onClick={onDodge}>
          {t(`screens.queue.${DODGE_LABELS[dodge] || DODGE_LABELS.idle}`)}
        </Button>
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
  const idle = useDrake((s) => !!s.session.idle);
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
