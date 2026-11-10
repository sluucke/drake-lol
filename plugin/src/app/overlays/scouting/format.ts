import type { Translate } from '../../i18n/runtime';
import type { ScoutRank } from '../../store/types';

const APEX = new Set(['MASTER', 'GRANDMASTER', 'CHALLENGER']);

export function formatRank(rank: ScoutRank | null | undefined, t: Translate): string {
  const tier = String(rank?.tier || '').toUpperCase();
  if (!rank?.hasRank || !tier || tier === 'NONE') return t('overlays.scouting.unranked');
  let text = t(`ranks.tiers.${tier}`);
  if (!APEX.has(tier) && rank.division) text += ` ${rank.division}`;
  if (rank.lp) text += ` · ${t('overlays.scouting.lp', { lp: rank.lp })}`;
  return text;
}

export function winRate(wins: number | null | undefined, losses: number | null | undefined, rate?: number | null): number {
  if (rate != null) return rate;
  const total = (wins || 0) + (losses || 0);
  return total ? Math.round(((wins || 0) / total) * 100) : 0;
}
