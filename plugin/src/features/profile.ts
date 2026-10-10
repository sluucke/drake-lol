

import type { Lcu } from '../lcu';
import type { ActionResult } from './presence';

export interface RiotIdInput {
  gameName: string;
  tagLine: string;
}

export interface RawFriend {
  id?: string;
  puuid?: string;
  gameName?: string;
  name?: string;
  gameTag?: string;
  availability?: string;
  note?: string;
  statusMessage?: string;
  groupName?: string;
}

export interface Friend {
  id: string;
  name: string;
  riotId: string;
  availability: string;
  online: boolean;
  note: string;
  statusMessage: string;
  group: string;
}

export interface RiotIdSaver {
  save(raw: unknown): Promise<ActionResult>;
}

export const SAVE_ALIAS = '/lol-summoner/v1/save-alias';
export const FRIENDS_ROUTE = '/lol-chat/v1/friends';





export function splitRiotId(raw: unknown): RiotIdInput | null {
  const text = String(raw ?? '').trim();
  const at = text.lastIndexOf('#');
  if (at <= 0) return null;
  const gameName = text.slice(0, at).trim();
  const tagLine = text.slice(at + 1).trim();
  if (!gameName || !tagLine) return null;
  return { gameName, tagLine };
}

export function makeRiotId({ lcu }: { lcu: Pick<Lcu, 'post'> }): RiotIdSaver {
  return {
    async save(raw) {
      const parts = splitRiotId(raw);
      if (!parts) {
        return { ok: false, reason: 'enter it as name#tag' };
      }
      try {
        const res = await lcu.post(SAVE_ALIAS, parts);
        if (res && res.ok === false) {
          
          
          return { ok: false, reason: `the client refused it (${res.status})` };
        }
        return { ok: true };
      } catch (e) {
        return { ok: false, reason: `could not reach the client (${(e as Error).message})` };
      }
    },
  };
}

const OFFLINE = new Set<string | undefined>(['offline', 'mobile']);

export function normaliseFriends(raw: unknown): Friend[] {
  if (!Array.isArray(raw)) return [];
  return (raw as RawFriend[])
    .map((f): Friend => {
      const name = f.gameName || f.name || '';
      const tag = f.gameTag || '';
      return {
        id: f.id || f.puuid || name,
        name,
        riotId: tag ? `${name}#${tag}` : name,
        availability: f.availability || 'offline',
        online: !OFFLINE.has(f.availability),
        note: f.note || '',
        statusMessage: f.statusMessage || '',
        group: f.groupName || '',
      };
    })
    .filter((f) => f.name)
    
    
    .sort((a, b) => (a.online === b.online ? a.name.localeCompare(b.name) : a.online ? -1 : 1));
}







export async function removeAllFriends({
  lcu,
  friends,
}: {
  lcu: Pick<Lcu, 'delete'>;
  friends: Pick<Friend, 'id'>[] | null | undefined;
}): Promise<{ removed: number; failed: number }> {
  let removed = 0;
  let failed = 0;

  for (const f of friends || []) {
    try {
      const res = await lcu.delete(`${FRIENDS_ROUTE}/${f.id}`);
      if (res && res.ok === false) failed += 1;
      else removed += 1;
    } catch {
      failed += 1;
    }
  }

  return { removed, failed };
}

export async function loadFriends(lcu: Pick<Lcu, 'get'>): Promise<Friend[]> {
  try {
    return normaliseFriends(await lcu.get<RawFriend[] | null>(FRIENDS_ROUTE));
  } catch {
    return [];
  }
}
