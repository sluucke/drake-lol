import { motion } from 'motion/react';
import { iconUrl } from '../../../features/champions.js';
import { RANK_ICONS } from '../../../ui/assets.js';
import { roleIconUrl, roleLabel } from '../../../ui/roleIcons.js';
import { useT } from '../../i18n/I18nProvider.jsx';
import { Skeleton } from '../../ui/Skeleton.jsx';
import { DURATION, staggerDelay } from '../../ui/motion.js';
import { formatRank, winRate } from './format.js';

const ROLE_KEYS = new Set(['TOP', 'JUNGLE', 'MIDDLE', 'BOTTOM', 'UTILITY']);

function RankBlock({ label, rank }) {
  const t = useT();
  const tier = String(rank?.tier || '').toUpperCase();
  return (
    <div className="drk-scout-rank">
      <img className="drk-scout-rank__icon" src={RANK_ICONS[tier] || RANK_ICONS.UNRANKED} alt="" />
      <div className="drk-scout-rank__meta">
        <span className="drk-scout-rank__queue">{label}</span>
        <span className="drk-scout-rank__tier">{formatRank(rank, t)}</span>
      </div>
    </div>
  );
}

function WinLoss({ wins, losses, rate }) {
  const t = useT();
  return (
    <span className="drk-wl">
      <span className="is-win">{t('overlays.scouting.winsShort', { count: wins || 0 })}</span>/
      <span className="is-loss">{t('overlays.scouting.lossesShort', { count: losses || 0 })}</span>
      {` · ${winRate(wins, losses, rate)}%`}
    </span>
  );
}

function ChampChip({ id, name, detail }) {
  const t = useT();
  return (
    <span className="drk-scout-champ">
      <img className="drk-scout-champ__icon" src={iconUrl(id)} alt="" />
      <span>{[name || t('overlays.scouting.unknown'), detail].filter(Boolean).join(' · ')}</span>
    </span>
  );
}

function Row({ label, children }) {
  return (
    <div className="drk-scout-card__row">
      <dt className="drk-scout-card__row-label">{label}</dt>
      <dd className="drk-scout-card__row-value">{children}</dd>
    </div>
  );
}

function RecentGames({ games, pending }) {
  if (pending) {
    return (
      <span className="drk-scout-games" aria-busy="true">
        {Array.from({ length: 5 }, (_, i) => (
          <Skeleton key={i} variant="circle" width={22} />
        ))}
      </span>
    );
  }
  if (!games?.length) return '—';
  return (
    <span className="drk-scout-games">
      {games.map((game, index) => (
        <span
          key={index}
          className={['drk-scout-game', game.win ? 'is-win' : 'is-loss'].join(' ')}
          title={`${game.championName} ${game.kills}/${game.deaths}/${game.assists}`}
        >
          <img src={iconUrl(game.championId)} alt={game.championName} />
          <span className="drk-scout-game__kda">{`${game.kills}/${game.deaths}/${game.assists}`}</span>
        </span>
      ))}
    </span>
  );
}

export function ScoutCard({ row, index = 0 }) {
  const t = useT();
  const pending = !!row.matchesPending;
  const position = String(row.assignedPosition || '').toUpperCase();
  const roleIcon = position ? roleIconUrl(position) : '';
  const roleName = ROLE_KEYS.has(position) ? t(`roles.${position}`) : roleLabel(position);
  const skel = <Skeleton width={88} />;
  const wl = (w, l) => `${t('overlays.scouting.winsShort', { count: w || 0 })}/${t('overlays.scouting.lossesShort', { count: l || 0 })}`;
  const games = (count) => t('overlays.scouting.games', { count });

  const season = row.seasonMostPlayedChampionId ? (
    <ChampChip
      id={row.seasonMostPlayedChampionId}
      name={row.seasonMostPlayedChampionName}
      detail={
        row.seasonMostPlayedCount
          ? [
              games(row.seasonMostPlayedCount),
              wl(row.seasonMostPlayedWins, row.seasonMostPlayedLosses),
              `${winRate(row.seasonMostPlayedWins, row.seasonMostPlayedLosses, row.seasonMostPlayedWinRate)}%`,
            ].join(' · ')
          : ''
      }
    />
  ) : (
    '—'
  );

  return (
    <motion.section
      className={['drk-scout-card', row.isLocalPlayer && 'is-you', pending && 'is-loading'].filter(Boolean).join(' ')}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: staggerDelay(index), duration: DURATION.base }}
    >
      <header className="drk-scout-card__head">
        {roleIcon && <img className="drk-scout-card__role" src={roleIcon} alt="" title={roleName} />}
        <h3 className="drk-scout-card__name">
          {row.riotId || t('overlays.scouting.unknown')}
          {row.isLocalPlayer && <span className="drk-scout-card__you">{` ${t('overlays.scouting.you')}`}</span>}
        </h3>
      </header>
      <div className="drk-scout-card__ranks">
        <RankBlock label={t('overlays.scouting.queues.solo')} rank={row.soloRank} />
        <RankBlock label={t('overlays.scouting.queues.flex')} rank={row.flexRank} />
      </div>
      <dl className="drk-scout-card__rows">
        <Row
          label={
            !pending && row.matchesUsed
              ? t('overlays.scouting.rows.recentWlGames', { count: row.matchesUsed })
              : t('overlays.scouting.rows.recentWl')
          }
        >
          {pending ? skel : <WinLoss wins={row.wins} losses={row.losses} rate={row.winRate} />}
        </Row>
        <Row label={t('overlays.scouting.rows.kda')}>{pending ? skel : String(row.kda ?? '—')}</Row>
        <Row label={t('overlays.scouting.rows.last12h')}>{pending ? skel : wl(row.last12hWins, row.last12hLosses)}</Row>
        {row.pickedChampionId ? (
          <Row label={t('overlays.scouting.rows.picked')}>
            <ChampChip
              id={row.pickedChampionId}
              name={row.pickedChampionName}
              detail={
                row.pickedGames
                  ? `${games(row.pickedGames)} · ${row.pickedWinRate ?? 0}%`
                  : t('overlays.scouting.noGames')
              }
            />
          </Row>
        ) : null}
        <Row label={t('overlays.scouting.rows.seasonMain')}>{pending ? skel : season}</Row>
        <Row label={t('overlays.scouting.rows.last5')}>
          <RecentGames games={row.recentGames} pending={pending} />
        </Row>
      </dl>
    </motion.section>
  );
}
