import type { BuildActionStatus } from '../../store/buildSlice';

export type PercentValue = number | string | null | undefined;

export function pct(value: PercentValue): string {
  if (value == null || Number.isNaN(Number(value))) return '—';
  const num = Number(value);
  return Number.isInteger(num) ? `${num}%` : `${Math.round(num * 10) / 10}%`;
}

export type WinRateTone = '' | 'positive' | 'negative';

export function wrTone(winRate: PercentValue): WinRateTone {
  if (winRate == null || Number.isNaN(Number(winRate))) return '';
  return Number(winRate) >= 50 ? 'positive' : 'negative';
}

const RANK_KEYS = ['challenger', 'grandmaster', 'master', 'diamond', 'emerald', 'platinum', 'gold', 'silver', 'bronze', 'iron'] as const;

export type RankIconKey = Uppercase<(typeof RANK_KEYS)[number]> | 'UNRANKED';

export function rankIconKey(tier: string | null | undefined): RankIconKey {
  const raw = String(tier || '').trim().toLowerCase();
  const hit = RANK_KEYS.find((key) => raw.includes(key));
  return hit ? (hit.toUpperCase() as Uppercase<typeof hit>) : 'UNRANKED';
}

export function statusKey(status: BuildActionStatus, idleKey: string): string {
  if (status === 'applying') return 'overlays.build.actions.applying';
  if (status === 'applied') return 'overlays.build.actions.applied';
  if (status === 'failed') return 'overlays.build.actions.failed';
  return idleKey;
}

export interface WinRateProps {
  value: PercentValue;
  suffix?: string;
}

export function WinRate({ value, suffix = '' }: WinRateProps) {
  const tone = wrTone(value);
  return <span className={['drk-build-wr', tone && `is-${tone}`].filter(Boolean).join(' ')}>{`${pct(value)}${suffix}`}</span>;
}
