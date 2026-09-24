import { useEffect, useId, useRef } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { SFX } from '../../ui/sfx.js';
import { useSfx } from '../hooks/useSfx.js';
import { useT } from '../i18n/I18nProvider.jsx';
import { Layer } from './Layer.jsx';
import { DURATION, EASE_OUT } from './motion.js';

const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function Modal({ open, onClose, title, width = 560, closeLabel, className = '', children }) {
  const sfx = useSfx();
  const t = useT();
  const dialogRef = useRef(null);
  const onCloseRef = useRef(onClose);
  const titleId = useId();
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return undefined;
    const dialog = dialogRef.current;
    const win = dialog?.ownerDocument?.defaultView;
    if (!dialog || !win) return undefined;
    dialog.querySelector(FOCUSABLE)?.focus();
    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onCloseRef.current?.();
        return;
      }
      if (event.key !== 'Tab') return;
      const items = [...dialog.querySelectorAll(FOCUSABLE)];
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      const active = dialog.getRootNode().activeElement;
      if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };
    win.addEventListener('keydown', onKeyDown, true);
    return () => win.removeEventListener('keydown', onKeyDown, true);
  }, [open]);

  const close = () => {
    sfx.play(SFX.close);
    onClose?.();
  };

  return (
    <Layer>
      <AnimatePresence>
        {open && (
          <motion.div
            key="backdrop"
            className="drk-modal__backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: DURATION.base }}
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) close();
            }}
          >
            <motion.div
              ref={dialogRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby={title ? titleId : undefined}
              className={['drk-modal', className].filter(Boolean).join(' ')}
              style={{ width }}
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              transition={{ duration: DURATION.base, ease: EASE_OUT }}
            >
              <header className="drk-modal__head">
                {title && (
                  <h2 id={titleId} className="drk-modal__title">
                    {title}
                  </h2>
                )}
                <button
                  type="button"
                  className="drk-modal__close"
                  aria-label={closeLabel ?? t('common.close')}
                  onMouseEnter={() => sfx.play(SFX.hover)}
                  onClick={close}
                />
              </header>
              <div className="drk-modal__body">{children}</div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </Layer>
  );
}
