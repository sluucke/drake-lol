import type { FetchLike } from '../lcu';
import { SESSION_ROUTE } from './champSelect';

export interface DodgeResponseLike {
  ok?: boolean;
  status?: number;
  text?: () => Promise<string>;
  json?: () => Promise<unknown>;
}

export interface GameDodge {
  state?: string;
  dodgeIds?: unknown[];
  phase?: string;
}

export interface GameflowSession {
  phase?: string;
  gameDodge?: GameDodge | null;
}

export interface GameflowDodgeBody {
  dodgeData: GameDodge;
  state: string;
  dodgeIds: unknown[];
  phase: string;
}

export interface DodgeStep {
  name: string;
  run: () => Promise<DodgeResponseLike | null | undefined>;
}

export interface ChampSelectExitOptions {
  attempts?: number;
  delayMs?: number;
  stableReads?: number;
}

export interface DodgeOptions {
  fetchImpl?: FetchLike;
  steps?: DodgeStep[];
  attempts?: number;
  delayMs?: number;
  postTimeoutMs?: number;
  onStatus?: (detail: string) => void;
}

export interface DodgeResult {
  ok: boolean;
  detail?: string;
  reason?: string;
}

export interface Dodge {
  dodge(): Promise<DodgeResult>;
}

export const TEAM_BUILDER_QUIT_ROUTE = '/lol-lobby-team-builder/champ-select/v1/session/quit';
export const GAMEFLOW_DODGE_ROUTE = '/lol-gameflow/v1/session/dodge';
export const GAMEFLOW_SESSION_ROUTE = '/lol-gameflow/v1/session';
export const GAMEFLOW_PHASE_ROUTE = '/lol-gameflow/v1/gameflow-phase';

export const LCDS_DODGE_BODY = ['', 'teambuilder-draft', 'quitV2', '{}'];
export const LCDS_DODGE_BODY_LEGACY = ['', 'teambuilder-draft', 'quitV2', ''];

export const DODGE_POST_TIMEOUT_MS = 4000;
export const DODGE_VERIFY_DELAY_MS = 400;
export const DODGE_VERIFY_ATTEMPTS = 16;
export const DODGE_VERIFY_INTERVAL_MS = 300;
export const DODGE_VERIFY_STABLE_READS = 2;

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export function withTimeout<T>(promise: T | PromiseLike<T>, ms: number, message = 'timed out'): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms);
    Promise.resolve(promise).then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

export const DODGE_ATTEMPTS = 5;
const DEFAULT_DELAY_MS = 250;

export function lcdsDodgeRoute(body: string[] = LCDS_DODGE_BODY): string {
  const params = new URLSearchParams({
    destination: 'lcdsServiceProxy',
    method: 'call',
    args: JSON.stringify(body),
  });
  return `/lol-login/v1/session/invoke?${params.toString()}`;
}

export const DODGE_ROUTE = lcdsDodgeRoute();

function explain(status: number): string {
  if (status === 404 || status === 400) {
    return 'you have to be in champ select to dodge';
  }
  return `the client refused (${status})`;
}

export async function readJson(res: DodgeResponseLike | null | undefined): Promise<unknown> {
  if (!res || typeof res.json !== 'function') return null;
  try {
    return await withTimeout(res.json(), 500, 'json timed out');
  } catch {
    return null;
  }
}

export async function hasChampSelectSession(fetchImpl: FetchLike = fetch): Promise<boolean> {
  try {
    const res = await fetchImpl(SESSION_ROUTE);
    return res.ok;
  } catch {
    return false;
  }
}

export async function readGameflowPhase(fetchImpl: FetchLike = fetch): Promise<string | null> {
  try {
    const res = await fetchImpl(GAMEFLOW_PHASE_ROUTE);
    if (!res.ok) return null;
    const body = await readJson(res);
    if (typeof body === 'string') return body;
    return (body as { phase?: string } | null)?.phase ?? null;
  } catch {
    return null;
  }
}

export async function readGameflowSession(fetchImpl: FetchLike = fetch): Promise<GameflowSession | null> {
  try {
    const res = await fetchImpl(GAMEFLOW_SESSION_ROUTE);
    if (!res.ok) return null;
    return (await readJson(res)) as GameflowSession | null;
  } catch {
    return null;
  }
}

export function buildGameflowDodgeBody(session: GameflowSession | null | undefined): GameflowDodgeBody | null {
  const dodge = session?.gameDodge;
  if (!dodge || typeof dodge !== 'object') return null;
  return {
    dodgeData: dodge,
    state: dodge.state ?? 'Invalid',
    dodgeIds: dodge.dodgeIds ?? [],
    phase: session?.phase ?? dodge.phase ?? 'ChampSelect',
  };
}

export async function leftChampSelect(fetchImpl: FetchLike = fetch): Promise<boolean> {
  if (await hasChampSelectSession(fetchImpl)) return false;
  const phase = await readGameflowPhase(fetchImpl);
  if (!phase) return true;
  return phase !== 'ChampSelect' && phase !== 'ReadyCheck';
}

