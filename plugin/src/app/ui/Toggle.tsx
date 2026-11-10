import { useId } from 'react';
import type { ReactNode } from 'react';
import { SFX } from '../../ui/sfx';
import { useSfx } from '../hooks/useSfx';

export interface ToggleProps {
  checked: boolean;
  onChange?: (checked: boolean) => void;
  label?: ReactNode;
  help?: ReactNode;
  disabled?: boolean;
  id?: string;
}

export function Toggle({ checked, onChange, label, help, disabled = false, id }: ToggleProps) {
  const sfx = useSfx();
  const autoId = useId();
  const boxId = id || autoId;
  const helpId = help ? `${boxId}-help` : undefined;
  return (
    <div className={['drk-check', disabled && 'is-disabled'].filter(Boolean).join(' ')}>
      <button
        type="button"
        role="checkbox"
        id={boxId}
        aria-checked={!!checked}
        aria-describedby={helpId}
        disabled={disabled}
        className="drk-check__button"
        onMouseEnter={() => {
          if (!disabled) sfx.play(SFX.hover);
        }}
        onClick={() => {
          if (disabled) return;
          sfx.play(SFX.check);
          onChange?.(!checked);
        }}
      >
        <span className="drk-check__box" data-checked={checked ? 'true' : 'false'} aria-hidden="true" />
      </button>
      {label && (
        <label className="drk-check__label" htmlFor={boxId}>
          {label}
        </label>
      )}
      {help && (
        <p className="drk-check__help" id={helpId}>
          {help}
        </p>
      )}
    </div>
  );
}
