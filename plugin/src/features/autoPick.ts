import type { SettingsValues } from '../settings';
import type { Unsubscribe } from '../subscribe';
import {
  findMyAction,
  findMyQueuedAction,
  isChampSelectSession,
  isPlanningPhase,
  SESSION_ROUTE,
  unavailableChampionIds,
} from './champSelect';
import type { ChampSelect, ChampSelectSession, CommitResult } from './champSelect';
import { GAMEFLOW_PHASE_ROUTE } from './dodge';
import { isChampSelectPhase, readGameflowPhase } from './inGameIdle';
import { autoPickOrder, localPlayerPickRole } from './autoPickRoles';

export const CHAMP_SELECT_POLL_MS = 500;

export interface AutoPickDecision {
  actionId: number;
  championId: number;
  completed: boolean;
  kind: 'ban' | 'pick';
}

export interface ObservedAction {
  actionId: number;
  championId: number;
  completed: boolean;
  phase: string;
}

type TimerHandle = ReturnType<typeof setTimeout>;

export interface ChampSelectAutomationOptions {
  getSettings: () => SettingsValues;
  champSelect: Pick<ChampSelect, 'commit'>;
  subscribe: (route: string, handler: (payload: unknown) => void) => Unsubscribe;
  onResult?: (decision: AutoPickDecision, result: CommitResult, observed: ObservedAction) => void;
  onSession?: (session: ChampSelectSession | null) => void;
  getSession?: () => Promise<unknown>;
  setTimeoutImpl?: (handler: () => void, ms: number) => TimerHandle;
  clearTimeoutImpl?: (id: TimerHandle) => void;
}

export interface ChampSelectAutomation {
  refresh(): void;
  stop(): void;
}

function pickCandidates(session: ChampSelectSession, settings: SettingsValues): number[] {
  const role = localPlayerPickRole(session);
  if (!role) return [];
  return autoPickOrder(settings, role);
}

function choosePickChampion(session: ChampSelectSession, settings: SettingsValues, skipped: Set<number>): number {
  const taken = unavailableChampionIds(session);
  for (const id of pickCandidates(session, settings)) {
    if (taken.has(id) || skipped.has(id)) continue;
    return id;
  }
  return 0;
}

export function decideAction(
  session: ChampSelectSession,
  settings: SettingsValues,
  skipped: Set<number> = new Set(),
): AutoPickDecision | null {
  const planning = isPlanningPhase(session);
  const ban = findMyAction(session, 'ban');
  const banTarget = settings.auto_ban_champion_id;
  if (ban && !planning && settings.auto_ban && banTarget && !skipped.has(banTarget)) {
    if (!unavailableChampionIds(session).has(banTarget)) {
      return {
        actionId: ban.id,
        championId: banTarget,
        completed: true,
        kind: 'ban',
      };
    }
  }

  const livePick = findMyAction(session, 'pick');
  const queuedPick = planning ? findMyQueuedAction(session, 'pick') : null;
  const pick = livePick || queuedPick;
  const championId = choosePickChampion(session, settings, skipped);
  if (pick && settings.auto_pick && championId) {
    return {
      actionId: pick.id,
      championId,
      completed: !!(settings.insta_lock && livePick && !planning),
      kind: 'pick',
    };
  }

  return null;
}

function decisionKey(decision: AutoPickDecision): string {
  return `${decision.kind}:${decision.actionId}:${decision.championId}:${decision.completed ? 'lock' : 'hover'}`;
}

