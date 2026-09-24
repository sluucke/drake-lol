import { describe, it, expect } from 'vitest';
import { act } from 'react';
import { startApp } from '../../src/app/main.jsx';
import { APP_ROOT_ID } from '../../src/app/mountReact.js';

function makeShadow() {
  const host = document.createElement('div');
  document.body.appendChild(host);
  return host.attachShadow({ mode: 'open' });
}

describe('startApp', () => {
  it('mounts the app root with base styles inside the shadow root', async () => {
    const shadow = makeShadow();
    await act(async () => {
      startApp(shadow);
    });
    expect(shadow.getElementById(APP_ROOT_ID).querySelector('[data-drake-app]')).not.toBeNull();
    expect(shadow.querySelectorAll('style[data-drake-style]').length).toBe(1);
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
});
