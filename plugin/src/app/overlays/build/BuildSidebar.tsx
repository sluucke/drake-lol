import type { ReactNode } from 'react';
import { iconUrl } from '../../../features/champions';
import { RANK_ICONS } from '../../../ui/assets';
import { SFX } from '../../../ui/sfx';
import { useSfx } from '../../hooks/useSfx';
import { useFormat, useT } from '../../i18n/I18nProvider';
import { useLegacyActions } from '../../shell/LegacyActions';
import { useDrake } from '../../store/StoreContext';
import { Card } from '../../ui/Card';
import type { BuildCounter } from '../../store/types';
import { rankIconKey, WinRate } from './format';

export function TopPlayersCard() {
  const t = useT();
  const sfx = useSfx();
  const format = useFormat();
  const actions = useLegacyActions();
  const state = useDrake((s) => s.build);
  const top = state.topPlayers;

  let body: ReactNode;
  if (top.loading) {
    body = (
      <div className="drk-build-placeholder">
        <span className="drk-build-spinner" aria-hidden="true" />
        {t('overlays.build.loadingPlayers')}
      </div>
    );
  } else if (!top.ok || !top.players.length) {
    body = <p className="drk-help">{top.reason || t('overlays.build.unavailable')}</p>;
  } else {
    body = (
      <div className="drk-toplist">
        {top.players.map((player) => {
          const games = player.played ? format.number(player.played) : '—';
          return (
            <button
              key={player.name}
              type="button"
              className={['drk-toplist__row', state.viewingPlayer === player.name && 'is-active'].filter(Boolean).join(' ')}
              title={t('overlays.build.playerTitle', { tier: player.tier, games })}
              onMouseEnter={() => sfx.play(SFX.hover)}
              onClick={() => {
                sfx.play(SFX.click);
                actions.viewPlayerBuild(player.name, (player.region || 'kr').toLowerCase());
              }}
            >
              <span className="drk-toplist__rank">{`#${player.ranking ?? '—'}`}</span>
              <img src={RANK_ICONS[rankIconKey(player.tier)]} alt="" />
              <span className="drk-toplist__name">{player.name || t('overlays.build.unknown')}</span>
              {player.winRate != null ? <WinRate value={player.winRate} /> : <span>—</span>}
            </button>
          );
        })}
      </div>
    );
  }

  return <Card title={t('overlays.build.cards.topPlayers')}>{body}</Card>;
}

export type CounterTone = 'strong' | 'weak';

interface CounterListProps {
  list: BuildCounter[];
  tone: CounterTone;
}

function CounterList({ list, tone }: CounterListProps) {
  const t = useT();
  const format = useFormat();
  const names = useDrake((s) => s.build.championNames) || {};
  if (!list.length) return <p className="drk-help">{t('overlays.build.empty.matchups')}</p>;
  return list.map((counter) => (
    <div key={counter.championId} className={`drk-counter is-${tone}`}>
      <img src={iconUrl(counter.championId)} alt="" />
      <span>{names[counter.championId] || t('overlays.build.championFallback', { id: counter.championId })}</span>
      <WinRate value={counter.winRate} />
      <span className="drk-counter__play">{format.number(counter.play || 0)}</span>
    </div>
  ));
}

export function MatchupsCard() {
  const t = useT();
  const state = useDrake((s) => s.build);
  const counters = state.build?.counters || { strong: [], weak: [] };
  if (state.mode === 'aram' || (!counters.strong?.length && !counters.weak?.length)) return null;
  return (
    <Card title={t('overlays.build.cards.matchups')}>
      <div className="drk-counters">
        <div>
          <div className="drk-counter-head is-strong">{t('overlays.build.strong')}</div>
          <CounterList list={counters.strong || []} tone="strong" />
        </div>
        <div>
          <div className="drk-counter-head is-weak">{t('overlays.build.weak')}</div>
          <CounterList list={counters.weak || []} tone="weak" />
        </div>
      </div>
    </Card>
  );
}
