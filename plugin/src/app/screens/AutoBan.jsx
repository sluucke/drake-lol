import { searchChampions } from '../../features/champions.js';
import { useT } from '../i18n/I18nProvider.jsx';
import { useDrake, useDrakeStore } from '../store/StoreContext.jsx';
import { Card } from '../ui/Card.jsx';
import { ChampionGrid } from './champions/ChampionGrid.jsx';
import { ChampionSearch } from './champions/ChampionSearch.jsx';
import { PickSummary } from './champions/PickSummary.jsx';
import { Field, ScreenHeader, SettingToggle, useSettings } from './common.jsx';

export function AutoBanScreen() {
  const t = useT();
  const store = useDrakeStore();
  const { values, save } = useSettings();
  const champions = useDrake((state) => state.session.champions);
  const query = useDrake((state) => state.ui.championQueries['auto-ban']);
  const enabled = !!values.auto_ban;
  const banId = Number(values.auto_ban_champion_id) || 0;
  const ids = banId ? [banId] : [];
  const filtered = searchChampions(champions, query);

  const setQuery = (text) => {
    const { championQueries } = store.getState().ui;
    store.getState().setUi({ championQueries: { ...championQueries, 'auto-ban': text } });
  };

  return (
    <div className="drk-screen__stack">
      <ScreenHeader title={t('screens.autoBan.title')} subtitle={t('screens.autoBan.subtitle')} />
      <Card>
        <SettingToggle id="auto_ban" label={t('screens.autoBan.toggle')} help={t('screens.autoBan.toggleHelp')} />
      </Card>
      <Card>
        <Field off={!enabled}>
          <div className="drk-pick-head">
            <span className="drk-field__label">{t('screens.autoBan.champion')}</span>
            <span className="drk-pick-head__value">
              {banId ? t('champions.selected', { count: 1 }) : t('champions.noneChosen')}
            </span>
          </div>
          <PickSummary
            ids={ids}
            champions={champions}
            emptyLabel={t('screens.autoBan.empty')}
            onRemove={() => save({ auto_ban_champion_id: 0 })}
          />
          <ChampionSearch value={query} onChange={setQuery} />
          <ChampionGrid
            champions={filtered}
            slots={new Map(ids.map((id) => [id, true]))}
            onPick={(id) => save({ auto_ban_champion_id: banId === id ? 0 : id })}
            emptyLabel={champions.length ? t('champions.noMatch') : t('champions.unavailable')}
          />
        </Field>
      </Card>
    </div>
  );
}
