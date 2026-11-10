import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import type { ActionResult } from '../../../features/presence';
import { CRYSTALS, DIVISIONS, QUEUES, TIERS } from '../../../features/presence';
import { RANK_ICONS } from '../../../ui/assets';
import { SFX } from '../../../ui/sfx';
import { useSfx } from '../../hooks/useSfx';
import { useT } from '../../i18n/I18nProvider';
import { useLegacyActions } from '../../shell/LegacyActions';
import type { ProfileRankDraft } from '../../store/sessionSlice';
import { useDrake, useDrakeStore } from '../../store/StoreContext';
import { Button } from '../../ui/Button';
import { Card } from '../../ui/Card';
import { Select } from '../../ui/Select';
import { Help } from '../common';

const RANK_ICON_BY_TIER: Partial<Record<string, string>> = RANK_ICONS;

function useRunner() {
  const t = useT();
  const store = useDrakeStore();
  const [busy, setBusy] = useState('');
  const run = async (id: string, action: () => Promise<ActionResult>, okKey: string) => {
    setBusy(id);
    const result = await action();
    setBusy('');
    store.getState().setStatusLine(result.ok ? { text: t(okKey), tone: 'good' } : { text: result.reason ?? '', tone: 'bad' });
  };
  return { busy, run };
}

interface RowProps {
  label: ReactNode;
  children?: ReactNode;
}

function Row({ label, children }: RowProps) {
  return (
    <div className="drk-field__row">
      <span className="drk-field__label">{label}</span>
      {children}
    </div>
  );
}

export function RankTab() {
  const t = useT();
  const sfx = useSfx();
  const actions = useLegacyActions();
  const synced = useDrake((state) => state.session.profileRank);
  const [draft, setDraft] = useState<ProfileRankDraft>(synced);
  const { busy, run } = useRunner();
  const syncedKey = `${synced.tier}|${synced.division}|${synced.queue}|${synced.crystal}`;

  useEffect(() => setDraft(synced), [syncedKey]);

  const tierLabel = (tier: string) => t(`ranks.tiers.${tier}`);

  return (
    <div className="drk-screen__stack">
      <Card>
        <div className="drk-rank-grid">
          {TIERS.map((tier) => {
            const on = draft.tier === tier;
            return (
              <button
                key={tier}
                type="button"
                className={['drk-rank', on && 'is-on'].filter(Boolean).join(' ')}
                aria-pressed={on}
                aria-label={tierLabel(tier)}
                onMouseEnter={() => sfx.play(SFX.tileHover)}
                onClick={() => {
                  sfx.play(SFX.tile);
                  setDraft({ ...draft, tier });
                }}
              >
                <img src={RANK_ICON_BY_TIER[tier] || RANK_ICONS.UNRANKED} alt="" />
                <span>{tierLabel(tier)}</span>
              </button>
            );
          })}
        </div>
        <Row label={t('screens.profile.division')}>
          <Select
            value={draft.division}
            options={DIVISIONS.map((d) => ({ value: d, label: d }))}
            ariaLabel={t('screens.profile.division')}
            onChange={(division) => setDraft({ ...draft, division })}
          />
        </Row>
        <Row label={t('screens.profile.queue')}>
          <Select
            value={draft.queue}
            options={QUEUES.map((q) => ({ value: q.id, label: t(`ranks.queues.${q.id}`) }))}
            ariaLabel={t('screens.profile.queue')}
            onChange={(queue) => setDraft({ ...draft, queue })}
          />
        </Row>
        <Row label={t('screens.profile.crystal')}>
          <Select
            value={draft.crystal}
            options={CRYSTALS.map((c) => ({ value: c, label: tierLabel(c) }))}
            ariaLabel={t('screens.profile.crystal')}
            onChange={(crystal) => setDraft({ ...draft, crystal })}
          />
        </Row>
        <div className="drk-actions">
          <Help>{t('screens.profile.rankHelp')}</Help>
          <span className="drk-actions__spacer" />
          <Button
            variant="secondary"
            disabled={busy === 'reset'}
            onClick={() => run('reset', () => actions.resetProfileRank(), 'screens.profile.applied')}
          >
            {t('screens.profile.reset')}
          </Button>
          <Button
            disabled={busy === 'apply'}
            onClick={() => run('apply', () => actions.applyProfileRank(draft), 'screens.profile.applied')}
          >
            {t('screens.profile.apply')}
          </Button>
        </div>
      </Card>
      <Card title={t('screens.profile.badgesTitle')}>
        <Help>{t('screens.profile.badgesHelp')}</Help>
        <div className="drk-actions">
          <Button
            variant="secondary"
            disabled={busy === 'badges-remove'}
            onClick={() => run('badges-remove', () => actions.removeBadges(), 'screens.profile.badgesRemoved')}
          >
            {t('screens.profile.removeBadges')}
          </Button>
          <Button
            disabled={busy === 'badges-clone'}
            onClick={() => run('badges-clone', () => actions.cloneBadge(), 'screens.profile.badgeCloned')}
          >
            {t('screens.profile.cloneBadge')}
          </Button>
        </div>
      </Card>
    </div>
  );
}
