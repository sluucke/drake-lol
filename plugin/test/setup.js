import { afterEach } from 'vitest';

if (typeof document !== 'undefined') {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const { cleanup } = await import('@testing-library/react');
  const { MotionGlobalConfig } = await import('motion/react');
  MotionGlobalConfig.skipAnimations = true;
  afterEach(() => {
    cleanup();
    document.body.innerHTML = '';
  });
}

if (typeof window !== 'undefined' && !window.PointerEvent) {
  window.PointerEvent = class PointerEvent extends window.MouseEvent {
    constructor(type, init = {}) {
      super(type, init);
      this.pointerId = init.pointerId ?? 0;
      this.pointerType = init.pointerType ?? 'mouse';
    }
  };
}
