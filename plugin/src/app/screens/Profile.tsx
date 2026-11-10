import { useState } from 'react';
import { useT } from '../i18n/I18nProvider';
import { useLegacyActions } from '../shell/LegacyActions';
import { useDrake } from '../store/StoreContext';
import { Tabs } from '../ui/Tabs';
import { ScreenHeader } from './common';
import { BannerTab } from './profile/BannerTab';
import { RankTab } from './profile/RankTab';
import { RiotIdTab } from './profile/RiotIdTab';

const TAB_IDS = ['rank', 'banner', 'riot-id'];

export function ProfileScreen() {
  const t = useT();
  const actions = useLegacyActions();
  const tab = useDrake((state) => state.session.profileTab);
  const [loading, setLoading] = useState(false);

  async function change(next: string) {
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
