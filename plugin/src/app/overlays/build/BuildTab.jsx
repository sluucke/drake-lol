import { useEffect, useRef } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { useT } from '../../i18n/I18nProvider.jsx';
import { useLegacyActions } from '../../shell/LegacyActions.jsx';
import { useDrake } from '../../store/StoreContext.jsx';
import { Button } from '../../ui/Button.jsx';
import { DURATION } from '../../ui/motion.js';
import { BuildHeader } from './BuildHeader.jsx';

const OPGG_ERROR = 'Could not reach OP.GG';

function Placeholder({ children, error = false }) {
  return <div className={['drk-build-placeholder', error && 'is-error'].filter(Boolean).join(' ')}>{children}</div>;
}

export function BuildTab({ body = null }) {
  const t = useT();
  const actions = useLegacyActions();
  const state = useDrake((s) => s.build);
  const firstRef = useRef(true);

  useEffect(() => {
    if (firstRef.current) {
      firstRef.current = false;
      return;
    }
    if (state.championId) void actions.loadBuild();
  }, [state.championId]);

  let content;
  if (!state.championId) {
    content = <Placeholder>{t('overlays.build.pickChampion')}</Placeholder>;
  } else if (state.loading) {
    content = (
      <Placeholder>
        <span className="drk-build-spinner" aria-hidden="true" />
        {t('overlays.build.loading')}
      </Placeholder>
    );
  } else if (state.error) {
    content = (
      <Placeholder error>
        <span>{state.error === OPGG_ERROR ? t('overlays.build.opggError') : state.error}</span>
        <Button size="sm" onClick={() => actions.retryBuild()}>
          {t('overlays.build.retry')}
        </Button>
      </Placeholder>
    );
  } else if (!state.build?.hasData) {
    content = (
      <Placeholder>
        <span>{t('overlays.build.noData', { tier: t(`overlays.build.tiers.${state.tier}`) })}</span>
        <Button size="sm" onClick={() => actions.showAllRanks()}>
          {t('overlays.build.seeAllRanks')}
        </Button>
      </Placeholder>
    );
  } else {
    content = body;
  }

  return (
    <div className="drk-build">
      <BuildHeader />
      <AnimatePresence initial={false}>
        {state.viewingPlayer && (
          <motion.div
            key="viewing"
            className="drk-build-viewing"
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: DURATION.base }}
          >
            <span>
              {t('overlays.build.viewing')} <b>{state.viewingPlayer}</b>
            </span>
            <button
              type="button"
              className="drk-build-viewing__restore"
              title={t('overlays.build.restoreTitle')}
              onClick={() => actions.clearPlayerBuild()}
            >
              {t('overlays.build.restore')}
            </button>
          </motion.div>
        )}
      </AnimatePresence>
      {content}
    </div>
  );
}
