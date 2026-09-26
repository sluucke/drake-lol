import { useId } from 'react';
import { motion } from 'motion/react';
import { SFX } from '../../ui/sfx.js';
import { useSfx } from '../hooks/useSfx.js';
import { SPRING } from './motion.js';

export function Tabs({ tabs, value, onChange, className = '' }) {
  const sfx = useSfx();
  const group = useId();
  return (
    <div role="tablist" className={['drk-tabs', className].filter(Boolean).join(' ')}>
      {tabs.map((tab) => {
        const active = tab.id === value;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={active}
            className={['drk-tabs__tab', active && 'is-active'].filter(Boolean).join(' ')}
            onMouseEnter={() => sfx.play(SFX.hover)}
            onClick={() => {
              if (active) return;
              sfx.play(SFX.tab);
              onChange?.(tab.id);
            }}
          >
            <span className="drk-tabs__label">{tab.label}</span>
            {active && <motion.span className="drk-tabs__indicator" layoutId={`${group}-indicator`} transition={SPRING} />}
          </button>
        );
      })}
    </div>
  );
}
