import { AnimatePresence, motion } from 'motion/react';
import { iconUrl } from '../../../features/champions.js';
import { SFX } from '../../../ui/sfx.js';
import { useSfx } from '../../hooks/useSfx.js';
import { useT } from '../../i18n/I18nProvider.jsx';
import { DURATION } from '../../ui/motion.js';

export function PickSummary({ ids, champions, numbered = false, emptyLabel, onRemove }) {
  const t = useT();
  const sfx = useSfx();
  const nameOf = (id) => champions.find((c) => c.id === id)?.name || t('champions.noneChosen');
  if (ids.length === 0) return <p className="drk-pick-summary is-empty">{emptyLabel}</p>;
  return (
    <ul className="drk-pick-summary">
      <AnimatePresence initial={false}>
        {ids.map((id, index) => (
          <motion.li
            key={id}
            layout
            className="drk-pick-summary__item"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            transition={{ duration: DURATION.fast }}
          >
            {numbered && <span className="drk-pick-summary__num">{index + 1}</span>}
            <img className="drk-pick-summary__icon" src={iconUrl(id)} alt="" />
            <span className="drk-pick-summary__name">{nameOf(id)}</span>
            <button
              type="button"
              className="drk-pick-summary__remove"
              aria-label={`${t('common.remove')} ${nameOf(id)}`}
              onMouseEnter={() => sfx.play(SFX.hover)}
              onClick={() => {
                sfx.play(SFX.close);
                onRemove(id);
              }}
            >
              ✕
            </button>
          </motion.li>
        ))}
      </AnimatePresence>
    </ul>
  );
}
