





export const HEARTBEAT_INTERVAL_MS = 5000;




export async function startHeartbeat({
  checkIn,
  host,
  intervalMs = HEARTBEAT_INTERVAL_MS,
  setIntervalImpl = setInterval,
}) {
  
  
  
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
