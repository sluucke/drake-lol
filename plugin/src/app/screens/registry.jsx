import { AutoAcceptScreen } from './AutoAccept.jsx';
import { StatusScreen } from './Status.jsx';

export const REACT_SCREENS = {
  'auto-accept': AutoAcceptScreen,
  status: StatusScreen,
};

export function isReactScreen(id) {
  return Object.prototype.hasOwnProperty.call(REACT_SCREENS, id);
}
