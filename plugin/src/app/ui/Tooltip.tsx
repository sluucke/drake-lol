import { useEffect, useId, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { MotionStyle } from 'motion/react';
import { AnimatePresence, motion } from 'motion/react';
import { Layer } from './Layer';
import { DURATION } from './motion';

export interface TooltipProps {
  content: ReactNode;
  delay?: number;
  children?: ReactNode;
}

export function Tooltip({ content, delay = 250, children }: TooltipProps) {
  const [open, setOpen] = useState(false);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const anchorRef = useRef<HTMLSpanElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const id = useId();

  const show = () => {
    if (content == null) return;
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      if (anchorRef.current) setRect(anchorRef.current.getBoundingClientRect());
      setOpen(true);
    }, delay);
  };

  const hide = () => {
    clearTimeout(timer.current);
    setOpen(false);
  };

  useEffect(() => () => clearTimeout(timer.current), []);

  const visible = open && content != null;
  const style: MotionStyle = rect
    ? { position: 'fixed', left: rect.left + rect.width / 2, top: rect.top - 8, x: '-50%', y: '-100%' }
    : { position: 'fixed', x: '-50%', y: '-100%' };

  return (
    <>
      <span
        ref={anchorRef}
        className="drk-tooltip__anchor"
        aria-describedby={visible ? id : undefined}
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
      >
        {children}
      </span>
      <Layer>
        <AnimatePresence>
          {visible && (
            <motion.div
              key="tooltip"
              id={id}
              role="tooltip"
              className="drk-tooltip"
              style={style}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: DURATION.fast }}
            >
              {content}
            </motion.div>
          )}
        </AnimatePresence>
      </Layer>
    </>
  );
}
