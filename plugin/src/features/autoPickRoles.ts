import type { SettingsValues } from '../settings';

export type AutoPickRoleId = 'TOP' | 'JUNGLE' | 'MIDDLE' | 'BOTTOM' | 'UTILITY';

export interface AutoPickRole {
  id: AutoPickRoleId;
  label: string;
}

export type AutoPickByRole = Record<AutoPickRoleId, number[]>;

export interface PickRolePlayer {
  cellId?: number;
  assignedPosition?: string;
  position?: string;
}

export interface PickRoleSession {
  localPlayerCellId?: number;
  myTeam?: (PickRolePlayer | null)[];
}

export const AUTO_PICK_ROLES: AutoPickRole[] = [
  { id: 'TOP', label: 'Top' },
  { id: 'JUNGLE', label: 'Jungle' },
  { id: 'MIDDLE', label: 'Mid' },
  { id: 'BOTTOM', label: 'ADC' },
  { id: 'UTILITY', label: 'Support' },
];

const ROLE_IDS = new Set<string>(AUTO_PICK_ROLES.map((role) => role.id));

export function emptyAutoPickByRole(): AutoPickByRole {
  return {
    TOP: [],
    JUNGLE: [],
    MIDDLE: [],
    BOTTOM: [],
    UTILITY: [],
  };
}

export function normalizeAutoPickByRole(raw: unknown): AutoPickByRole {
  const out = emptyAutoPickByRole();
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  const source = raw as Record<string, unknown>;
  for (const role of Object.keys(out) as AutoPickRoleId[]) {
    const value = source[role];
    const list: unknown[] = Array.isArray(value) ? value : [];
    const cleaned: number[] = [];
    for (const value of list) {
      const id = Number(value) || 0;
      if (id <= 0 || cleaned.includes(id)) continue;
      cleaned.push(id);
      if (cleaned.length >= 2) break;
    }
    out[role] = cleaned;
  }
  return out;
}

export function autoPickOrder(settings: SettingsValues | null | undefined, role: string | null | undefined): number[] {
  const key = String(role || '').trim().toUpperCase();
  if (!ROLE_IDS.has(key)) return [];
  return normalizeAutoPickByRole(settings?.auto_pick_by_role)[key as AutoPickRoleId];
}

export function toggleAutoPickChampion<T extends SettingsValues>(
  settings: T,
  role: string | null | undefined,
  championId: number | string | null | undefined,
): T {
  const key = String(role || '').trim().toUpperCase();
  const id = Number(championId) || 0;
  if (!ROLE_IDS.has(key) || !id) return settings;

  const byRole = normalizeAutoPickByRole(settings?.auto_pick_by_role);
  const current = byRole[key as AutoPickRoleId];
  let next: number[];
  if (current[0] === id) {
    next = current.slice(1);
  } else if (current[1] === id) {
    next = current.slice(0, 1);
  } else if (current.length === 0) {
    next = [id];
  } else if (current.length === 1) {
    next = [current[0], id];
  } else {
    next = [current[0], id];
  }
  return {
    ...settings,
    auto_pick_by_role: { ...byRole, [key]: next },
  };
}

export function isAutoPickRole(role: string | null | undefined): boolean {
  return ROLE_IDS.has(String(role || '').trim().toUpperCase());
}

export function localPlayerPickRole(session: PickRoleSession | null | undefined): AutoPickRoleId | '' {
  const team = Array.isArray(session?.myTeam) ? session.myTeam : [];
  const localCellId = Number(session?.localPlayerCellId);
  const me = team.find((player) => Number(player?.cellId) === localCellId);
  const raw = String(me?.assignedPosition ?? me?.position ?? '')
    .trim()
    .toUpperCase();
  if (!raw || raw === 'UNSELECTED' || raw === 'FILL') return '';
  return isAutoPickRole(raw) ? (raw as AutoPickRoleId) : '';
}
