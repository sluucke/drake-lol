





export const HEARTBEAT_INTERVAL_MS = 5000;




export interface HeartbeatOptions {
  checkIn: (host: string) => Promise<boolean> | boolean;
  host: string;
  intervalMs?: number;
  setIntervalImpl?: (fn: () => void, ms: number) => unknown;
}

export async function startHeartbeat({
  checkIn,
  host,
  intervalMs = HEARTBEAT_INTERVAL_MS,
  setIntervalImpl = setInterval,
}: HeartbeatOptions): Promise<boolean> {
  
  
  
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