export function startChampSelectAutomation({
  getSettings,
  champSelect,
  subscribe,
  onResult,
  onSession,
  getSession,
  setTimeoutImpl = setTimeout,
  clearTimeoutImpl = clearTimeout,
}: ChampSelectAutomationOptions): ChampSelectAutomation {
  let pending: string | null = null;
  let echoed = false;
  let lastSession: ChampSelectSession | null = null;
  let skipped = new Set<number>();
  let pollId: TimerHandle | 0 = 0;
  let applying = false;
  let inChampSelect = false;
  let stopPhase: Unsubscribe | null = null;
  let stopSession: Unsubscribe | null = null;

  function armSession(active: boolean) {
    if (active === inChampSelect) return;
    inChampSelect = active;
    if (active) {
      if (!stopSession) stopSession = subscribe(SESSION_ROUTE, apply);
      return;
    }
    if (stopSession) {
      stopSession();
      stopSession = null;
    }
    void apply(null);
  }

  function stopPoll() {
    if (pollId) {
      clearTimeoutImpl(pollId);
      pollId = 0;
    }
  }

  function schedulePoll() {
    stopPoll();
    if (typeof getSession !== 'function') return;
    pollId = setTimeoutImpl(async () => {
      pollId = 0;
      if (!lastSession) return;
      try {
        const session = await getSession();
        await apply(session || lastSession);
      } catch {
        await apply(lastSession);
      }
    }, CHAMP_SELECT_POLL_MS);
  }

  const apply = async (rawSession: unknown): Promise<void> => {
    const session = isChampSelectSession(rawSession) ? rawSession : null;
    lastSession = session;
    if (onSession) onSession(session);
    if (!session) {
      pending = null;
      echoed = false;
      skipped = new Set();
      stopPoll();
      return;
    }
    if (applying) {
      schedulePoll();
      return;
    }
    applying = true;
    try {
      for (;;) {
        const decision = decideAction(session, getSettings(), skipped);
        if (!decision) {
          pending = null;
          echoed = false;
          schedulePoll();
          return;
        }

        const mine =
          decision.kind === 'pick' && !decision.completed
            ? findMyQueuedAction(session, 'pick') || findMyAction(session, 'pick')
            : findMyAction(session, decision.kind);
        if (!mine) {
          pending = null;
          echoed = false;
          schedulePoll();
          return;
        }

        const key = decisionKey(decision);
        const already =
          mine.championId === decision.championId && (!decision.completed || mine.completed);

        if (already) {
          pending = key;
          echoed = true;
          schedulePoll();
          return;
        }

        if (pending === key && echoed && mine.championId === 0) {
          pending = null;
          echoed = false;
        }

        const needsConfirm =
          decision.completed &&
          mine.championId === decision.championId &&
          !mine.completed;

        if (pending === key && !needsConfirm) {
          schedulePoll();
          return;
        }

        pending = key;
        const result = await champSelect.commit(
          mine.id,
          decision.championId,
          decision.completed,
          decision.kind,
        );

        const observed: ObservedAction = {
          actionId: mine.id,
          championId: mine.championId,
          completed: !!mine.completed,
          phase: String(session?.timer?.phase || ''),
        };

        if (result.ok) {
          if (onResult) onResult(decision, result, observed);
          schedulePoll();
          return;
        }

        pending = null;
        if (onResult) onResult(decision, result, observed);

        if (decision.kind === 'ban') {
          if (!result.retry) skipped = new Set<number>(skipped).add(decision.championId);
          schedulePoll();
          return;
        }

        if (result.retry) {
          schedulePoll();
          return;
        }

        const nextSkipped = new Set(skipped);
        nextSkipped.add(decision.championId);
        if (!decideAction(session, getSettings(), nextSkipped)) {
          schedulePoll();
          return;
        }
        skipped = nextSkipped;
      }
    } finally {
      applying = false;
    }
  };

  stopPhase = subscribe(GAMEFLOW_PHASE_ROUTE, (payload) => {
    const phase = readGameflowPhase(payload);
    if (!phase) return;
    armSession(isChampSelectPhase(phase));
  });

  return {
    refresh: () => {
      if (inChampSelect) apply(lastSession);
    },
    stop: () => {
      pending = null;
      echoed = false;
      lastSession = null;
      skipped = new Set();
      stopPoll();
      if (onSession) onSession(null);
      if (stopSession) {
        stopSession();
        stopSession = null;
      }
      if (stopPhase) {
        stopPhase();
        stopPhase = null;
      }
      inChampSelect = false;
    },
  };
}