export async function waitForChampSelectExit(fetchImpl: FetchLike = fetch, {
  attempts = DODGE_VERIFY_ATTEMPTS,
  delayMs = DODGE_VERIFY_INTERVAL_MS,
  stableReads = DODGE_VERIFY_STABLE_READS,
}: ChampSelectExitOptions = {}): Promise<boolean> {
  let stable = 0;
  for (let i = 0; i < attempts; i += 1) {
    if (await leftChampSelect(fetchImpl)) {
      stable += 1;
      if (stable >= stableReads) return true;
    } else {
      stable = 0;
    }
    if (i < attempts - 1 && delayMs > 0) await sleep(delayMs);
  }
  return false;
}

export function postAccepted(res: DodgeResponseLike | null | undefined): boolean {
  return !res || res.ok !== false;
}

export async function readResponseHint(res: DodgeResponseLike | null | undefined): Promise<string> {
  if (!res || typeof res.text !== 'function') return '';
  try {
    const text = await withTimeout(res.text(), 500, '');
    if (!text) return '';
    return text.length > 120 ? `${text.slice(0, 120)}…` : text;
  } catch {
    return '';
  }
}

export function postTeamBuilderQuit(fetchImpl: FetchLike = fetch): Promise<Response> {
  return fetchImpl(TEAM_BUILDER_QUIT_ROUTE, { method: 'POST' });
}

export function postLcdsDodge(fetchImpl: FetchLike = fetch, body: string[] = LCDS_DODGE_BODY): Promise<Response> {
  return fetchImpl(lcdsDodgeRoute(body), {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export async function postGameflowDodge(fetchImpl: FetchLike = fetch): Promise<Response | null> {
  const session = await readGameflowSession(fetchImpl);
  const payload = buildGameflowDodgeBody(session);
  if (!payload) return null;
  return fetchImpl(GAMEFLOW_DODGE_ROUTE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

export function dodgeSteps(fetchImpl: FetchLike = fetch): DodgeStep[] {
  return [
    {
      name: 'team-builder',
      run: () => postTeamBuilderQuit(fetchImpl),
    },
    {
      name: 'lcds',
      run: () => postLcdsDodge(fetchImpl, LCDS_DODGE_BODY),
    },
    {
      name: 'gameflow',
      run: async () => {
        const res = await postGameflowDodge(fetchImpl);
        if (res) return res;
        return { ok: false, status: 400 };
      },
    },
    {
      name: 'lcds-legacy',
      run: () => postLcdsDodge(fetchImpl, LCDS_DODGE_BODY_LEGACY),
    },
  ];
}

export function makeDodge({
  fetchImpl = fetch,
  steps = dodgeSteps(fetchImpl),
  attempts = DODGE_ATTEMPTS,
  delayMs = DEFAULT_DELAY_MS,
  postTimeoutMs = DODGE_POST_TIMEOUT_MS,
  onStatus = () => {},
}: DodgeOptions): Dodge {
  return {
    async dodge(): Promise<DodgeResult> {
      let reason = 'still in champ select';

      for (let i = 0; i < attempts; i += 1) {
        let accepted = false;
        for (const step of steps) {
          try {
            onStatus(`attempt ${i + 1}: ${step.name}…`);
            const res = await withTimeout(step.run(), postTimeoutMs, 'post timed out');
            const httpStatus = res?.status || 0;
            const hint = await readResponseHint(res);
            if (!postAccepted(res)) {
              reason = explain(httpStatus);
              onStatus(`attempt ${i + 1}: ${step.name} HTTP ${httpStatus}${hint ? ` (${hint})` : ''}`);
              continue;
            }
            accepted = true;
            onStatus(
              `attempt ${i + 1}: ${step.name} HTTP ${httpStatus || 200}${hint ? ` (${hint})` : ''}`,
            );
          } catch (e) {
            const message = (e as Error).message;
            reason = message === 'post timed out'
              ? 'the client did not respond in time'
              : `could not reach the client (${message})`;
            onStatus(`attempt ${i + 1}: ${step.name} ${reason}`);
          }
        }

        if (!accepted) {
          if (i < attempts - 1 && delayMs > 0) await sleep(delayMs);
          continue;
        }

        onStatus(`attempt ${i + 1}: waiting…`);
        if (DODGE_VERIFY_DELAY_MS > 0) await sleep(DODGE_VERIFY_DELAY_MS);
        if (await waitForChampSelectExit(fetchImpl)) {
          return { ok: true, detail: `left on attempt ${i + 1}` };
        }
        reason = 'still in champ select after the dodge call';
        onStatus(`attempt ${i + 1}: still in champ select`);
        if (i < attempts - 1 && delayMs > 0) await sleep(delayMs);
      }

      onStatus(`failed: ${reason}`);
      return { ok: false, reason };
    },
  };
}
