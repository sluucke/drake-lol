import type { ReactNode } from 'react';
import { vi } from 'vitest';
import { render } from '@testing-library/react';
import { AppProviders } from '../../src/app/AppProviders';
import type { AppActions } from '../../src/app/AppProviders';
import type { DrakeStore } from '../../src/app/store/types';

export interface RenderOptions {
  store?: DrakeStore;
  actions?: Partial<AppActions>;
}

export function renderWithProviders(ui: ReactNode, { store, actions }: RenderOptions = {}) {
  const sfx = { play: vi.fn<(name: string) => void>() };
  const portalTarget = document.createElement('div');
  portalTarget.setAttribute('data-portal-target', '');
  document.body.appendChild(portalTarget);
  const utils = render(
    <AppProviders sfx={sfx} portalTarget={portalTarget} store={store} actions={actions as AppActions | undefined}>
      {ui}
    </AppProviders>,
  );
  return { ...utils, sfx, portalTarget };
}
