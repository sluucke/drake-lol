import { useId } from 'react';
import { motion } from 'motion/react';
import { AUTO_PICK_ROLES } from '../../../features/autoPickRoles.js';
import { roleIconUrl } from '../../../ui/roleIcons.js';
import { SFX } from '../../../ui/sfx.js';
import { useSfx } from '../../hooks/useSfx.js';
import { useT } from '../../i18n/I18nProvider.jsx';
import { SPRING } from '../../ui/motion.js';

export function RoleTabs({ value, counts, onChange, ariaLabel }) {
  const t = useT();
  const sfx = useSfx();
  const group = useId();
  return (
    <div role="tablist" aria-label={ariaLabel} className="drk-role-tabs">
      {AUTO_PICK_ROLES.map((role) => {
        const active = role.id === value;
        const icon = roleIconUrl(role.id);
        return (
          <button
            key={role.id}
            type="button"
            role="tab"
            aria-selected={active}
            data-role={role.id}
            className={['drk-role-tab', active && 'is-active'].filter(Boolean).join(' ')}
            onMouseEnter={() => sfx.play(SFX.hover)}
            onClick={() => {
              if (active) return;
              sfx.play(SFX.tab);
              onChange(role.id);
            }}
          >
            {active && <motion.span className="drk-role-tab__bg" layoutId={`${group}-bg`} transition={SPRING} />}
            {icon && <img className="drk-role-tab__icon" src={icon} alt="" />}
            <span className="drk-role-tab__label">{t(`roles.${role.id}`)}</span>
            <span className="drk-role-tab__count">{counts[role.id] || 0}</span>
          </button>
        );
      })}
    </div>
  );
}
