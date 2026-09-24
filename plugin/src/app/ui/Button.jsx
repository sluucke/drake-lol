import { motion } from 'motion/react';
import { SFX } from '../../ui/sfx.js';
import { useSfx } from '../hooks/useSfx.js';
import { DURATION } from './motion.js';

const CLICK = { primary: SFX.click, secondary: SFX.secondary, danger: SFX.secondary, ghost: SFX.tab };
const HOVER = { primary: SFX.goldHover, secondary: SFX.hover, danger: SFX.hover, ghost: SFX.hover };

export function Button({
  variant = 'primary',
  size = 'md',
  disabled = false,
  onClick,
  className = '',
  type = 'button',
  children,
  ...rest
}) {
  const sfx = useSfx();
  const classes = ['drk-btn', `drk-btn--${variant}`, `drk-btn--${size}`, className].filter(Boolean).join(' ');
  return (
    <motion.button
      {...rest}
      type={type}
      className={classes}
      disabled={disabled}
      whileHover={disabled ? undefined : { y: -1 }}
      whileTap={disabled ? undefined : { y: 0, scale: 0.98 }}
      transition={{ duration: DURATION.fast }}
      onMouseEnter={() => {
        if (!disabled) sfx.play(HOVER[variant]);
      }}
      onClick={(event) => {
        if (disabled) return;
        sfx.play(CLICK[variant]);
        onClick?.(event);
      }}
    >
      {children}
    </motion.button>
  );
}
