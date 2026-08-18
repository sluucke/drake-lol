import { findMyAction, SESSION_ROUTE, unavailableChampionIds } from './champSelect.js';












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

  const pick = findMyAction(session, 'pick');
  const championId = choosePickChampion(session, settings, skipped);
  if (pick && settings.auto_pick && championId) {
    return {
      actionId: pick.id,
      championId,
      
      
      completed: !!settings.insta_lock,
      kind: 'pick',
    };
  }

  return null;
}

function decisionKey(decision) {
  return `${decision.kind}:${decision.actionId}:${decision.championId}:${decision.completed ? 'lock' : 'hover'}`;
}

export function startChampSelectAutomation({ getSettings, champSelect, subscribe, onResult, onSession }) {
  
  
  
  let pending = null;
  
  
  let echoed = false;
  let lastSession = null;
  
  
  let skipped = new Set();

  const apply = async (session) => {
    lastSession = session;
    if (onSession) onSession(session);
    if (!session) {
      pending = null;
      echoed = false;
      skipped = new Set();
      return;
    }

    
    
    for (;;) {
      const decision = decideAction(session, getSettings(), skipped);
      if (!decision) {
        
        
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
