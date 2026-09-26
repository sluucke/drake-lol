import { AutoAcceptScreen } from './AutoAccept.jsx';
import { StatusScreen } from './Status.jsx';
import { QueueScreen } from './Queue.jsx';
import { SettingsScreen } from './Settings.jsx';
import { AutoPickScreen } from './AutoPick.jsx';
import { AutoBanScreen } from './AutoBan.jsx';
import { ProfileScreen } from './Profile.jsx';
import { FriendsScreen } from './Friends.jsx';
import { WhatsNewScreen } from './WhatsNew.jsx';

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
