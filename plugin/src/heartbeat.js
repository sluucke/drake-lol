// The tray decides whether the plugin is *effectively* injected from the
// arrival of check-ins, and treats one older than 20 seconds
// (configd::CHECKIN_TOLERANCE) as stale. A single check-in at load would
// therefore flip a perfectly healthy session to "not injected" 20 seconds in,
// permanently enabling "Reload client to apply" for a problem that does not
// exist. The check-in has to repeat for as long as we are loaded.
export const HEARTBEAT_INTERVAL_MS = 5000;

/// Checks in immediately, then keeps checking in. Returns the result of the
/// first check-in, so the caller can log it. `setIntervalImpl` is a seam for
/// tests.
export async function startHeartbeat({
  checkIn,
  host,
  intervalMs = HEARTBEAT_INTERVAL_MS,
  setIntervalImpl = setInterval,
}) {
  // A beat that throws must never stop the ones after it: a transient failure
  // (or the tray restarting) would otherwise leave the tray blind for the rest
  // of the session.
  const beat = async () => {
    try {
      return await checkIn(host);
    } catch {
      return false;
    }
  };

  const first = await beat();
  setIntervalImpl(beat, intervalMs);
  return first;
}
