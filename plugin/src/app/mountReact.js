import { createRoot } from 'react-dom/client';

export const APP_ROOT_ID = 'drake-app-root';

export function mountReactRoot(shadow, { styles = [], element }) {
  const doc = shadow.ownerDocument;
  const styleEls = styles.map((css) => {
    const el = doc.createElement('style');
    el.setAttribute('data-drake-style', '');
    el.textContent = css;
    shadow.appendChild(el);
    return el;
  });
  const container = doc.createElement('div');
  container.id = APP_ROOT_ID;
  shadow.appendChild(container);
  const root = createRoot(container);
  root.render(element);
  return {
    container,
    root,
    unmount() {
      root.unmount();
      container.remove();
      for (const el of styleEls) el.remove();
    },
  };
}
