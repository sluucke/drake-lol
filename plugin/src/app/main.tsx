import { mountReactRoot } from './mountReact';
import type { MountedRoot } from './mountReact';
import type { AppProps } from './App';
import { App } from './App';
import { APP_STYLES } from './styles/index';

export const APP_LAYER_ID = 'drake-app-layer';

export interface StartedApp extends MountedRoot {
  layer: HTMLDivElement;
}

export type StartAppOptions = Pick<AppProps, 'sfx' | 'store' | 'actions'>;

const mounted = new WeakMap<ShadowRoot, StartedApp>();

export function startApp(shadow: ShadowRoot, { sfx, store, actions }: StartAppOptions = {}): StartedApp {
  const existing = mounted.get(shadow);
  if (existing) return existing;
  const layer = shadow.ownerDocument.createElement('div');
  layer.id = APP_LAYER_ID;
  const app = mountReactRoot(shadow, {
    styles: APP_STYLES,
    element: <App sfx={sfx} portalTarget={layer} store={store} actions={actions} />,
  });
  shadow.appendChild(layer);
  const result: StartedApp = {
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
