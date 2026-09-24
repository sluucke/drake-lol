import { useState } from 'react';
import { HASHTAG } from '../../../ui/assets.js';
import { useT } from '../../i18n/I18nProvider.jsx';
import { useLegacyActions } from '../../shell/LegacyActions.jsx';
import { useDrakeStore } from '../../store/StoreContext.jsx';
import { Button } from '../../ui/Button.jsx';
import { Card } from '../../ui/Card.jsx';
import { TextInput } from '../../ui/TextInput.jsx';
import { Help } from '../common.jsx';

export function RiotIdTab() {
  const t = useT();
  const store = useDrakeStore();
  const actions = useLegacyActions();
  const [name, setName] = useState('');
  const [tag, setTag] = useState('');
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    const result = await actions.saveRiotId(`${name}#${tag}`);
    setSaving(false);
    setName('');
    setTag('');
    store
      .getState()
      .setStatusLine(result.ok ? { text: t('screens.profile.applied'), tone: 'good' } : { text: result.reason, tone: 'bad' });
  }

  return (
    <Card>
      <Help>{t('screens.profile.riotHelp')}</Help>
      <div className="drk-riot-id">
        <TextInput value={name} ariaLabel={t('screens.profile.riotName')} placeholder={t('screens.profile.riotName')} onChange={setName} />
        <img className="drk-riot-id__hash" src={HASHTAG} alt="#" />
        <TextInput
          value={tag}
          maxLength={5}
          ariaLabel={t('screens.profile.riotTag')}
          placeholder={t('screens.profile.riotTag')}
          onChange={setTag}
        />
      </div>
      <div className="drk-actions">
        <span className="drk-actions__spacer" />
        <Button disabled={saving} onClick={save}>
          {t('screens.profile.saveRiotId')}
        </Button>
      </div>
    </Card>
  );
}
