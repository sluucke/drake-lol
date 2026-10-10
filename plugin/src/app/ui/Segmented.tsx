import type { ReactNode } from 'react';
import { SFX } from '../../ui/sfx';
import { useSfx } from '../hooks/useSfx';

export interface SegmentedOption<V extends string | number = string> {
  value: V;
  label: ReactNode;
}

export interface SegmentedProps<V extends string | number = string> {
  options: readonly SegmentedOption<V>[];
  value: V;
  onChange?: (value: V) => void;
  ariaLabel?: string;
  disabled?: boolean;
}

export function Segmented<V extends string | number = string>({ options, value, onChange, ariaLabel, disabled = false }: SegmentedProps<V>) {
  const sfx = useSfx();
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
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
