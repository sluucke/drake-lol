import { describe, it, expect, vi } from 'vitest';
import { GAMEFLOW_PHASE_ROUTE } from '../src/features/dodge.js';
import {
  isInGamePhase,
  isChampSelectPhase,
  readGameflowPhase,
  startInGameIdle,
} from '../src/features/inGameIdle.js';

describe('isInGamePhase', () => {
  it('treats live game phases as in-game', () => {
    expect(isInGamePhase('InProgress')).toBe(true);
    expect(isInGamePhase('GameStart')).toBe(true);
    expect(isInGamePhase('Reconnect')).toBe(true);
  });

  it('treats client phases as active', () => {
    expect(isInGamePhase('Lobby')).toBe(false);
    expect(isInGamePhase('Matchmaking')).toBe(false);
    expect(isInGamePhase('ReadyCheck')).toBe(false);
    expect(isInGamePhase('ChampSelect')).toBe(false);
    expect(isInGamePhase('EndOfGame')).toBe(false);
    expect(isInGamePhase('WaitingForStats')).toBe(false);
    expect(isInGamePhase('')).toBe(false);
  });
});

describe('isChampSelectPhase', () => {
  it('is true only in champ select', () => {
    expect(isChampSelectPhase('ChampSelect')).toBe(true);
    expect(isChampSelectPhase('Lobby')).toBe(false);
    expect(isChampSelectPhase('Matchmaking')).toBe(false);
  });
});

describe('readGameflowPhase', () => {
  it('reads a quoted string payload', () => {
    expect(readGameflowPhase('"InProgress"')).toBe('InProgress');
    expect(readGameflowPhase('ChampSelect')).toBe('ChampSelect');
  });

  it('reads nested phase fields', () => {
    expect(readGameflowPhase({ phase: 'InProgress' })).toBe('InProgress');
    expect(readGameflowPhase({ data: 'Lobby' })).toBe('Lobby');
  });
});

describe('startInGameIdle', () => {
  it('subscribes to gameflow phase and idles only when the game starts', () => {
    const handlers = new Map();
    const subscribe = vi.fn((route, handler) => {
      handlers.set(route, handler);
      return () => {};
    });
    const onChange = vi.fn();

    startInGameIdle({ subscribe, onChange });

    expect(subscribe).toHaveBeenCalledWith(GAMEFLOW_PHASE_ROUTE, expect.any(Function));
    handlers.get(GAMEFLOW_PHASE_ROUTE)('ChampSelect');
    expect(onChange).not.toHaveBeenCalled();

    handlers.get(GAMEFLOW_PHASE_ROUTE)('InProgress');
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenLastCalledWith(true);

    handlers.get(GAMEFLOW_PHASE_ROUTE)('InProgress');
    expect(onChange).toHaveBeenCalledTimes(1);

    handlers.get(GAMEFLOW_PHASE_ROUTE)('EndOfGame');
    expect(onChange).toHaveBeenLastCalledWith(false);
  });

  it('does not leave idle on an empty phase payload', () => {
    const handlers = new Map();
    const subscribe = vi.fn((route, handler) => {
      handlers.set(route, handler);
      return () => {};
    });
    const onChange = vi.fn();

    startInGameIdle({ subscribe, onChange });
    handlers.get(GAMEFLOW_PHASE_ROUTE)('InProgress');
    handlers.get(GAMEFLOW_PHASE_ROUTE)(null);
    handlers.get(GAMEFLOW_PHASE_ROUTE)('');

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenLastCalledWith(true);
  });

  it('unsubscribes when stopped', () => {
    const stop = vi.fn();
    const subscribe = vi.fn(() => stop);
    const ctl = startInGameIdle({ subscribe, onChange: () => {} });
    ctl.stop();
    expect(stop).toHaveBeenCalledTimes(1);
  });
});
