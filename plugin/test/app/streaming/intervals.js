import { afterEach, beforeEach } from 'vitest';

export function clearIntervalsAfterEach() {
  const ids = [];
  let original = null;
  beforeEach(() => {
    original = window.setInterval;
    window.setInterval = (fn, ms, ...args) => {
      const id = original.call(window, fn, ms, ...args);
      ids.push(id);
      return id;
    };
  });
  afterEach(() => {
    for (const id of ids.splice(0)) window.clearInterval(id);
    if (original) window.setInterval = original;
  });
}
