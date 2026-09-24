import { AutoAcceptScreen } from './AutoAccept.jsx';
import { StatusScreen } from './Status.jsx';
import { QueueScreen } from './Queue.jsx';

export const REACT_SCREENS = {
  'auto-accept': AutoAcceptScreen,
  status: StatusScreen,
  queue: QueueScreen,
};

export function isReactScreen(id) {
  return Object.prototype.hasOwnProperty.call(REACT_SCREENS, id);
}
