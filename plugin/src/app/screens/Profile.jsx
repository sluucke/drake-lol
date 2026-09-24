import { useState } from 'react';
import { useT } from '../i18n/I18nProvider.jsx';
import { useLegacyActions } from '../shell/LegacyActions.jsx';
import { useDrake } from '../store/StoreContext.jsx';
import { Tabs } from '../ui/Tabs.jsx';
import { ScreenHeader } from './common.jsx';
import { BannerTab } from './profile/BannerTab.jsx';
import { RankTab } from './profile/RankTab.jsx';
import { RiotIdTab } from './profile/RiotIdTab.jsx';

const TAB_IDS = ['rank', 'banner', 'riot-id'];

export function ProfileScreen() {
  const t = useT();
  const actions = useLegacyActions();
  const tab = useDrake((state) => state.session.profileTab);
  const [loading, setLoading] = useState(false);

  async function change(next) {
    setLoading(true);
    await actions.selectProfileTab(next);
    setLoading(false);
  }

  return (
    <div className="drk-screen__stack">
      <ScreenHeader title={t('screens.profile.title')} subtitle={t('screens.profile.subtitle')} />
      <Tabs tabs={TAB_IDS.map((id) => ({ id, label: t(`screens.profile.tabs.${id}`) }))} value={tab} onChange={change} />
      {tab === 'banner' ? <BannerTab loading={loading} /> : tab === 'riot-id' ? <RiotIdTab /> : <RankTab />}
    </div>
  );
}
