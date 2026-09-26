import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { SFX } from '../../ui/sfx.js';
import { useSfx } from '../hooks/useSfx.js';
import { useEscapeLayer } from '../hooks/useEscapeLayer.js';
import { Layer } from './Layer.jsx';
import { DURATION, EASE_OUT } from './motion.js';

function same(a, b) {
  return String(a) === String(b);
}

export function Select({ value, options, onChange, disabled = false, ariaLabel, className = '' }) {
  const sfx = useSfx();
  const [open, setOpen] = useState(false);
  const [rect, setRect] = useState(null);
  const triggerRef = useRef(null);
  const listRef = useRef(null);
  const listId = useId();
  const selected = options.find((o) => same(o.value, value)) || options[0] || null;
  useEscapeLayer(open);

  useLayoutEffect(() => {
    if (open && triggerRef.current) setRect(triggerRef.current.getBoundingClientRect());
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const doc = triggerRef.current?.ownerDocument;
    const win = doc?.defaultView;
    if (!doc || !win) return undefined;
    const onPointerDown = (event) => {
      const path = typeof event.composedPath === 'function' ? event.composedPath() : [event.target];
      if (path.includes(triggerRef.current) || path.includes(listRef.current)) return;
      setOpen(false);
    };
    const onKeyDown = (event) => {
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      setOpen(false);
    };
    doc.addEventListener('pointerdown', onPointerDown, true);
    win.addEventListener('keydown', onKeyDown, true);
    return () => {
      doc.removeEventListener('pointerdown', onPointerDown, true);
      win.removeEventListener('keydown', onKeyDown, true);
    };
  }, [open]);

  const pick = (option) => {
    sfx.play(SFX.check);
    setOpen(false);
    if (!same(option.value, selected?.value)) onChange?.(option.value);
  };

  const listStyle = rect
    ? { position: 'fixed', top: rect.bottom + 4, left: rect.left, minWidth: rect.width }
    : undefined;

  return (
    <div className={['drk-select', open && 'is-open', disabled && 'is-disabled', className].filter(Boolean).join(' ')}>
      <button
        ref={triggerRef}
        type="button"
        className="drk-select__trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-label={ariaLabel}
        disabled={disabled}
        onMouseEnter={() => {
          if (!disabled) sfx.play(SFX.hover);
        }}
        onClick={() => {
          if (disabled) return;
          if (!open) sfx.play(SFX.select);
          setOpen(!open);
        }}
      >
        {selected?.icon && <img className="drk-select__icon" src={selected.icon} alt="" />}
        <span className="drk-select__value">{selected?.label ?? ''}</span>
        <span className="drk-select__chevron" aria-hidden="true" />
      </button>
      <Layer>
        <AnimatePresence>
          {open && (
            <motion.ul
              key="list"
              ref={listRef}
              id={listId}
              role="listbox"
              className="drk-select__list"
              style={listStyle}
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: DURATION.fast, ease: EASE_OUT }}
            >
              {options.map((option) => {
                const isSelected = same(option.value, selected?.value);
                return (
                  <li
                    key={String(option.value)}
                    role="option"
                    aria-selected={isSelected}
                    className={['drk-select__option', isSelected && 'is-selected'].filter(Boolean).join(' ')}
                    onClick={() => pick(option)}
                  >
                    {option.icon && <img className="drk-select__icon" src={option.icon} alt="" />}
                    <span>{option.label}</span>
                  </li>
                );
              })}
            </motion.ul>
          )}
        </AnimatePresence>
      </Layer>
    </div>
  );
}
