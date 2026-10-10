// @ts-nocheck
import { AutoAcceptScreen } from './AutoAccept';
import { StatusScreen } from './Status';
import { QueueScreen } from './Queue';
import { SettingsScreen } from './Settings';
import { AutoPickScreen } from './AutoPick';
import { AutoBanScreen } from './AutoBan';
import { ProfileScreen } from './Profile';
import { FriendsScreen } from './Friends';
import { WhatsNewScreen } from './WhatsNew';

export const REACT_SCREENS = {
  'auto-accept': AutoAcceptScreen,
  status: StatusScreen,
  queue: QueueScreen,
  settings: SettingsScreen,
  'auto-pick': AutoPickScreen,
  'auto-ban': AutoBanScreen,
  profile: ProfileScreen,
  friends: FriendsScreen,
  'whats-new': WhatsNewScreen,
};

export function isReactScreen(id) {
  return Object.prototype.hasOwnProperty.call(REACT_SCREENS, id);
}
