import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { STATUS_READY_MS } from '../../../ui/teamRevealDom.js';
import { useT } from '../../i18n/I18nProvider.jsx';
import { useLegacyActions } from '../../shell/LegacyActions.jsx';
import { useDrake } from '../../store/StoreContext.jsx';
import { Button } from '../../ui/Button.jsx';
import { Layer } from '../../ui/Layer.jsx';
import { DURATION, EASE_OUT } from '../../ui/motion.js';

export function ScoutingToast() {
  const t = useT();
  const actions = useLegacyActions();
  const view = useDrake((state) => state.teamReveal);
  const [dismissedSeq, setDismissedSeq] = useState(-1);
  const loading = view.statusPhase === 'loading';
  const ready = view.statusPhase === 'ready' && dismissedSeq !== view.statusSeq;
  const visible = view.enabled && !view.open && (loading || ready);

  useEffect(() => {
    if (view.statusPhase !== 'ready' || view.open) return undefined;
    const seq = view.statusSeq;
    const timer = setTimeout(() => setDismissedSeq(seq), STATUS_READY_MS);
    return () => clearTimeout(timer);
  }, [view.statusPhase, view.statusSeq, view.open]);

  const text = loading
    ? t('overlays.scouting.toast.revealing')
    : view.side
      ? t('overlays.scouting.toast.revealedSide', { side: t(`overlays.scouting.side.${view.side.side}`) })
      : t('overlays.scouting.toast.revealed');

  return (
    <Layer>
      <AnimatePresence>
        {visible && (
          <motion.div
            key="scouting-toast"
            role="status"
            className="drk-scout-toast"
            initial={{ opacity: 0, x: 24 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 24 }}
            transition={{ duration: DURATION.base, ease: EASE_OUT }}
          >
            {loading && <span className="drk-scout-toast__spinner" aria-hidden="true" />}
            <span>{text}</span>
            {!loading && (
              <Button size="sm" onClick={() => actions.openScouting()}>
                {t('overlays.scouting.toast.view')}
              </Button>
            )}
            {!loading && (
              <span
                key={view.statusSeq}
                className="drk-scout-toast__bar"
                style={{ animationDuration: `${STATUS_READY_MS}ms` }}
                aria-hidden="true"
              />
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </Layer>
  );
}
