import { useEffect, useState } from 'react';
import { useFormat, useT } from '../i18n/I18nProvider.jsx';
import { Card } from '../ui/Card.jsx';
import { Slider } from '../ui/Slider.jsx';
import { Field, Help, ScreenHeader, SettingToggle, useSettings } from './common.jsx';

export const AUTO_ACCEPT_MAX_DELAY_MS = 8000;

export function useDelayLabel() {
  const t = useT();
  const format = useFormat();
  return (ms) =>
    ms === 0
      ? t('screens.autoAccept.instant')
      : t('screens.autoAccept.seconds', {
          value: format.number(ms / 1000, { minimumFractionDigits: 1, maximumFractionDigits: 1 }),
        });
}

export function AutoAcceptScreen() {
  const t = useT();
  const label = useDelayLabel();
  const { values, trayDown, save } = useSettings();
  const enabled = !!values.auto_accept;
  const saved = values.auto_accept_delay_ms || 0;
  const [delay, setDelay] = useState(saved);

  useEffect(() => setDelay(saved), [saved]);

  return (
    <div className="drk-screen__stack">
      <ScreenHeader title={t('screens.autoAccept.title')} subtitle={t('screens.autoAccept.subtitle')} />
      <Card>
        <SettingToggle id="auto_accept" label={t('screens.autoAccept.toggle')} />
        <Field label={t('screens.autoAccept.delayLabel')} htmlFor="auto-accept-delay" off={!enabled}>
          <Slider
            id="auto-accept-delay"
            value={delay}
            min={0}
            max={AUTO_ACCEPT_MAX_DELAY_MS}
            step={500}
            disabled={trayDown || !enabled}
            ariaLabel={t('screens.autoAccept.delayLabel')}
            format={label}
            onChange={setDelay}
            onCommit={(next) => {
              if (next !== saved) save({ auto_accept_delay_ms: next });
            }}
          />
          <Help>{t('screens.autoAccept.delayHelp')}</Help>
        </Field>
      </Card>
    </div>
  );
}
