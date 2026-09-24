import { useId } from 'react';
import { motion } from 'motion/react';
import { SFX } from '../../ui/sfx.js';
import { useSfx } from '../hooks/useSfx.js';
import { SPRING } from './motion.js';

export function Segmented({ options, value, onChange, ariaLabel, disabled = false }) {
  const sfx = useSfx();
  const group = useId();
  return (
    <div role="radiogroup" aria-label={ariaLabel} className={['drk-segmented', disabled && 'is-disabled'].filter(Boolean).join(' ')}>
      {options.map((option) => {
        const active = String(option.value) === String(value);
        return (
          <button
            key={String(option.value)}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={disabled}
            className={['drk-segmented__item', active && 'is-active'].filter(Boolean).join(' ')}
            onMouseEnter={() => {
              if (!disabled) sfx.play(SFX.radioHover);
            }}
            onClick={() => {
              if (disabled || active) return;
              sfx.play(SFX.radio);
              onChange?.(option.value);
            }}
          >
            {active && <motion.span className="drk-segmented__thumb" layoutId={`${group}-thumb`} transition={SPRING} />}
            <span className="drk-segmented__label">{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}
