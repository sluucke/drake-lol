import { mountReactRoot } from './mountReact.js';
import { App } from './App.jsx';
import { APP_STYLES } from './styles/index.js';

export const APP_LAYER_ID = 'drake-app-layer';

const mounted = new WeakMap();

export function startApp(shadow, { sfx } = {}) {
  if (mounted.has(shadow)) return mounted.get(shadow);
  const layer = shadow.ownerDocument.createElement('div');
  layer.id = APP_LAYER_ID;
  const app = mountReactRoot(shadow, {
    styles: APP_STYLES,
    element: <App sfx={sfx} portalTarget={layer} />,
  });
  shadow.appendChild(layer);
  const result = {
    ...app,
    layer,
    unmount() {
      app.unmount();
      layer.remove();
    },
  };
  mounted.set(shadow, result);
  return result;
}
