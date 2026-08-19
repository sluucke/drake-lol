import {
  findMyAction,
  findMyQueuedAction,
  isChampSelectSession,
  isPlanningPhase,
  SESSION_ROUTE,
  unavailableChampionIds,
} from './champSelect.js';
import { GAMEFLOW_PHASE_ROUTE } from './dodge.js';
import { isChampSelectPhase, readGameflowPhase } from './inGameIdle.js';

export const CHAMP_SELECT_POLL_MS = 500;

function pickCandidates(settings) {
  const ids = [];
  for (const id of [settings.auto_pick_champion_id, settings.auto_pick_champion_id_2]) {
    if (id && !ids.includes(id)) ids.push(id);
  }
  return ids;
}

function choosePickChampion(session, settings, skipped) {
  const taken = unavailableChampionIds(session);
  for (const id of pickCandidates(settings)) {
    if (taken.has(id) || skipped.has(id)) continue;
    return id;
  }
  return 0;
}

export function decideAction(session, settings, skipped = new Set()) {
  const ban = findMyAction(session, 'ban');
  if (ban && settings.auto_ban && settings.auto_ban_champion_id) {
    return {
      actionId: ban.id,
      championId: settings.auto_ban_champion_id,
      completed: true,
      kind: 'ban',
    };
  }

  const livePick = findMyAction(session, 'pick');
  const queuedPick = isPlanningPhase(session) ? findMyQueuedAction(session, 'pick') : null;
  const pick = livePick || queuedPick;
  const championId = choosePickChampion(session, settings, skipped);
  if (pick && settings.auto_pick && championId) {
    return {
      actionId: pick.id,
      championId,
      completed: !!(settings.insta_lock && livePick),
      kind: 'pick',
    };
  }

  return null;
}

function decisionKey(decision) {
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
}) {
  let pending = null;
  let echoed = false;
  let lastSession = null;
  let skipped = new Set();
  let pollId = 0;
  let applying = false;
  let inChampSelect = false;
  let stopPhase = null;
  let stopSession = null;

  function armSession(active) {
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

  const apply = async (rawSession) => {
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

        if (result.ok) {
          if (onResult) onResult(decision, result);
          schedulePoll();
          return;
        }

        pending = null;
        if (onResult) onResult(decision, result);

        if (decision.kind !== 'pick' || result.retry) {
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
