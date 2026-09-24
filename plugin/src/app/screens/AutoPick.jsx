import { normalizeAutoPickByRole, toggleAutoPickChampion } from '../../features/autoPickRoles.js';
import { searchChampions } from '../../features/champions.js';
import { useT } from '../i18n/I18nProvider.jsx';
import { useDrake, useDrakeStore } from '../store/StoreContext.jsx';
import { Card } from '../ui/Card.jsx';
import { ChampionGrid } from './champions/ChampionGrid.jsx';
import { ChampionSearch } from './champions/ChampionSearch.jsx';
import { PickSummary } from './champions/PickSummary.jsx';
import { RoleTabs } from './champions/RoleTabs.jsx';
import { Field, ScreenHeader, SettingToggle, useSettings } from './common.jsx';

export function AutoPickScreen() {
  const t = useT();
  const store = useDrakeStore();
  const { values, save } = useSettings();
  const champions = useDrake((state) => state.session.champions);
  const role = useDrake((state) => state.ui.autoPickRole);
  const query = useDrake((state) => state.ui.championQueries['auto-pick']);
  const enabled = !!values.auto_pick;
  const byRole = normalizeAutoPickByRole(values.auto_pick_by_role);
  const pickIds = byRole[role] || [];
  const counts = Object.fromEntries(Object.entries(byRole).map(([key, ids]) => [key, ids.length]));
  const slots = new Map(pickIds.map((id, index) => [id, index + 1]));
  const filtered = searchChampions(champions, query);

  const toggle = (id) => {
    const next = toggleAutoPickChampion(values, role, id);
    if (next !== values) save({ auto_pick_by_role: next.auto_pick_by_role });
  };

  const setQuery = (text) => {
    const { championQueries } = store.getState().ui;
    store.getState().setUi({ championQueries: { ...championQueries, 'auto-pick': text } });
  };

  return (
    <div className="drk-screen__stack">
      <ScreenHeader title={t('screens.autoPick.title')} subtitle={t('screens.autoPick.subtitle')} />
      <Card>
        <SettingToggle id="auto_pick" label={t('screens.autoPick.toggle')} />
        <SettingToggle
          id="insta_lock"
          label={t('screens.autoPick.instaLock')}
          help={t('screens.autoPick.instaLockHelp')}
          disabled={!enabled}
        />
      </Card>
      <Card>
        <Field off={!enabled}>
          <RoleTabs
            value={role}
            counts={counts}
            ariaLabel={t('screens.autoPick.rolesLabel')}
            onChange={(next) => store.getState().setUi({ autoPickRole: next })}
          />
          <div className="drk-pick-head">
            <span className="drk-field__label">{t(`roles.${role}`)}</span>
            <span className="drk-pick-head__value">
              {pickIds.length ? t('champions.selected', { count: pickIds.length }) : t('champions.noneChosen')}
            </span>
          </div>
          <PickSummary ids={pickIds} champions={champions} numbered emptyLabel={t('screens.autoPick.empty')} onRemove={toggle} />
          <ChampionSearch value={query} onChange={setQuery} />
          <ChampionGrid
            champions={filtered}
            slots={slots}
            compact
            onPick={toggle}
            emptyLabel={champions.length ? t('champions.noMatch') : t('champions.unavailable')}
          />
        </Field>
      </Card>
    </div>
  );
}
