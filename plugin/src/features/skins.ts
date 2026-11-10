import type { Lcu } from '../lcu';
import { gameDataUrl } from './assetUrl';
import type { ActionResult } from './presence';

export interface RawSkin {
  id?: number;
  name?: string;
  tilePath?: string;
}

export type SkinsPayload = Record<string, RawSkin | null> | (RawSkin | null)[] | null | undefined;

export interface SkinTile {
  id: number;
  name: string;
  tile: string;
}

export interface Background {
  set(skinId: number | string): Promise<ActionResult>;
}










export const SKINS_ROUTE = '/lol-game-data/assets/v1/skins.json';
export const PROFILE_ROUTE = '/lol-summoner/v1/current-summoner/summoner-profile';

function fold(s: unknown): string {
  return String(s)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

export function normaliseSkins(raw: SkinsPayload): SkinTile[] {
  if (!raw || typeof raw !== 'object') return [];
  return Object.values(raw)
    .filter((s): s is Required<RawSkin> => Boolean(s && s.id && s.name && s.tilePath))
    .map((s) => ({ id: s.id, name: s.name, tile: gameDataUrl(s.tilePath) }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function searchSkins<T extends { name: string }>(list: T[], query: unknown): T[] {
  const q = fold(query).trim();
  if (!q) return list;
  return list.filter((s) => fold(s.name).includes(q));
}

export async function loadSkins(lcu: Pick<Lcu, 'get'>): Promise<SkinTile[]> {
  try {
    return normaliseSkins(await lcu.get<SkinsPayload>(SKINS_ROUTE));
  } catch {
    return [];
  }
}

export function makeBackground({ lcu }: { lcu: Pick<Lcu, 'post'> }): Background {
  return {
    async set(skinId) {
      try {
        
        const res = await lcu.post(PROFILE_ROUTE, {
          key: 'backgroundSkinId',
          value: Number(skinId),
        });
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
