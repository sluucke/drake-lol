import { findMyAction, SESSION_ROUTE, unavailableChampionIds } from './champSelect.js';

// Auto Pick and Auto Ban.
//
// Both hang off the same champ-select subscription and the same decision
// function, because they are the same shape: find our pending action, and if
// the user configured a champion for it, commit one.
//
// The difference that matters is what "commit" means. A hovered PICK is a real
// outcome -- the team sees your intent and you can still change your mind --
// so Auto Pick hovers unless Insta Lock is on. A hovered BAN bans nothing, so
// Auto Ban always completes.

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
  // Bans resolve first, and the client rejects a write to the pick phase while
  // bans are still in progress -- so a session with both pending must be
  // treated as a ban.
  const ban = findMyAction(session, 'ban');
  if (ban && settings.auto_ban && settings.auto_ban_champion_id) {
    return {
      actionId: ban.id,
      championId: settings.auto_ban_champion_id,
      completed: true,
      kind: 'ban',
    };
  }

  const pick = findMyAction(session, 'pick');
  const championId = choosePickChampion(session, settings, skipped);
  if (pick && settings.auto_pick && championId) {
    return {
      actionId: pick.id,
      championId,
      // Insta Lock is the difference between "show them what I am taking" and
      // "take it before anyone else can".
      completed: !!settings.insta_lock,
      kind: 'pick',
    };
  }

  return null;
}

function decisionKey(decision) {
  return `${decision.kind}:${decision.actionId}:${decision.championId}:${decision.completed ? 'lock' : 'hover'}`;
}

export function startChampSelectAutomation({ getSettings, champSelect, subscribe, onResult }) {
  // The session route emits on every change, and champ select changes
  // constantly -- every teammate's hover is an event. Without this, our pick
  // would be re-sent dozens of times per phase.
  let pending = null;
  // Set once the session itself shows the champion we asked for. A later
  // event with championId 0 is then a new game (dodge + requeue), not an echo.
  let echoed = false;
  let lastSession = null;
  // Champions the client refused this session (usually 409 before the ban
  // list updates). Cleared when champ select ends.
  let skipped = new Set();

  const apply = async (session) => {
    lastSession = session;
    if (!session) {
      pending = null;
      echoed = false;
      skipped = new Set();
      return;
    }

    // A refused first pick should fall through to the second in the same
    // tick when one is configured; with no fallback, the next event retries.
    for (;;) {
      const decision = decideAction(session, getSettings(), skipped);
      if (!decision) {
        // Our action finished (instalock completed) or it is not our turn.
        // Forgetting here is what lets the next lobby reuse action id 5.
        pending = null;
        echoed = false;
        return;
      }

      const mine = findMyAction(session, decision.kind);
      if (!mine) {
        pending = null;
        echoed = false;
        return;
      }

      const key = decisionKey(decision);
      const already =
        mine.championId === decision.championId && (!decision.completed || mine.completed);

      if (already) {
        pending = key;
        echoed = true;
        return;
      }

      // Same action ids as last game, but the slot is empty again: dodge into a
      // new Practice Tool lobby without a Delete/404 in between.
      if (pending === key && echoed && mine.championId === 0) {
        pending = null;
        echoed = false;
      }

      if (pending === key) return;

      pending = key;
      const result = await champSelect.commit(
        decision.actionId,
        decision.championId,
        decision.completed,
      );

      // Only remember a success. A refusal (409 when somebody banned it a moment
      // earlier, or a mid-transition rejection) leaves the phase open, and the
      // next event is a legitimate chance to try again.
      if (result.ok) {
        if (onResult) onResult(decision, result);
        return;
      }

      pending = null;
      if (onResult) onResult(decision, result);

      if (decision.kind !== 'pick') return;

      const nextSkipped = new Set(skipped);
      nextSkipped.add(decision.championId);
      if (!decideAction(session, getSettings(), nextSkipped)) return;
      skipped = nextSkipped;
    }
  };

  const unsubscribe = subscribe(SESSION_ROUTE, apply);

  return {
    // Settings can change while the session is quiet (nobody else hovering).
    // Re-run the last payload so a new champion or Insta Lock takes effect
    // without waiting for the next teammate event.
    refresh: () => apply(lastSession),
    stop: () => {
      pending = null;
      echoed = false;
      lastSession = null;
      skipped = new Set();
      if (typeof unsubscribe === 'function') unsubscribe();
    },
  };
}
