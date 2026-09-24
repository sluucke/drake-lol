import { useLegacyActions } from '../shell/LegacyActions.jsx';
import { useDrake } from '../store/StoreContext.jsx';
import { Toggle } from '../ui/Toggle.jsx';

export function ScreenHeader({ title, subtitle }) {
  return (
    <header className="drk-screen__head">
      <h2 className="drk-screen__title">{title}</h2>
      {subtitle && <p className="drk-screen__sub">{subtitle}</p>}
    </header>
  );
}

export function Field({ label, htmlFor, off = false, children }) {
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

export function Help({ tone, children }) {
  return <p className={['drk-help', tone && `is-${tone}`].filter(Boolean).join(' ')}>{children}</p>;
}

export function useSettings() {
  const values = useDrake((state) => state.settings.values);
  const trayDown = useDrake((state) => state.settings.trayDown);
  const actions = useLegacyActions();
  return { values, trayDown, save: (patch) => actions.setSettings(patch) };
}

export function SettingToggle({ id, label, help, defaultOn = false, disabled = false }) {
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
