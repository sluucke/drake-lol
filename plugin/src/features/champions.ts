import type { Lcu } from '../lcu';
import { gameDataUrl } from './assetUrl';

export interface Champion {
  id: number;
  name: string;
  alias: string;
}

export interface ChampionSummaryEntry {
  id: number;
  name?: string;
  alias?: string;
}








export const SUMMARY_ROUTE = '/lol-game-data/assets/v1/champion-summary.json';

export function iconUrl(championId: number | string): string {
  return gameDataUrl(`/lol-game-data/assets/v1/champion-icons/${championId}.png`);
}







const VARIANT_ID_FLOOR = 60000;

export function normaliseChampions(raw: unknown): Champion[] {
  if (!Array.isArray(raw)) return [];
  return (raw as (ChampionSummaryEntry | null | undefined)[])
    
    .filter((c): c is ChampionSummaryEntry & { name: string } => !!c && c.id > 0 && c.id < VARIANT_ID_FLOOR && !!c.name)
    .map((c): Champion => ({ id: c.id, name: c.name, alias: c.alias || c.name }))
    .sort((a, b) => a.name.localeCompare(b.name));
}




function fold(s: string): string {
  return String(s)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

export function searchChampions<T extends Pick<Champion, 'name' | 'alias'>>(list: T[], query: string): T[] {
  const q = fold(query).trim();
  if (!q) return list;
  return list.filter((c) => fold(c.name).includes(q) || fold(c.alias).includes(q));
}

export async function loadChampions(lcu: Pick<Lcu, 'get'>): Promise<Champion[]> {
  try {
    return normaliseChampions(await lcu.get<unknown>(SUMMARY_ROUTE));
  } catch {
    
    
    return [];
  }
}
