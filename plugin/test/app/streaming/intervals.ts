import { afterEach, beforeEach } from 'vitest';

type SetIntervalFn = (handler: TimerHandler, timeout?: number, ...args: unknown[]) => number;

export function clearIntervalsAfterEach() {
  const ids: number[] = [];
  let original: SetIntervalFn | null = null;
  beforeEach(() => {
    const saved = window.setInterval as unknown as SetIntervalFn;
    original = saved;
    const wrapped: SetIntervalFn = (fn, ms, ...args) => {
      const id = saved.call(window, fn, ms, ...args);
      ids.push(id);
      return id;
    };
    window.setInterval = wrapped as unknown as typeof window.setInterval;
  });
  afterEach(() => {
    for (const id of ids.splice(0)) window.clearInterval(id);
    if (original) window.setInterval = original as unknown as typeof window.setInterval;
  });
}
