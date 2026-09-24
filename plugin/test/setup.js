import { afterEach } from 'vitest';

if (typeof document !== 'undefined') {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const { cleanup } = await import('@testing-library/react');
  afterEach(() => cleanup());
}
