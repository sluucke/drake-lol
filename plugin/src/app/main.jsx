import { mountReactRoot } from './mountReact.js';
import { App } from './App.jsx';
import baseCss from './styles/base.css';

const mounted = new WeakMap();

export function startApp(shadow) {
  if (mounted.has(shadow)) return mounted.get(shadow);
  const app = mountReactRoot(shadow, { styles: [baseCss], element: <App /> });
  mounted.set(shadow, app);
  return app;
}
