import { describe, it, expect } from 'vitest';
import { startHeartbeat, HEARTBEAT_INTERVAL_MS } from '../src/heartbeat.js';

function fakeClock() {
  const scheduled = [];
  return {
    setIntervalImpl: (fn, ms) => {
      scheduled.push({ fn, ms });
      return scheduled.length;
    },
    scheduled,
    tick: async () => {
      for (const s of scheduled) await s.fn();
    },
  };
}

describe('heartbeat', () => {
  it('checks in immediately, before any interval elapses', async () => {
    const hosts = [];
    const clock = fakeClock();
    await startHeartbeat({
      checkIn: async (h) => { hosts.push(h); return true; },
      host: 'pengu 1.1.6',
      setIntervalImpl: clock.setIntervalImpl,
    });
    expect(hosts).toEqual(['pengu 1.1.6']);
  });

  it('keeps checking in, so the tray never times the session out', async () => {



    const hosts = [];
    const clock = fakeClock();
    await startHeartbeat({
      checkIn: async (h) => { hosts.push(h); return true; },
      host: 'pengu',
      setIntervalImpl: clock.setIntervalImpl,
    });
    await clock.tick();
    await clock.tick();
    expect(hosts).toEqual(['pengu', 'pengu', 'pengu']);
  });

  it('repeats comfortably inside the tray tolerance window', async () => {
    const clock = fakeClock();
    await startHeartbeat({
      checkIn: async () => true,
      host: 'pengu',
      setIntervalImpl: clock.setIntervalImpl,
    });
    expect(clock.scheduled[0].ms).toBe(HEARTBEAT_INTERVAL_MS);

    expect(HEARTBEAT_INTERVAL_MS).toBeLessThanOrEqual(20000 / 3);
  });

  it('keeps beating after a failed check-in', async () => {



    let calls = 0;
    const clock = fakeClock();
    await startHeartbeat({
      checkIn: async () => { calls += 1; return false; },
      host: 'pengu',
      setIntervalImpl: clock.setIntervalImpl,
    });
    await clock.tick();
    expect(calls).toBe(2);
  });

  it('survives a check-in that throws', async () => {
    let calls = 0;
    const clock = fakeClock();
    await startHeartbeat({
      checkIn: async () => { calls += 1; throw new Error('boom'); },
      host: 'pengu',
      setIntervalImpl: clock.setIntervalImpl,
    });
    await clock.tick();
    expect(calls).toBe(2);
  });

  it('reports the outcome of the first check-in to its caller', async () => {
    const clock = fakeClock();
    const ok = await startHeartbeat({
      checkIn: async () => true,
      host: 'pengu',
      setIntervalImpl: clock.setIntervalImpl,
    });
    expect(ok).toBe(true);
  });
});
