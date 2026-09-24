import { useEffect, useRef, useState } from 'react';
import { AVAILABILITIES } from '../../features/presence.js';
import { autoSize, markManual } from '../../ui/autoSize.js';
import { useT } from '../i18n/I18nProvider.jsx';
import { useLegacyActions } from '../shell/LegacyActions.jsx';
import { useDrake, useDrakeStore } from '../store/StoreContext.jsx';
import { Button } from '../ui/Button.jsx';
import { Card } from '../ui/Card.jsx';
import { Select } from '../ui/Select.jsx';
import { Field, Help, ScreenHeader, useSettings } from './common.jsx';

const GRIP = 16;

export function describeStatusText(text, t) {
  const lines = text === '' ? 0 : text.split('\n').length;
  return t('screens.status.count', { chars: text.length, count: lines });
}

export function StatusScreen() {
  const t = useT();
  const store = useDrakeStore();
  const actions = useLegacyActions();
  const { values, save } = useSettings();
  const remote = useDrake((state) => state.session.statusText);
  const [draft, setDraft] = useState(remote);
  const [saving, setSaving] = useState(false);
  const boxRef = useRef(null);

  useEffect(() => setDraft(remote), [remote]);

  useEffect(() => {
    autoSize(boxRef.current, { min: 120, max: Math.round(window.innerHeight * 0.46) });
  }, [draft]);

  const options = [
    { value: '', label: t('screens.status.clientDefault') },
    ...AVAILABILITIES.map((entry) => ({ value: entry.id, label: t(`screens.status.availability.${entry.id}`) })),
  ];
  const summary = describeStatusText(draft, t);

  async function onSave() {
    setSaving(true);
    const result = await actions.saveStatus(draft);
    setSaving(false);
    store
      .getState()
      .setStatusLine(
        result.ok
          ? { text: t('screens.status.saved', { summary }), tone: 'good' }
          : { text: t('screens.status.saveFailed', { reason: result.reason }), tone: 'bad' },
      );
  }

  return (
    <div className="drk-screen__stack">
      <ScreenHeader title={t('screens.status.title')} subtitle={t('screens.status.subtitle')} />
      <Card>
        <Field label={t('screens.status.presence')}>
          <Select
            value={values.presence_availability || ''}
            options={options}
            ariaLabel={t('screens.status.presence')}
            onChange={(next) => {
              if (next === '') return;
              save({ presence_availability: next });
            }}
          />
          <Help>{t('screens.status.presenceHelp')}</Help>
        </Field>
      </Card>
      <Card>
        <textarea
          ref={boxRef}
          className="drk-status-box"
          spellCheck={false}
          aria-label={t('screens.status.title')}
          placeholder={t('screens.status.placeholder')}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onMouseDown={(event) => {
            const box = event.currentTarget;
            const { offsetX, offsetY } = event.nativeEvent;
            if (offsetX > box.clientWidth - GRIP && offsetY > box.clientHeight - GRIP) markManual(box);
          }}
        />
        <div className="drk-actions">
          <span className="drk-status-count" aria-live="polite">
            {summary}
          </span>
          <span className="drk-actions__spacer" />
          <Button variant="secondary" onClick={() => setDraft('')}>
            {t('screens.status.clear')}
          </Button>
          <Button disabled={saving} onClick={onSave}>
            {t('screens.status.save')}
          </Button>
        </div>
      </Card>
    </div>
  );
}
