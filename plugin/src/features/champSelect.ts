import type { Lcu } from '../lcu';

export const SESSION_ROUTE = '/lol-champ-select/v1/session';

export type ChampSelectActionType = 'pick' | 'ban' | (string & {});

export interface ChampSelectAction {
  id: number;
  actorCellId: number;
  championId: number;
  completed: boolean;
  isInProgress: boolean;
  type: ChampSelectActionType;
  isAllyAction?: boolean;
  pickTurn?: number;
}

export interface ChampSelectPlayer {
  cellId?: number;
  championId?: number;
  championPickIntent?: number;
  assignedPosition?: string;
  puuid?: string;
  obfuscatedPuuid?: string;
  obfuscatedSummonerId?: number;
  nameVisibilityType?: string;
  summonerId?: number;
  gameName?: string;
  tagLine?: string;
  team?: number;
  selectedSkinId?: number;
  spell1Id?: number;
  spell2Id?: number;
}

export interface ChampSelectChatDetails {
  chatRoomName?: string;
  multiUserChatId?: string;
  mucJwtDto?: { channelClaim?: string };
}

export interface ChampSelectSession {
  localPlayerCellId?: number;
  actions?: ChampSelectAction[][];
  myTeam?: ChampSelectPlayer[];
  theirTeam?: ChampSelectPlayer[];
  bans?: { myTeamBans?: number[]; theirTeamBans?: number[] };
  timer?: { phase?: string; adjustedTimeLeftInPhase?: number; totalTimeInPhase?: number };
  chatDetails?: ChampSelectChatDetails;
  multiUserChatId?: string;
  chatRoomName?: string;
  gameId?: number;
  queueId?: number;
  isCustomGame?: boolean;
  errorCode?: unknown;
  httpStatus?: unknown;
}

export interface CommitResult {
  ok: boolean;
  hoverStatus?: number;
  completeStatus?: number;
  retry?: boolean;
  reason?: string;
}

export interface ChampSelect {
  getSession(): Promise<ChampSelectSession | null>;
  commit(
    actionId: number,
    championId: number,
    completed: boolean,
    type?: ChampSelectActionType,
  ): Promise<CommitResult>;
}

export function actionRoute(actionId: number | string): string {
  return `/lol-champ-select/v1/session/actions/${actionId}`;
}

export function actionCompleteRoute(actionId: number | string): string {
  return `/lol-champ-select/v1/session/actions/${actionId}/complete`;
}

function eachAction(session: ChampSelectSession | null | undefined): ChampSelectAction[] {
  const phases = (session && session.actions) || [];
  return phases.flat ? phases.flat() : ([] as ChampSelectAction[]).concat(...phases);
}

export function findMyQueuedAction(
  session: ChampSelectSession | null | undefined,
  type: ChampSelectActionType,
): ChampSelectAction | null {
  if (!session || session.localPlayerCellId === undefined) return null;
  for (const a of eachAction(session)) {
    if (a.type !== type) continue;
    if (a.actorCellId !== session.localPlayerCellId) continue;
    if (a.completed) continue;
    return a;
  }
  return null;
}

export function findMyAction(
  session: ChampSelectSession | null | undefined,
  type: ChampSelectActionType,
): ChampSelectAction | null {
  const action = findMyQueuedAction(session, type);
  if (!action || !action.isInProgress) return null;
  return action;
}

/// Outside champ select the endpoint answers 404 with a JSON error body, so a
/// non-null payload is not on its own proof of a live champ select.
export function isChampSelectSession(value: unknown): value is ChampSelectSession {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const session = value as ChampSelectSession;
  if (session.errorCode || session.httpStatus) return false;
  if (Array.isArray(session.actions) || Array.isArray(session.myTeam)) return true;
  return typeof session.localPlayerCellId === 'number';
}

export function isBanPhase(session: ChampSelectSession | null | undefined): boolean {
  return eachAction(session).some((a) => a.type === 'ban' && a.isInProgress && !a.completed);
}

export function isPlanningPhase(session: ChampSelectSession | null | undefined): boolean {
  return String(session?.timer?.phase || '') === 'PLANNING';
}

export function unavailableChampionIds(session: ChampSelectSession | null | undefined): Set<number> {
  const ids = new Set<number>();
  if (!session) return ids;
  const bans = session.bans || {};
  for (const id of bans.myTeamBans || []) if (id) ids.add(id);
  for (const id of bans.theirTeamBans || []) if (id) ids.add(id);
  for (const a of eachAction(session)) {
    if (a.completed && a.championId) ids.add(a.championId);
  }
  return ids;
}

function accepted(res: Response | null | undefined): boolean {
  if (!res) return false;
  if (typeof res.ok === 'boolean') return res.ok;
  return res.ok !== false;
}

function statusOf(res: Response | null | undefined): number {
  return res && res.status !== undefined ? res.status : 0;
}

export function makeChampSelect({ lcu }: { lcu: Lcu }): ChampSelect {
  return {
    async getSession() {
      const session = await lcu.get<unknown>(SESSION_ROUTE);
      return isChampSelectSession(session) ? session : null;
    },

    async commit(actionId, championId, completed, type = 'pick'): Promise<CommitResult> {
      try {
        if (completed) {
          const locked = await lcu.patch(actionRoute(actionId), {
            championId,
            completed: true,
            type,
          });
          if (accepted(locked)) return { ok: true, hoverStatus: statusOf(locked) };
        }

        const pick = await lcu.patch(actionRoute(actionId), { championId });
        const hoverStatus = statusOf(pick);
        if (!accepted(pick)) {
          return { ok: false, hoverStatus, reason: `the client refused it (${hoverStatus})` };
        }
        if (!completed) return { ok: true, hoverStatus };

        const done = await lcu.post(actionCompleteRoute(actionId));
        const completeStatus = statusOf(done);
        if (!accepted(done)) {
          const what = type === 'ban' ? 'ban' : 'lock';
          return {
            ok: false,
            retry: true,
            hoverStatus,
            completeStatus,
            reason: `the client would not ${what} it (${completeStatus})`,
          };
        }
        return { ok: true, hoverStatus, completeStatus };
      } catch (e) {
        return { ok: false, reason: `could not reach the client (${(e as Error).message})` };
      }
    },
  };
}
