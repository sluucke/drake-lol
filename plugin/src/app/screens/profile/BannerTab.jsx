import { useMemo } from 'react';
import { searchSkins } from '../../../features/skins.js';
import { useT } from '../../i18n/I18nProvider.jsx';
import { useLegacyActions } from '../../shell/LegacyActions.jsx';
import { useDrake, useDrakeStore } from '../../store/StoreContext.jsx';
import { Card } from '../../ui/Card.jsx';
import { Skeleton } from '../../ui/Skeleton.jsx';
import { TextInput } from '../../ui/TextInput.jsx';
import { Help } from '../common.jsx';
import { SkinGrid } from './SkinGrid.jsx';

export function BannerTab({ loading = false }) {
  const t = useT();
  const store = useDrakeStore();
  const actions = useLegacyActions();
  const skins = useDrake((state) => state.session.skins);
  const selectedId = useDrake((state) => state.session.backgroundId);
  const query = useDrake((state) => state.ui.skinQuery);
  const filtered = useMemo(() => searchSkins(skins, query), [skins, query]);

  async function pick(id) {
    const result = await actions.setBackground(id);
    store
      .getState()
      .setStatusLine(
        result.ok ? { text: t('screens.profile.backgroundSet'), tone: 'good' } : { text: result.reason, tone: 'bad' },
      );
  }

  return (
    <Card>
      <TextInput
        type="search"
        value={query}
        placeholder={t('screens.profile.skinSearch', { count: filtered.length })}
        ariaLabel={t('screens.profile.skinSearch', { count: filtered.length })}
        onChange={(text) => store.getState().setUi({ skinQuery: text })}
      />
      {loading && skins.length === 0 ? (
        <div className="drk-skin-grid">
          {Array.from({ length: 15 }, (_, i) => (
            <Skeleton key={i} height={84} />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <Help>{t('screens.profile.noSkins')}</Help>
      ) : (
        <SkinGrid skins={filtered} selectedId={selectedId} onPick={pick} />
      )}
    </Card>
  );
}
