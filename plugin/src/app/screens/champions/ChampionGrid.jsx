import { motion } from 'motion/react';
import { iconUrl } from '../../../features/champions.js';
import { SFX } from '../../../ui/sfx.js';
import { useSfx } from '../../hooks/useSfx.js';
import { DURATION } from '../../ui/motion.js';

export function ChampionGrid({ champions, slots, onPick, compact = false, emptyLabel }) {
  const sfx = useSfx();
  if (champions.length === 0) return <p className="drk-help">{emptyLabel}</p>;
  return (
    <div className={['drk-champ-grid', compact && 'is-compact'].filter(Boolean).join(' ')}>
      {champions.map((champion) => {
        const slot = slots.get(champion.id);
        return (
          <motion.button
            key={champion.id}
            type="button"
            className={['drk-champ', slot && 'is-on'].filter(Boolean).join(' ')}
            title={champion.name}
            aria-label={champion.name}
            aria-pressed={!!slot}
            whileTap={{ scale: 0.94 }}
            transition={{ duration: DURATION.fast }}
            onMouseEnter={() => sfx.play(SFX.cardHover)}
            onClick={() => {
              sfx.play(SFX.card);
              onPick(champion.id);
            }}
          >
            <img src={iconUrl(champion.id)} alt="" loading="lazy" />
            {typeof slot === 'number' && <span className="drk-champ__slot">{slot}</span>}
          </motion.button>
        );
      })}
    </div>
  );
}
