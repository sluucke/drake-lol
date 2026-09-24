import { AutoAcceptScreen } from './AutoAccept.jsx';

export const REACT_SCREENS = {
  'auto-accept': AutoAcceptScreen,
};

export function isReactScreen(id) {
  return Object.prototype.hasOwnProperty.call(REACT_SCREENS, id);
}
