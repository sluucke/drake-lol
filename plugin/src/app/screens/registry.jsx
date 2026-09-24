import { AutoAcceptScreen } from './AutoAccept.jsx';
import { StatusScreen } from './Status.jsx';
import { QueueScreen } from './Queue.jsx';
import { SettingsScreen } from './Settings.jsx';
import { AutoPickScreen } from './AutoPick.jsx';

export const REACT_SCREENS = {
  'auto-accept': AutoAcceptScreen,
  status: StatusScreen,
  queue: QueueScreen,
  settings: SettingsScreen,
  'auto-pick': AutoPickScreen,
};

export function isReactScreen(id) {
  return Object.prototype.hasOwnProperty.call(REACT_SCREENS, id);
}
