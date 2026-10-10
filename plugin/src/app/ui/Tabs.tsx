import { useId } from 'react';
import type { ReactNode } from 'react';
import { motion } from 'motion/react';
import { SFX } from '../../ui/sfx';
import { useSfx } from '../hooks/useSfx';
import { SPRING } from './motion';

export interface TabItem<T extends string = string> {
  id: T;
  label: ReactNode;
}

export interface TabsProps<T extends string = string> {
  tabs: readonly TabItem<T>[];
  value: T;
  onChange?: (id: T) => void;
  className?: string;
}

export function Tabs<T extends string = string>({ tabs, value, onChange, className = '' }: TabsProps<T>) {
  const sfx = useSfx();
  const group = useId();
  return (
    <div role="tablist" className={['drk-tabs', className].filter(Boolean).join(' ')}>
      {tabs.map((tab) => {
        const active = tab.id === value;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={active}
            className={['drk-tabs__tab', active && 'is-active'].filter(Boolean).join(' ')}
            onMouseEnter={() => sfx.play(SFX.hover)}
            onClick={() => {
              if (active) return;
              sfx.play(SFX.tab);
              onChange?.(tab.id);
            }}
          >
            <span className="drk-tabs__label">{tab.label}</span>
            {active && <motion.span className="drk-tabs__indicator" layoutId={`${group}-indicator`} transition={SPRING} />}
          </button>
        );
      })}
    </div>
  );
}
