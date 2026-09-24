import { describe, it, expect } from 'vitest';
import { act } from 'react';
import { mountReactRoot, APP_ROOT_ID } from '../../src/app/mountReact.js';

function makeShadow() {
  const host = document.createElement('div');
  document.body.appendChild(host);
  return host.attachShadow({ mode: 'open' });
}

describe('mountReactRoot', () => {
  it('renders the element into a container inside the shadow root', async () => {
    const shadow = makeShadow();
    let mounted;
    await act(async () => {
      mounted = mountReactRoot(shadow, { element: <p data-probe="">hi</p> });
    });
    expect(mounted.container.id).toBe(APP_ROOT_ID);
    expect(mounted.container.parentNode).toBe(shadow);
    expect(shadow.querySelector('[data-probe]').textContent).toBe('hi');
  });

  it('injects one style tag per css text before the container', async () => {
    const shadow = makeShadow();
    await act(async () => {
      mountReactRoot(shadow, { styles: ['.a{}', '.b{}'], element: <i /> });
    });
    const styles = shadow.querySelectorAll('style[data-drake-style]');
    expect([...styles].map((s) => s.textContent)).toEqual(['.a{}', '.b{}']);
    expect(shadow.lastElementChild.id).toBe(APP_ROOT_ID);
  });

  it('leaves existing shadow content untouched', async () => {
    const shadow = makeShadow();
    shadow.innerHTML = '<div id="legacy">legacy</div>';
    await act(async () => {
      mountReactRoot(shadow, { element: <i /> });
    });
    expect(shadow.getElementById('legacy').textContent).toBe('legacy');
  });

  it('unmount removes container and styles', async () => {
    const shadow = makeShadow();
    let mounted;
    await act(async () => {
      mounted = mountReactRoot(shadow, { styles: ['.a{}'], element: <i /> });
    });
    await act(async () => mounted.unmount());
    expect(shadow.getElementById(APP_ROOT_ID)).toBeNull();
    expect(shadow.querySelector('style[data-drake-style]')).toBeNull();
  });

  it('renders synchronously so callers can query the DOM right away', () => {
    const shadow = makeShadow();
    const mounted = mountReactRoot(shadow, { element: <div id="sync-probe">now</div> });
    expect(shadow.getElementById('sync-probe').textContent).toBe('now');
    mounted.unmount();
  });
});
