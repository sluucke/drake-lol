import { iconUrl } from '../../../features/champions.js';
import { OPGG_REGIONS, OPGG_TIERS } from '../../../features/opggApi.js';
import { RANK_ICONS } from '../../../ui/assets.js';
import { roleIconUrl, roleLabel } from '../../../ui/roleIcons.js';
import { useFormat, useT } from '../../i18n/I18nProvider.jsx';
import { useLegacyActions } from '../../shell/LegacyActions.jsx';
import { useDrake } from '../../store/StoreContext.jsx';
import { Select } from '../../ui/Select.jsx';
import { pct, rankIconKey, WinRate } from './format.jsx';

const ROLE_KEYS = new Set(['TOP', 'JUNGLE', 'MIDDLE', 'BOTTOM', 'UTILITY']);

export function BuildHeader() {
  const t = useT();
  const format = useFormat();
  const actions = useLegacyActions();
  const state = useDrake((s) => s.build);
  const position = String(state.position || '').toUpperCase();
  const roleIcon = position ? roleIconUrl(position) : '';
  const role = ROLE_KEYS.has(position) ? t(`roles.${position}`) : roleLabel(position) || position;
  const stats = state.build?.stats;

  const tierOptions = OPGG_TIERS.map((tier) => ({
    value: tier.value,
    label: t(`overlays.build.tiers.${tier.value}`),
    icon: RANK_ICONS[rankIconKey(tier.value)],
  }));
  const regionOptions = OPGG_REGIONS.map((region) => ({
    value: region.value,
    label: region.value === 'global' ? t('overlays.build.globalRegion') : region.label,
  }));

  return (
    <header className="drk-build-header">
      <div className="drk-build-identity">
        {state.championId ? <img className="drk-build-champ" src={iconUrl(state.championId)} alt={state.championName} /> : null}
        <div className="drk-build-identity__meta">
          <div className="drk-build-identity__name">{state.championName || t('overlays.build.champion')}</div>
          <div className="drk-build-identity__sub">
            {position && (
              <span className="drk-build-role">
                {roleIcon && <img src={roleIcon} alt="" />}
                <span>{role}</span>
              </span>
            )}
            <span className="drk-build-tag">{t(`overlays.build.modes.${state.mode === 'aram' ? 'aram' : 'ranked'}`)}</span>
            {state.patch && <span className="drk-build-patch">{t('overlays.build.patch', { patch: state.patch })}</span>}
          </div>
        </div>
      </div>
      <div className="drk-build-filters">
        <label className="drk-build-filter">
          <span>{t('overlays.build.rank')}</span>
          <Select value={state.tier} options={tierOptions} ariaLabel={t('overlays.build.rank')} onChange={(v) => actions.setBuildTier(v)} />
        </label>
        <label className="drk-build-filter">
          <span>{t('overlays.build.region')}</span>
          <Select value={state.region} options={regionOptions} ariaLabel={t('overlays.build.region')} onChange={(v) => actions.setBuildRegion(v)} />
        </label>
      </div>
      {stats && (
        <div className="drk-build-stats">
          <span>
            <WinRate value={stats.winRate} /> {t('overlays.build.stats.win')}
          </span>
          <span>
            <b>{pct(stats.pickRate)}</b> {t('overlays.build.stats.pick')}
          </span>
          <span>
            <b>{pct(stats.banRate)}</b> {t('overlays.build.stats.ban')}
          </span>
          <span>
            <b>{stats.kda ?? '—'}</b> {t('overlays.build.stats.kda')}
          </span>
          <span>
            <b>{format.number(stats.play || 0)}</b> {t('overlays.build.stats.games')}
          </span>
        </div>
      )}
    </header>
  );
}
