export function shouldAccept(payload) {
  if (!payload) return false;
  return payload.state === 'InProgress' && payload.playerResponse === 'None';
}

export function startAutoAccept({ enabled, lcu, subscribe }) {
  if (!enabled) return () => {};
  return subscribe('/lol-matchmaking/v1/ready-check', async (payload) => {
    if (!shouldAccept(payload)) return;
    await lcu.post('/lol-matchmaking/v1/ready-check/accept');
  });
}
