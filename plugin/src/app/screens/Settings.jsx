import { useState } from 'react';
import { useT } from '../i18n/I18nProvider.jsx';
import { AVAILABLE_LOCALES, LOCALE_NAMES } from '../i18n/locales/index.js';
import { useLegacyActions } from '../shell/LegacyActions.jsx';
import { useDrake, useDrakeStore } from '../store/StoreContext.jsx';
import { Button } from '../ui/Button.jsx';
import { Card } from '../ui/Card.jsx';
import { Select } from '../ui/Select.jsx';
import { Help, ScreenHeader, SettingToggle, useSettings } from './common.jsx';

function UpdateNote({ update, installing, disabled, onInstall }) {
  const t = useT();
  if (update.phase === 'current') return <Help>{t('screens.settings.upToDate')}</Help>;
  if (update.phase === 'available') {
    return (
      <>
        <Help tone="info">{t('screens.settings.available', { version: update.version })}</Help>
        <div className="drk-actions">
          <Button disabled={disabled || installing} onClick={onInstall}>
            {t('screens.settings.install')}
          </Button>
        </div>
      </>
    );
  }
  if (update.phase === 'no_installer') return <Help>{t('screens.settings.noInstaller', { version: update.version })}</Help>;
  if (update.phase === 'error') return <Help tone="warn">{update.message || t('screens.settings.checkFailed')}</Help>;
  return null;
}

function LanguageCard() {
  const t = useT();
  const { values, trayDown, save } = useSettings();
  const clientLocale = useDrake((state) => state.session.locale);
  const value = AVAILABLE_LOCALES.includes(values.ui_language) ? values.ui_language : 'auto';
  const options = [
    { value: 'auto', label: t('screens.settings.languageAuto', { language: LOCALE_NAMES[clientLocale] || clientLocale }) },
    ...AVAILABLE_LOCALES.map((locale) => ({ value: locale, label: LOCALE_NAMES[locale] || locale })),
  ];
  return (
    <Card>
      <div className="drk-field__row">
        <span className="drk-field__label">{t('screens.settings.language')}</span>
        <Select
          value={value}
          options={options}
          disabled={trayDown}
          ariaLabel={t('screens.settings.language')}
          onChange={(next) => save({ ui_language: next })}
        />
      </div>
      <Help>{t('screens.settings.languageHelp')}</Help>
    </Card>
  );
}

export function SettingsScreen() {
  const t = useT();
  const store = useDrakeStore();
  const actions = useLegacyActions();
  const { trayDown } = useSettings();
  const version = useDrake((state) => state.session.appVersion);
  const update = useDrake((state) => state.session.updateUi) || { phase: 'idle' };
  const [installing, setInstalling] = useState(false);
  const [restarting, setRestarting] = useState(false);
  const checking = update.phase === 'checking';

  const say = (text, good) => store.getState().setStatusLine({ text, tone: good ? 'good' : 'bad' });

  async function onInstall() {
    setInstalling(true);
    say(t('screens.settings.downloading'), true);
    const result = await actions.installUpdate();
    if (result.ok && result.installing) {
      say(t('screens.settings.installing'), true);
      return;
    }
    setInstalling(false);
    say(result.ok ? t('screens.settings.alreadyCurrent') : result.reason, result.ok);
  }

  async function onRestart() {
    setRestarting(true);
    const result = await actions.restartClient();
    setRestarting(false);
    say(result.ok ? t('screens.settings.restarting') : result.reason, result.ok);
  }

  return (
    <div className="drk-screen__stack">
      <ScreenHeader title={t('screens.settings.title')} subtitle={t('screens.settings.subtitle')} />

      <Card>
        <SettingToggle id="run_at_startup" label={t('screens.settings.runAtStartup')} help={t('screens.settings.runAtStartupHelp')} />
        <SettingToggle id="auto_reload_on_open" label={t('screens.settings.autoReload')} help={t('screens.settings.autoReloadHelp')} />
        <SettingToggle id="unlock_status_message" label={t('screens.settings.unlockStatus')} help={t('screens.settings.unlockStatusHelp')} />
      </Card>

      <LanguageCard />

      <Card
        title={t('screens.settings.updates')}
        actions={<span className="drk-version">{t('screens.settings.version', { version: version || '?' })}</span>}
      >
        <SettingToggle id="auto_update" label={t('screens.settings.autoUpdate')} help={t('screens.settings.autoUpdateHelp')} defaultOn />
        <div className="drk-actions">
          <Button variant="secondary" disabled={trayDown || checking} onClick={() => actions.checkUpdates()}>
            {checking ? t('screens.settings.checking') : t('screens.settings.checkUpdates')}
          </Button>
        </div>
        <UpdateNote update={update} installing={installing} disabled={trayDown || checking} onInstall={onInstall} />
      </Card>

      <Card title={t('screens.settings.client')}>
        <Help>{t('screens.settings.clientHelp')}</Help>
        <div className="drk-actions">
          <Button variant="secondary" disabled={restarting} onClick={onRestart}>
            {t('screens.settings.restart')}
          </Button>
        </div>
      </Card>
    </div>
  );
}
