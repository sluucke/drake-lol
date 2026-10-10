import type { ErrorInfo, ReactNode } from 'react';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import { reportReactError } from '../errorReporter';

function onUncaughtError(error: unknown, info: ErrorInfo) {
  console.error(error);
  reportReactError(error, info);
}

export const APP_ROOT_ID = 'drake-app-root';

export interface MountOptions {
  styles?: readonly string[];
  element: ReactNode;
}

export interface MountedRoot {
  container: HTMLDivElement;
  root: Root;
  unmount(): void;
}

export function mountReactRoot(shadow: ShadowRoot, { styles = [], element }: MountOptions): MountedRoot {
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
  const root = createRoot(container, { onUncaughtError });
  flushSync(() => root.render(element));
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
