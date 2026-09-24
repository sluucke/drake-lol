import { useId } from 'react';
import { motion } from 'motion/react';
import { SFX } from '../../ui/sfx.js';
import { useSfx } from '../hooks/useSfx.js';
import { SPRING } from './motion.js';

export function Toggle({ checked, onChange, label, help, disabled = false, id }) {
  const sfx = useSfx();
  const autoId = useId();
  const switchId = id || autoId;
  const helpId = help ? `${switchId}-help` : undefined;
  return (
    <div className={['drk-toggle', disabled && 'is-disabled'].filter(Boolean).join(' ')}>
      <button
        type="button"
        role="switch"
        id={switchId}
        aria-checked={!!checked}
        aria-describedby={helpId}
        disabled={disabled}
        className={['drk-toggle__track', checked && 'is-on'].filter(Boolean).join(' ')}
        onMouseEnter={() => {
          if (!disabled) sfx.play(SFX.hover);
        }}
        onClick={() => {
          if (disabled) return;
          sfx.play(SFX.check);
          onChange?.(!checked);
        }}
      >
        <motion.span className="drk-toggle__knob" layout transition={SPRING} />
      </button>
      {label && (
        <label className="drk-toggle__label" htmlFor={switchId}>
          {label}
        </label>
      )}
      {help && (
        <p className="drk-toggle__help" id={helpId}>
          {help}
        </p>
      )}
    </div>
  );
}
