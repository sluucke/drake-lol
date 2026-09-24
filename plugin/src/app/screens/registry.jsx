export const REACT_SCREENS = {};

export function isReactScreen(id) {
  return Object.prototype.hasOwnProperty.call(REACT_SCREENS, id);
}
