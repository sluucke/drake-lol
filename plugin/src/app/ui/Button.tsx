import type { MouseEvent, ReactNode } from 'react';
import { motion } from 'motion/react';
import type { HTMLMotionProps } from 'motion/react';
import { SFX } from '../../ui/sfx';
import { useSfx } from '../hooks/useSfx';
import { DURATION } from './motion';

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';

export type ButtonSize = 'sm' | 'md';

export interface ButtonProps extends Omit<HTMLMotionProps<'button'>, 'type' | 'onClick' | 'children' | 'className' | 'disabled'> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  disabled?: boolean;
  onClick?: (event: MouseEvent<HTMLButtonElement>) => void;
  className?: string;
  type?: 'button' | 'submit' | 'reset';
  children?: ReactNode;
}

const CLICK: Record<ButtonVariant, string> = { primary: SFX.click, secondary: SFX.secondary, danger: SFX.secondary, ghost: SFX.tab };
const HOVER: Record<ButtonVariant, string> = { primary: SFX.goldHover, secondary: SFX.hover, danger: SFX.hover, ghost: SFX.hover };

export function Button({
  variant = 'primary',
  size = 'md',
  disabled = false,
  onClick,
  className = '',
  type = 'button',
  children,
  ...rest
}: ButtonProps) {
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
