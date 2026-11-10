import { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { SFX } from '../../../ui/sfx';
import { useSfx } from '../../hooks/useSfx';
import { useFormat, useT } from '../../i18n/I18nProvider';
import { DURATION, EASE_OUT } from '../../ui/motion';
import { LOOT_CATEGORIES, planTotals } from '../../../features/loot';
import type { DisenchantEntry, Essence, LootCategory } from '../../../features/loot';
import { EssenceAmount } from './Essence';

const ESSENCES: readonly Essence[] = ['blue', 'orange'];

const EXPAND = {
  initial: { height: 0, opacity: 0 },
  animate: { height: 'auto', opacity: 1 },
  exit: { height: 0, opacity: 0 },
  transition: { duration: DURATION.base, ease: EASE_OUT },
};

interface GroupProps {
  category: LootCategory;
  entries: readonly DisenchantEntry[];
  onRemove?: (lootId: string) => void;
}

function TreeGroup({ category, entries, onRemove }: GroupProps) {
  const t = useT();
  const format = useFormat();
  const sfx = useSfx();
  const [open, setOpen] = useState(true);
  const totals = planTotals(entries);
  const subtotals = ESSENCES.filter((essence) => totals[essence] > 0);
  return (
    <section className={['drk-loot-tree__group', open && 'is-open'].filter(Boolean).join(' ')} data-category={category}>
      <button
        type="button"
        className="drk-loot-tree__head"
        aria-expanded={open}
        onMouseEnter={() => sfx.play(SFX.hover)}
        onClick={() => {
          sfx.play(SFX.tab);
          setOpen(!open);
        }}
      >
        <span className="drk-loot-tree__chevron" aria-hidden="true" />
        <span className="drk-loot-tree__label">{t(`overlays.loot.tabs.${category}`)}</span>
        <span className="drk-loot-tree__count" data-tree-count="">
          {t('overlays.loot.confirm.copies', { count: totals.copies })}
        </span>
        <span className="drk-actions__spacer" />
        <span className="drk-loot-tree__subtotal" data-tree-subtotal="">
          {subtotals.map((essence) => (
            <EssenceAmount key={essence} essence={essence} amount={totals[essence]} />
          ))}
        </span>
      </button>
      <AnimatePresence initial={false}>
        {open ? (
          <motion.ul key="items" className="drk-loot-tree__items" {...EXPAND}>
            {entries.map(({ item, repeat }) => (
              <li key={item.lootId} className="drk-loot-tree__item" data-loot-id={item.lootId}>
                <span className="drk-loot-tree__thumb">{item.tile ? <img src={item.tile} alt="" loading="lazy" draggable={false} /> : null}</span>
                <span className="drk-loot-tree__name" title={item.name}>
                  {item.name}
                </span>
                <span className="drk-loot-tree__copies">{t('overlays.loot.tile.count', { amount: format.number(repeat) })}</span>
                <EssenceAmount className="drk-loot-tree__value" essence={item.essence} amount={item.value * repeat} />
                {onRemove ? (
                  <button
                    type="button"
                    className="drk-loot-tree__remove"
                    aria-label={t('overlays.loot.confirm.remove', { name: item.name })}
                    title={t('overlays.loot.confirm.remove', { name: item.name })}
                    onMouseEnter={() => sfx.play(SFX.hover)}
                    onClick={() => {
                      sfx.play(SFX.close);
                      onRemove(item.lootId);
                    }}
                  />
                ) : null}
              </li>
            ))}
          </motion.ul>
        ) : null}
      </AnimatePresence>
    </section>
  );
}

export interface SelectionTreeProps {
  plan: readonly DisenchantEntry[];
  onRemove?: (lootId: string) => void;
}

export function SelectionTree({ plan, onRemove }: SelectionTreeProps) {
  const groups = LOOT_CATEGORIES.map((category) => ({
    category,
    entries: plan.filter((entry) => entry.item.category === category),
  })).filter((group) => group.entries.length > 0);
  return (
    <div className="drk-loot-tree">
      {groups.map((group) => (
        <TreeGroup key={group.category} category={group.category} entries={group.entries} onRemove={onRemove} />
      ))}
    </div>
  );
}
