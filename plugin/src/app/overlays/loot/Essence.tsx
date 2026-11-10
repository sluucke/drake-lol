import { BLUE_ESSENCE_ICON, ORANGE_ESSENCE_ICON } from '../../../ui/assets';
import { useFormat, useT } from '../../i18n/I18nProvider';
import type { Essence } from '../../../features/loot';

export const ESSENCE_ICONS: Readonly<Record<Essence, string>> = { blue: BLUE_ESSENCE_ICON, orange: ORANGE_ESSENCE_ICON };

export function EssenceIcon({ essence, className = '' }: { essence: Essence; className?: string }) {
  return (
    <img
      className={['drk-essence', `drk-essence--${essence}`, className].filter(Boolean).join(' ')}
      src={ESSENCE_ICONS[essence]}
      alt=""
      draggable={false}
      data-essence-icon={essence}
    />
  );
}

export function EssenceAmount({ essence, amount, className = '' }: { essence: Essence; amount: number; className?: string }) {
  const t = useT();
  const format = useFormat();
  const value = format.number(amount);
  const label = `${value} ${t(`overlays.loot.essence.${essence}`)}`;
  return (
    <span className={['drk-essence-amount', `is-${essence}`, className].filter(Boolean).join(' ')} aria-label={label} title={label}>
      <EssenceIcon essence={essence} />
      {value}
    </span>
  );
}
