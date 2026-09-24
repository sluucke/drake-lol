import { SFX } from '../../ui/sfx.js';
import { useSfx } from '../hooks/useSfx.js';

export function Slider({ value, min = 0, max = 100, step = 1, onChange, format = String, disabled = false, ariaLabel, id }) {
  const sfx = useSfx();
  const pct = max === min ? 0 : ((value - min) / (max - min)) * 100;
  return (
    <div className={['drk-slider', disabled && 'is-disabled'].filter(Boolean).join(' ')}>
      <input
        id={id}
        className="drk-slider__input"
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        aria-label={ariaLabel}
        style={{ '--drk-slider-fill': `${pct}%` }}
        onChange={(event) => onChange?.(Number(event.target.value))}
        onPointerUp={() => {
          if (!disabled) sfx.play(SFX.check);
        }}
      />
      <output className="drk-slider__value">{format(value)}</output>
    </div>
  );
}
