import { CHAT_ME, readLol } from './presence.js';
import { GAMEFLOW_PHASE_ROUTE } from './dodge.js';
import { isInGamePhase, readGameflowPhase } from './inGameIdle.js';

export function readProfileRank(settings) {
  return {
    tier: String(settings?.profile_rank_tier || '').trim(),
    division: settings?.profile_rank_division || 'I',
    queue: settings?.profile_rank_queue || 'RANKED_SOLO_5x5',
    crystal: settings?.profile_rank_crystal || 'IRON',
  };
}

export function profileRankPatch({ tier, division, queue, crystal }) {
  return {
    profile_rank_tier: tier,
    profile_rank_division: division,
    profile_rank_queue: queue,
    profile_rank_crystal: crystal,
  };
}

export function rankNeedsRefresh(lol, cfg) {
  if (!cfg.tier) return false;
  return (
    lol.rankedLeagueTier !== cfg.tier ||
    lol.rankedLeagueDivision !== cfg.division ||
    lol.rankedLeagueQueue !== cfg.queue ||
    lol.challengeCrystalLevel !== cfg.crystal
  );
}

export async function applyProfileRank(presence, cfg) {
  if (!cfg.tier) return { ok: true };
  const rank = await presence.setRank({
    tier: cfg.tier,
    division: cfg.division,
    queue: cfg.queue,
  });
  if (!rank.ok) return rank;
  return presence.setBadges({ crystal: cfg.crystal });
}

export function startProfileRankRefresh({ subscribe, getSettings, presence, lcu }) {
  let refreshing = false;

  async function refreshIfNeeded() {
    if (refreshing) return;
    const cfg = readProfileRank(getSettings());
    if (!cfg.tier) return;
    let lol;
    try {
      lol = readLol(await lcu.get(CHAT_ME));
    } catch {
      return;
    }
    if (!rankNeedsRefresh(lol, cfg)) return;
    refreshing = true;
    try {
      await applyProfileRank(presence, cfg);
    } finally {
      refreshing = false;
    }
  }

  void refreshIfNeeded();

  return subscribe(GAMEFLOW_PHASE_ROUTE, (payload) => {
    const phase = readGameflowPhase(payload);
    if (!phase || isInGamePhase(phase)) return;
    void refreshIfNeeded();
  });
}
