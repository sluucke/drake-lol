export function pct(value) {
  if (value == null || Number.isNaN(Number(value))) return '—';
  const num = Number(value);
  return Number.isInteger(num) ? `${num}%` : `${Math.round(num * 10) / 10}%`;
}

export function wrTone(winRate) {
  if (winRate == null || Number.isNaN(Number(winRate))) return '';
  return Number(winRate) >= 50 ? 'positive' : 'negative';
}

const RANK_KEYS = ['challenger', 'grandmaster', 'master', 'diamond', 'emerald', 'platinum', 'gold', 'silver', 'bronze', 'iron'];

export function rankIconKey(tier) {
  const raw = String(tier || '').trim().toLowerCase();
  const hit = RANK_KEYS.find((key) => raw.includes(key));
  return hit ? hit.toUpperCase() : 'UNRANKED';
}

export function statusKey(status, idleKey) {
  if (status === 'applying') return 'overlays.build.actions.applying';
  if (status === 'applied') return 'overlays.build.actions.applied';
  if (status === 'failed') return 'overlays.build.actions.failed';
  return idleKey;
}

export function WinRate({ value, suffix = '' }) {
  const tone = wrTone(value);
  return <span className={['drk-build-wr', tone && `is-${tone}`].filter(Boolean).join(' ')}>{`${pct(value)}${suffix}`}</span>;
}
