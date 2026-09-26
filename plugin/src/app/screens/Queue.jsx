import { useEffect, useRef, useState } from 'react';
import { PROVIDERS } from '../../features/reveal.js';
import { estimateRevealDurationMs, recommendFetchConcurrency } from '../../features/teamRevealStats.js';
import { useT } from '../i18n/I18nProvider.jsx';
import { useLegacyActions } from '../shell/LegacyActions.jsx';
import { useDrake, useDrakeStore } from '../store/StoreContext.jsx';
import { Button } from '../ui/Button.jsx';
import { Card } from '../ui/Card.jsx';
import { Segmented } from '../ui/Segmented.jsx';
import { Select } from '../ui/Select.jsx';
import { TextInput } from '../ui/TextInput.jsx';
import { Field, Help, ScreenHeader, SettingToggle, useSettings } from './common.jsx';

const SAMPLE_SIZES = [20, 50, 100];
const CONCURRENCIES = [1, 2, 3, 5];
const POOLS = ['ranked_both', 'current_queue', 'any'];
const DODGE_LABELS = { idle: 'dodgeButton', busy: 'dodging', done: 'dodged', failed: 'dodgeFailed' };

function RevealSelect({ label, value, options, disabled, onChange }) {
  return (
    <div className="drk-field__row">
      <span className="drk-field__label">{label}</span>
      <Select value={value} options={options} disabled={disabled} ariaLabel={label} onChange={onChange} />
    </div>
  );
}

export function QueueScreen() {
  const t = useT();
  const store = useDrakeStore();
  const actions = useLegacyActions();
  const { values, trayDown, save } = useSettings();
  const timing = useDrake((state) => state.session.revealTiming);
  const [provider, setProvider] = useState('porofessor');
  const [revealing, setRevealing] = useState(false);
  const [dodge, setDodge] = useState('idle');
  const savedMessage = values.queue_auto_message || '';
  const [message, setMessage] = useState(savedMessage);
  const timerRef = useRef(null);

  useEffect(() => setMessage(savedMessage), [savedMessage]);
  useEffect(() => () => clearTimeout(timerRef.current), []);

  const inClient = !!values.queue_team_reveal_in_client;
  const optionsDisabled = trayDown || !inClient;
  const sampleSize = Number(values.queue_team_reveal_sample_size) || 50;
  const recentPool = values.queue_team_reveal_recent_pool || 'ranked_both';
  const last5Pool = values.queue_team_reveal_last5_pool || 'current_queue';
  const concurrency = Number(values.queue_team_reveal_fetch_concurrency) || 1;
  const lastMs = timing?.lastMs || 0;
  const lastConcurrency = timing?.lastConcurrency || concurrency;
  const recommended = recommendFetchConcurrency({ lastMs, lastConcurrency });
  const estimateSeconds = Math.max(1, Math.round(estimateRevealDurationMs({ concurrency, lastMs, lastConcurrency }) / 1000));

  const poolOptions = POOLS.map((id) => ({ value: id, label: t(`screens.queue.pool.${id}`) }));
  const numberOptions = (list) => list.map((n) => ({ value: n, label: String(n) }));

  async function onReveal() {
    setRevealing(true);
    const result = await actions.revealLobby(provider);
    setRevealing(false);
    store
      .getState()
      .setStatusLine(
        result.ok
          ? { text: t('screens.queue.lookingUp', { count: result.count }), tone: 'good' }
          : { text: result.reason, tone: 'bad' },
      );
  }

  async function onDodge() {
    if (dodge === 'busy') return;
    setDodge('busy');
    const result = await actions.dodge();
    if (result?.busy) {
      setDodge('idle');
      return;
    }
    setDodge(result?.ok ? 'done' : 'failed');
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setDodge('idle'), 2500);
  }

  return (
    <div className="drk-screen__stack">
      <ScreenHeader title={t('screens.queue.title')} subtitle={t('screens.queue.subtitle')} />

      <Card title={t('screens.queue.revealTitle')}>
        <Help>{t('screens.queue.revealHelp')}</Help>
        <div className="drk-actions">
          <Segmented
            options={PROVIDERS.map((p) => ({ value: p.id, label: p.label }))}
            value={provider}
            ariaLabel={t('screens.queue.provider')}
            onChange={setProvider}
          />
          <span className="drk-actions__spacer" />
          <Button disabled={revealing} onClick={onReveal}>
            {t('screens.queue.revealButton')}
          </Button>
        </div>
      </Card>

      <Card>
        <SettingToggle id="queue_team_reveal_in_client" label={t('screens.queue.inClient')} help={t('screens.queue.inClientHelp')} />
        <Field off={!inClient}>
          <RevealSelect
            label={t('screens.queue.sampleSize')}
            value={sampleSize}
            options={numberOptions(SAMPLE_SIZES)}
            disabled={optionsDisabled}
            onChange={(next) => save({ queue_team_reveal_sample_size: Number(next) })}
          />
          <RevealSelect
            label={t('screens.queue.recentPool')}
            value={recentPool}
            options={poolOptions}
            disabled={optionsDisabled}
            onChange={(next) => save({ queue_team_reveal_recent_pool: next })}
          />
          <RevealSelect
            label={t('screens.queue.last5Pool')}
            value={last5Pool}
            options={poolOptions}
            disabled={optionsDisabled}
            onChange={(next) => save({ queue_team_reveal_last5_pool: next })}
          />
          <RevealSelect
            label={t('screens.queue.concurrency')}
            value={concurrency}
            options={numberOptions(CONCURRENCIES)}
            disabled={optionsDisabled}
            onChange={(next) => save({ queue_team_reveal_fetch_concurrency: Number(next) })}
          />
          {(recentPool === 'current_queue' || last5Pool === 'current_queue') && <Help>{t('screens.queue.currentQueueWarn')}</Help>}
          {concurrency >= 3 && <Help tone="warn">{t('screens.queue.concurrencyWarn')}</Help>}
          {lastMs > 0 && (
            <>
              <Help>{t('screens.queue.estimate', { seconds: estimateSeconds })}</Help>
              <Help tone="info">{t('screens.queue.recommend', { count: recommended })}</Help>
            </>
          )}
          {optionsDisabled && <Help>{t('screens.queue.optionsDisabled')}</Help>}
        </Field>
      </Card>

      <Card title={t('screens.queue.dodgeTitle')}>
        <Help>{t('screens.queue.dodgeHelp')}</Help>
        <SettingToggle
          id="queue_dodge_in_client"
          label={t('screens.queue.dodgeToggle')}
          help={t('screens.queue.dodgeToggleHelp')}
          defaultOn
        />
        <div className="drk-actions">
          <Button variant="danger" disabled={dodge === 'busy'} onClick={onDodge}>
            {t(`screens.queue.${DODGE_LABELS[dodge]}`)}
          </Button>
        </div>
      </Card>

      <Card>
        <SettingToggle id="queue_show_map_side" label={t('screens.queue.mapSide')} defaultOn />
        <SettingToggle id="queue_mute_all_in_client" label={t('screens.queue.muteAll')} />
        <Field label={t('screens.queue.autoMessage')} htmlFor="queue-auto-message">
          <TextInput
            id="queue-auto-message"
            value={message}
            placeholder={t('screens.queue.autoMessagePlaceholder')}
            disabled={trayDown}
            ariaLabel={t('screens.queue.autoMessage')}
            onChange={setMessage}
            onCommit={(next) => {
              if (next !== savedMessage) save({ queue_auto_message: next });
            }}
          />
        </Field>
      </Card>
    </div>
  );
}
