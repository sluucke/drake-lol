import { vi } from 'vitest';
import { render } from '@testing-library/react';
import { AppProviders } from '../../src/app/AppProviders.jsx';

export function renderWithProviders(ui, { store, actions } = {}) {
  const sfx = { play: vi.fn() };
  const portalTarget = document.createElement('div');
  portalTarget.setAttribute('data-portal-target', '');
  document.body.appendChild(portalTarget);
  const utils = render(
    <AppProviders sfx={sfx} portalTarget={portalTarget} store={store} actions={actions}>
      {ui}
    </AppProviders>,
  );
  return { ...utils, sfx, portalTarget };
}
