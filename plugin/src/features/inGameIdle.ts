import type { SubscribeFn, Unsubscribe } from '../subscribe';
import { GAMEFLOW_PHASE_ROUTE } from './dodge';

export type GameflowPhasePayload = string | { phase?: unknown; data?: unknown } | null | undefined;

export interface InGameIdleOptions {
  subscribe: SubscribeFn;
  onChange?: (idle: boolean) => void;
}

export interface InGameIdle {
  stop(): void;
}

const IN_GAME_PHASES = new Set(['GameStart', 'InProgress', 'Reconnect']);

export function readGameflowPhase(payload: unknown): string {
  if (payload == null) return '';
  if (typeof payload === 'string') return payload.replace(/^"+|"+$/g, '');
  const body = payload as Exclude<GameflowPhasePayload, string | null | undefined>;
  const raw = body.phase ?? body.data;
  return typeof raw === 'string' ? raw.replace(/^"+|"+$/g, '') : '';
}

export function isInGamePhase(phase: unknown): boolean {
  return IN_GAME_PHASES.has(String(phase || '').trim());
}

export function isChampSelectPhase(phase: unknown): boolean {
  return String(phase || '').trim() === 'ChampSelect';
}

const READY_CHECK_PHASES = new Set(['Matchmaking', 'ReadyCheck']);

export function isReadyCheckPhase(phase: unknown): boolean {
  return READY_CHECK_PHASES.has(String(phase || '').trim());
}

export function startInGameIdle({ subscribe, onChange }: InGameIdleOptions): InGameIdle {
  let idle = false;
  const unsubscribe: Unsubscribe = subscribe<GameflowPhasePayload>(GAMEFLOW_PHASE_ROUTE, (payload) => {
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
