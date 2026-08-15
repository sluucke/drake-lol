import { describe, it, expect } from 'vitest';
import { startHeartbeat, HEARTBEAT_INTERVAL_MS } from '../src/heartbeat.js';

/// A stand-in for setInterval that lets a test drive time by hand.
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
    // The tray treats a check-in as stale after 20s (configd::CHECKIN_TOLERANCE).
    // A single check-in at load would flip a perfectly healthy session to
    // "not injected" 20 seconds in, permanently offering a pointless reload.
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
    // Room for several missed beats before the 20s window lapses.
    expect(HEARTBEAT_INTERVAL_MS).toBeLessThanOrEqual(20000 / 3);
  });

  it('keeps beating after a failed check-in', async () => {
    // The tray restarting mid-session rejects the old token with a 401. The
    // next beat must still happen: giving up would leave the tray blind for
    // the rest of the session.
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
