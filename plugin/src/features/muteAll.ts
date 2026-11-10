import type { Lcu } from '../lcu';
import type { ChampSelectSession } from './champSelect';

export interface MutedPlayer {
  puuid?: string;
  summonerId?: number | string;
  obfuscatedPuuid?: string;
  obfuscatedSummonerId?: number | string;
}

export type MutedPlayersResponse = (MutedPlayer | null)[] | { mutedPlayers?: (MutedPlayer | null)[] } | null;

export interface MuteTeammatesResult {
  mutedCount: number;
  totalTeammates: number;
  success: boolean;
}

export const MUTE_TOGGLE_ROUTE = '/lol-champ-select/v1/toggle-player-muted';
export const MUTED_PLAYERS_ROUTE = '/lol-champ-select/v1/muted-players';

export function isPlayerMuted(
  player: MutedPlayer | null | undefined,
  mutedList: (MutedPlayer | null)[] | null | undefined,
): boolean {
  if (!player || !Array.isArray(mutedList) || !mutedList.length) return false;

  const pPuuid = player.puuid ? String(player.puuid).trim() : '';
  const pSummonerId = Number(player.summonerId) || 0;
  const pObfPuuid = player.obfuscatedPuuid ? String(player.obfuscatedPuuid).trim() : '';
  const pObfSummonerId = Number(player.obfuscatedSummonerId) || 0;

  return mutedList.some((m) => {
    if (!m) return false;
    const mPuuid = m.puuid ? String(m.puuid).trim() : '';
    const mSummonerId = Number(m.summonerId) || 0;
    const mObfPuuid = m.obfuscatedPuuid ? String(m.obfuscatedPuuid).trim() : '';
    const mObfSummonerId = Number(m.obfuscatedSummonerId) || 0;

    if (pPuuid && mPuuid && pPuuid === mPuuid) return true;
    if (pSummonerId && mSummonerId && pSummonerId === mSummonerId) return true;
    if (pObfPuuid && mObfPuuid && pObfPuuid === mObfPuuid) return true;
    if (pObfSummonerId && mObfSummonerId && pObfSummonerId === mObfSummonerId) return true;
    return false;
  });
}

export async function muteTeammates(
  lcu: Pick<Lcu, 'get' | 'post'> | null | undefined,
  session: ChampSelectSession | null | undefined,
): Promise<MuteTeammatesResult> {
  if (!lcu) {
    return { mutedCount: 0, totalTeammates: 0, success: false };
  }

  const localCellId = Number(session?.localPlayerCellId ?? -1);
  const teammates = Array.isArray(session?.myTeam)
    ? session.myTeam.filter((p) => Number(p?.cellId) !== localCellId)
    : [];

  if (!teammates.length) {
    return { mutedCount: 0, totalTeammates: 0, success: true };
  }

  let mutedList: (MutedPlayer | null)[] = [];
  try {
    const res = await lcu.get<MutedPlayersResponse>(MUTED_PLAYERS_ROUTE);
    if (Array.isArray(res)) {
      mutedList = res;
    } else if (Array.isArray(res?.mutedPlayers)) {
      mutedList = res.mutedPlayers;
    }
  } catch {
    mutedList = [];
  }

  const unmuted = teammates.filter((p) => !isPlayerMuted(p, mutedList));
  let mutedCount = 0;
  let success = true;

  for (const player of unmuted) {
    const payload = {
      puuid: player.puuid || '',
      summonerId: Number(player.summonerId) || 0,
      obfuscatedPuuid: player.obfuscatedPuuid || '',
      obfuscatedSummonerId: Number(player.obfuscatedSummonerId) || 0,
    };
    try {
      const res = await lcu.post(MUTE_TOGGLE_ROUTE, payload);
      if (res && res.ok === false) {
        success = false;
      } else {
        mutedCount += 1;
      }
    } catch {
      success = false;
    }
  }

  return {
    mutedCount,
    totalTeammates: teammates.length,
    success,
  };
}
