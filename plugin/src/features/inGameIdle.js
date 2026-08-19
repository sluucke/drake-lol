import { GAMEFLOW_PHASE_ROUTE } from './dodge.js';

const IN_GAME_PHASES = new Set(['GameStart', 'InProgress', 'Reconnect']);

export function readGameflowPhase(payload) {
  if (payload == null) return '';
  if (typeof payload === 'string') return payload.replace(/^"+|"+$/g, '');
  const raw = payload.phase ?? payload.data;
  return typeof raw === 'string' ? raw.replace(/^"+|"+$/g, '') : '';
}

export function isInGamePhase(phase) {
  return IN_GAME_PHASES.has(String(phase || '').trim());
}

export function isChampSelectPhase(phase) {
  return String(phase || '').trim() === 'ChampSelect';
}

export function startInGameIdle({ subscribe, onChange }) {
  let idle = false;
  const unsubscribe = subscribe(GAMEFLOW_PHASE_ROUTE, (payload) => {
    const phase = readGameflowPhase(payload);
    if (!phase) return;
    const next = isInGamePhase(phase);
    if (next === idle) return;
    idle = next;
    if (typeof onChange === 'function') onChange(idle);
  });

  return {
    stop() {
      if (typeof unsubscribe === 'function') unsubscribe();
    },
  };
}
