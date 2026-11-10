import { describe, it, expect } from 'vitest';
import { act } from 'react';
import { startApp, APP_LAYER_ID } from '../../src/app/main';
import { APP_ROOT_ID } from '../../src/app/mountReact';
import { APP_STYLES } from '../../src/app/styles/index';
import type { StartedApp } from '../../src/app/main';

function makeShadow() {
  const host = document.createElement('div');
  document.body.appendChild(host);
  return host.attachShadow({ mode: 'open' });
}

describe('startApp', () => {
  it('mounts the app root with all registered styles inside the shadow root', async () => {
    const shadow = makeShadow();
    await act(async () => {
      startApp(shadow);
    });
    expect(shadow.getElementById(APP_ROOT_ID)?.querySelector('[data-drake-app]')).not.toBeNull();
    expect(shadow.querySelectorAll('style[data-drake-style]').length).toBe(APP_STYLES.length);
  });

  it('adds the portal layer after the app root', async () => {
    const shadow = makeShadow();
    let app: StartedApp | undefined;
    await act(async () => {
      app = startApp(shadow);
    });
    if (!app) throw new Error('not mounted');
    expect(app.layer.id).toBe(APP_LAYER_ID);
    expect(shadow.lastElementChild).toBe(app.layer);
    expect(app.container.nextElementSibling).toBe(app.layer);
  });

  it('is idempotent for the same shadow root', async () => {
    const shadow = makeShadow();
    let first;
    let second;
    await act(async () => {
      first = startApp(shadow);
      second = startApp(shadow);
    });
    expect(second).toBe(first);
    expect(shadow.querySelectorAll(`#${APP_ROOT_ID}`).length).toBe(1);
  });

  it('unmount removes root and layer', async () => {
    const shadow = makeShadow();
    let app: StartedApp | undefined;
    await act(async () => {
      app = startApp(shadow);
    });
    await act(async () => app?.unmount());
    expect(shadow.getElementById(APP_ROOT_ID)).toBeNull();
    expect(shadow.getElementById(APP_LAYER_ID)).toBeNull();
  });
});
