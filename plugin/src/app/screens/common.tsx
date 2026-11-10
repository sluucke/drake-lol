import type { ReactNode } from 'react';
import type { ActionResult } from '../../features/presence';
import type { DrakeSettings, SettingsPatch, SettingsValues } from '../../settings';
import { useLegacyActions } from '../shell/LegacyActions';
import { useDrake } from '../store/StoreContext';
import { Toggle } from '../ui/Toggle';

export interface ScreenHeaderProps {
  title: ReactNode;
  subtitle?: ReactNode;
}

export function ScreenHeader({ title, subtitle }: ScreenHeaderProps) {
  return (
    <header className="drk-screen__head">
      <h2 className="drk-screen__title">{title}</h2>
      {subtitle && <p className="drk-screen__sub">{subtitle}</p>}
    </header>
  );
}

export interface FieldProps {
  label?: ReactNode;
  htmlFor?: string;
  off?: boolean;
  children?: ReactNode;
}

export function Field({ label, htmlFor, off = false, children }: FieldProps) {
  return (
    <div className={['drk-field', off && 'is-off'].filter(Boolean).join(' ')}>
      {label &&
        (htmlFor ? (
          <label className="drk-field__label" htmlFor={htmlFor}>
            {label}
          </label>
        ) : (
          <span className="drk-field__label">{label}</span>
        ))}
      {children}
    </div>
  );
}

export type HelpTone = 'info' | 'warn';

export interface HelpProps {
  tone?: HelpTone;
  children?: ReactNode;
}

export function Help({ tone, children }: HelpProps) {
  return <p className={['drk-help', tone && `is-${tone}`].filter(Boolean).join(' ')}>{children}</p>;
}

export interface SettingsHandle {
  values: SettingsValues;
  trayDown: boolean;
  save(patch: SettingsPatch): Promise<ActionResult>;
}

export type BooleanSettingKey = {
  [K in keyof DrakeSettings]: DrakeSettings[K] extends boolean ? K : never;
}[keyof DrakeSettings];

export function useSettings(): SettingsHandle {
  const values = useDrake((state) => state.settings.values);
  const trayDown = useDrake((state) => state.settings.trayDown);
  const actions = useLegacyActions();
  return { values, trayDown, save: (patch: SettingsPatch) => actions.setSettings(patch) };
}

export interface SettingToggleProps {
  id: BooleanSettingKey;
  label?: ReactNode;
  help?: ReactNode;
  defaultOn?: boolean;
  disabled?: boolean;
}

export function SettingToggle({ id, label, help, defaultOn = false, disabled = false }: SettingToggleProps) {
  const { values, trayDown, save } = useSettings();
  const checked = defaultOn ? values[id] !== false : !!values[id];
  return (
    <Toggle
      id={`setting-${id}`}
      checked={checked}
      label={label}
      help={help}
      disabled={disabled || trayDown}
      onChange={(next) => save({ [id]: next })}
    />
  );
}
