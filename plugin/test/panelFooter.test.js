import { describe, it, expect } from 'vitest';
import { formatHostLabel } from '../src/ui/panel.js';

describe('formatHostLabel', () => {
  it('shows the Drake version alongside the loader version', () => {
    expect(formatHostLabel({ appVersion: '0.3.6', loaderVersion: '1.1.6' })).toBe(
      'drake 0.3.6 · loader 1.1.6',
    );
  });

  it('still shows the Drake version when there is no loader', () => {
    expect(formatHostLabel({ appVersion: '0.3.6', loaderVersion: '' })).toBe(
      'drake 0.3.6 · in client',
    );
  });

  it('falls back to a placeholder when the tray never reported a version', () => {
    expect(formatHostLabel({ appVersion: '', loaderVersion: '1.1.6' })).toBe(
      'drake ? · loader 1.1.6',
    );
  });
});
