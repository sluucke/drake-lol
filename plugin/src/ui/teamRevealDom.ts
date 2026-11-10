import { GAMEFLOW_PHASE_ROUTE } from '../features/dodge';
import { readGameflowPhase } from '../features/inGameIdle';
import {
  formatWl,
  readAssignedPosition,
  readLobbyKey,
  remapSnapshotToSession,
  refreshPickedChampionOnRows,
} from '../features/teamRevealStats';
import type { RevealSession, TeamRevealRow } from '../features/teamRevealStats';
import { collectRevealChatPairs, makeTeamRevealChat } from './teamRevealChat';
import type { ChatDataset, ChatDoc, ChatObserverCtor } from './teamRevealChat';
import { readMapSide } from '../features/mapSide';
import { muteTeammates } from '../features/muteAll';
import { sendChampSelectMessage } from '../features/champSelectChat';
import type { Lcu } from '../lcu';
import type { SubscribeFn, Unsubscribe } from '../subscribe';
import type { ScoutGame, ScoutRow } from '../app/store/types';
import type {
  MuteStatus,
  TeamRevealState,
  TeamRevealStatusPhase,
  TeamRevealTab,
} from '../app/store/teamRevealSlice';

export interface RevealLabel {
  dataset: ChatDataset;
  textContent?: string | null;
  innerHTML?: string;
  style?: { cssText: string } | null;
  parentElement?: { style?: { overflow: string; maxHeight: string; height: string } | null } | null;
  isConnected?: boolean;
  querySelector?(selectors: string): RevealLabel | null;
  getAttribute?(name: string): string | null;
  setAttribute?(name: string, value: string): void;
  removeAttribute?(name: string): void;
}

export interface RevealDoc {
  querySelectorAll(selectors: string): Iterable<RevealLabel>;
}

export type RevealSnapshotRow = TeamRevealRow & {
  summonerId?: number;
  obfuscatedPuuid?: string;
};

export type RevealViewRow = Omit<Partial<RevealSnapshotRow>, 'historyGames' | 'recentGames'> &
  ScoutRow & {
    pickedChampionName: string;
    seasonMostPlayedChampionName: string;
    recentGames: ScoutGame[];
  };

export interface RevealLoadHooks {
  signal?: AbortSignal;
  onProgress(rows: RevealSnapshotRow[]): void;
}

export interface RevealTiming {
  durationMs: number;
  teamSize: number;
}

export interface RevealBuildPanel {
  getStateSig?(): string;
  onUpdate?(listener: () => void): unknown;
  loadBuild?(): Promise<unknown>;
}

export type ChampNameLookup = (id: number) => string | null | undefined;

export interface TeamRevealDomOptions {
  doc: RevealDoc & ChatDoc;
  subscribe: SubscribeFn;
  loadSnapshot: (
    session: RevealSession,
    hooks: RevealLoadHooks,
  ) => Promise<RevealSnapshotRow[] | null | undefined>;
  lcu?: Pick<Lcu, 'get' | 'post'> | null;
  buildPanel?: RevealBuildPanel | null;
  muteTeammatesImpl?: typeof muteTeammates;
  sendChampSelectMessageImpl?: typeof sendChampSelectMessage;
  getChampName?: ChampNameLookup;
  getRecentPool?: () => string;
  getShowMapSide?: () => boolean;
  getAutoMute?: () => boolean;
  getAutoMessage?: () => string | null | undefined;
  onRevealTiming?: ((timing: RevealTiming) => void) | null;
  MutationObserverImpl?: ChatObserverCtor | null;
  publishView?: (view: TeamRevealState) => void;
}

export interface TeamRevealDom {
  setEnabled(next: boolean): void;
  handleSession(session: unknown): Promise<void>;
  toggleCards(tab?: TeamRevealTab | null): void;
  closeCards(): void;
  openCards(tab?: TeamRevealTab | null): void;
  isOpen(): boolean;
  getActiveTab(): TeamRevealTab;
  setActiveTab(tab: TeamRevealTab | null | undefined): void;
  muteAll(): Promise<void>;
  teardown(): void;
}

interface TeamIdentity {
  cellId: number;
  summonerId: number;
  puuid: string;
  obf: string;
}

type WlSource = Partial<Pick<RevealSnapshotRow, 'wins' | 'losses' | 'winRate' | 'matchesUsed' | 'riotId'>>;

const ORIGINAL_NAME_KEY = 'drakeTeamRevealOriginal';
const APPLIED_KEY = 'drakeTeamRevealApplied';
const ORIGINAL_HTML_KEY = 'drakeTeamRevealOriginalHtml';
const ORIGINAL_STYLE_KEY = 'drakeTeamRevealOriginalStyle';
const ROOT_KEY = 'drakeRevealRoot';

export const STATUS_READY_MS = 8000;

function toLabelNode(row: RevealLabel | null | undefined): RevealLabel | null {
  if (!row?.querySelector) return null;
  return (
    row.querySelector('[data-drake-summoner-name]') ||
    row.querySelector('.summoner-name') ||
    row.querySelector('[data-testid="summoner-name"]') ||
    row.querySelector('[data-testid*="summoner-name"]') ||
    row.querySelector('[class*="summoner-name"]') ||
    row.querySelector('[class*="summonerName"]')
  );
}

function readCellId(row: RevealLabel | null | undefined): number {
  return Number(row?.dataset?.cellId ?? row?.getAttribute?.('data-cell-id') ?? -1);
}

function readRowWl(row: WlSource) {
  return {
    wins: row.wins,
    losses: row.losses,
    winRate: row.winRate,
  };
}

function hasMatchWl(row: WlSource | null | undefined): boolean {
  return Number(row?.matchesUsed) > 0 || Number(row?.wins) + Number(row?.losses) > 0;
}

function isLiveRevealSession(session: unknown): session is RevealSession {
  const live = session as RevealSession | null | undefined;
  return Boolean(live && Array.isArray(live.myTeam) && live.myTeam.length);
}

function formatWlHtml(wins: number | undefined, losses: number | undefined, winRate: number | undefined): string {
  const w = wins ?? 0;
  const l = losses ?? 0;
  const total = w + l;
  const rate = winRate ?? (total ? Math.round((w / total) * 100) : 0);
  return `<span class="wl-win">${w}W</span>/<span class="wl-loss">${l}L</span> · ${rate}%`;
}

function formatRowName(_maskedName: string, snapshot: WlSource): string {
  if (!hasMatchWl(snapshot)) return snapshot.riotId || '';
  const wl = readRowWl(snapshot);
  return `${snapshot.riotId} (${formatWl(wl.wins, wl.losses, wl.winRate)})`;
}

function readLabelNodes(doc: RevealDoc): RevealLabel[] {
  const seen = new Set<RevealLabel>();
  const out: RevealLabel[] = [];
  const selectors = [
    '[data-testid="summoner-name"]',
    '[data-testid*="summoner-name"]',
    '.summoner-name',
    '[class*="summoner-name"]',
    '[class*="champ-select"] [class*="name"]',
  ];
  for (const selector of selectors) {
    for (const node of doc.querySelectorAll(selector)) {
      if (seen.has(node)) continue;
      seen.add(node);
      out.push(node);
    }
  }
  return out;
}

function findLabelsByCurrentNames(
  doc: RevealDoc,
  snapshot: RevealSnapshotRow[],
): { row: RevealSnapshotRow; label: RevealLabel }[] {
  const pool = readLabelNodes(doc).filter((node) => {
    if (node?.dataset?.[APPLIED_KEY]) return false;
    const text = String(node?.textContent || '').trim();
    return Boolean(text) && text.length <= 48;
  });
  const matched: { row: RevealSnapshotRow; label: RevealLabel }[] = [];
  const used = new Set<RevealLabel>();
  for (const row of snapshot) {
    const riotId = String(row?.riotId || '').trim().toLowerCase();
    const nameOnly = riotId.split('#')[0] || '';
    if (!riotId && !nameOnly) continue;
    const node = pool.find((entry) => {
      if (used.has(entry)) return false;
      const text = String(entry?.textContent || '').trim().toLowerCase();
      return text === riotId || text === nameOnly;
    });
    if (!node) continue;
    used.add(node);
    matched.push({ row, label: node });
  }
  return matched;
}

const LABEL_SIG_KEY = 'drakeRevealSig';

function stillShowsOurReveal(label: RevealLabel | null | undefined): boolean {
  if (!label?.dataset?.[APPLIED_KEY] && !label?.dataset?.[LABEL_SIG_KEY]) return false;
  if (label?.querySelector?.('.drake-reveal-name')) return true;
  const sig = String(label?.dataset?.[LABEL_SIG_KEY] || '');
  const riotId = sig.split('|')[0] || '';
  if (!riotId) return false;
  const text = String(label?.textContent || '').trim();
  return text === riotId || text.startsWith(`${riotId} `) || text.startsWith(`${riotId}(`);
}

function applyLabel(label: RevealLabel, info: RevealSnapshotRow): void {
  if (!label.dataset) label.dataset = {};
  const wl = readRowWl(info);
  const showWl = hasMatchWl(info);
  const sig = `${info.riotId}|${showWl ? `${wl.wins}|${wl.losses}|${wl.winRate}` : 'pending'}`;
  if (label.dataset[APPLIED_KEY] === '1' && label.dataset[LABEL_SIG_KEY] === sig) return;
  label.setAttribute?.('data-drake-reveal-root', '1');
  label.dataset[ROOT_KEY] = '1';
  if (!label.dataset[ORIGINAL_NAME_KEY]) {
    label.dataset[ORIGINAL_NAME_KEY] = label.textContent || '';
  }
  if (!label.dataset[ORIGINAL_HTML_KEY]) {
    label.dataset[ORIGINAL_HTML_KEY] = typeof label.innerHTML === 'string' ? label.innerHTML : '';
  }
  if (!label.dataset[ORIGINAL_STYLE_KEY]) {
    label.dataset[ORIGINAL_STYLE_KEY] = label.style?.cssText || '';
  }
  if (typeof label.innerHTML === 'string') {
    const stats = showWl
      ? `<span class="drake-reveal-stats">${formatWlHtml(wl.wins, wl.losses, wl.winRate)}</span>`
      : '';
    label.innerHTML = `<span class="drake-reveal-name">${info.riotId}</span>${stats}`;
    if (label.style) {
      label.style.cssText = `${label.dataset[ORIGINAL_STYLE_KEY]};display:flex;flex-direction:column;justify-content:flex-start;align-items:flex-start;white-space:normal;overflow:visible;text-overflow:clip;line-height:1.1;max-height:none;height:auto;`;
    }
    const parent = label.parentElement;
    if (parent?.style) {
      parent.style.overflow = 'visible';
      parent.style.maxHeight = 'none';
      parent.style.height = 'auto';
    }
  } else {
    label.textContent = formatRowName('', info);
  }
  label.dataset[APPLIED_KEY] = '1';
  label.dataset[LABEL_SIG_KEY] = sig;
}

export function withChampionNames(
  row: Partial<RevealSnapshotRow> | null | undefined,
  getChampName: ChampNameLookup,
): RevealViewRow {
  const { historyGames, ...rest }: Partial<RevealSnapshotRow> = row || {};
  const name = (id: number | undefined) => (id ? getChampName(Number(id)) || '' : '');
  return {
    ...rest,
    pickedChampionName: name(rest.pickedChampionId),
    seasonMostPlayedChampionName: name(rest.seasonMostPlayedChampionId),
    recentGames: (rest.recentGames || []).map((game) => ({ ...game, championName: name(game.championId) })),
  };
}

export function makeTeamRevealDom({
  doc,
  subscribe,
  loadSnapshot,
  lcu,
  buildPanel,
  muteTeammatesImpl = muteTeammates,
  sendChampSelectMessageImpl = sendChampSelectMessage,
  getChampName = () => '',
  getRecentPool = () => 'ranked_both',
  getShowMapSide = () => true,
  getAutoMute = () => false,
  getAutoMessage = () => '',
  onRevealTiming,
  MutationObserverImpl,
  publishView = () => {},
}: TeamRevealDomOptions): TeamRevealDom {
  const chat = makeTeamRevealChat({ doc, MutationObserverImpl });
  let enabled = false;
  let stopSession: Unsubscribe | null = null;
  let snapshot: RevealSnapshotRow[] = [];
  let currentSession: RevealSession | null = null;
  let open = false;
  let activeTab: TeamRevealTab = 'scouting';
  let boundLabels = new Map<number, RevealLabel>();
  let lastSessionSig = '';
  let lastLobbyKey = '';
  let lastTeam: TeamIdentity[] = [];
  let statusPhase: TeamRevealStatusPhase = 'hidden';
  let lastPhase = '';
  let pendingScrub = false;
  let loadGen = 0;
  let loadAbort: AbortController | null = null;
  let stopPhase: Unsubscribe | null = null;
  let muteStatus: MuteStatus = 'idle';
  let autoMutedLobbyKey = '';
  let lastAutoMessageLobbyKey = '';
  let statusSeq = 0;

  function publish() {
    const sideInfo = getShowMapSide() ? readMapSide(currentSession) : null;
    publishView({
      enabled,
      open,
      activeTab,
      statusPhase,
      statusSeq,
      muteStatus,
      side: sideInfo?.label ? { side: sideInfo.side, color: sideInfo.color } : null,
      rows: snapshot.map((row) => withChampionNames(row, getChampName)),
      buildSig: buildPanel?.getStateSig ? buildPanel.getStateSig() : '',
    });
  }

  function stopRevealLoad() {
    loadGen += 1;
    if (loadAbort) {
      loadAbort.abort();
      loadAbort = null;
    }
  }

  function clearReveal() {
    stopRevealLoad();
    restoreRows();
    chat.clear();
    pendingScrub = true;
    snapshot = [];
    currentSession = null;
    lastSessionSig = '';
    lastLobbyKey = '';
    lastTeam = [];
    muteStatus = 'idle';
    autoMutedLobbyKey = '';
    lastAutoMessageLobbyKey = '';
    open = false;
    renderVisibility();
    setStatus('hidden');
  }

  function scrubStaleRows() {
    if (!pendingScrub) return;
    restoreRows();
    pendingScrub = false;
  }

  function handlePhase(payload: unknown) {
    if (!enabled) return;
    const phase = readGameflowPhase(payload);
    if (!phase) return;
    const previous = lastPhase;
    lastPhase = phase;
    if (phase !== 'ChampSelect') {
      clearReveal();
      return;
    }
    if (previous && previous !== 'ChampSelect') {
      restoreRows();
      pendingScrub = false;
    } else {
      scrubStaleRows();
    }
  }

  function needsReapply() {
    if (!snapshot.length) return false;
    if (boundLabels.size === 0) return true;
    for (const label of boundLabels.values()) {
      if (label.isConnected === false) return true;
    }
    return false;
  }

  function applyPickRefresh(session: RevealSession) {
    if (!snapshot.length) return false;
    const { rows, changed } = refreshPickedChampionOnRows(snapshot, session, getRecentPool());
    if (!changed) return false;
    snapshot = rows;
    if (open) renderVisibility();
    return true;
  }

  function mergeRowsByCell(session: RevealSession) {
    if (!snapshot.length) return false;
    const team = Array.isArray(session?.myTeam) ? session.myTeam : [];
    const localCellId = Number(session?.localPlayerCellId ?? -1);
    const byCell = new Map(
      team.map((player) => [
        Number(player?.cellId),
        {
          assignedPosition: readAssignedPosition(player),
          puuid: String(player?.puuid || '').trim(),
          summonerId: Number(player?.summonerId) || 0,
          obfuscatedPuuid: String(player?.obfuscatedPuuid || '').trim(),
        },
      ]),
    );
    snapshot = snapshot.map((row) => {
      const cellId = Number(row.cellId);
      const next = byCell.get(cellId);
      if (!next) return row;
      const assignedPosition = next.assignedPosition || row.assignedPosition || '';
      const isLocalPlayer = cellId === localCellId;
      const puuid = next.puuid || row.puuid || '';
      const summonerId = next.summonerId || row.summonerId || 0;
      const obfuscatedPuuid = next.obfuscatedPuuid || row.obfuscatedPuuid || '';
      if (
        assignedPosition === (row.assignedPosition || '') &&
        Boolean(row.isLocalPlayer) === isLocalPlayer &&
        puuid === (row.puuid || '') &&
        summonerId === (row.summonerId || 0) &&
        obfuscatedPuuid === (row.obfuscatedPuuid || '')
      ) {
        return row;
      }
      return {
        ...row,
        assignedPosition,
        isLocalPlayer,
        puuid,
        summonerId,
        obfuscatedPuuid,
      };
    });
    return true;
  }

  function applyRemappedSnapshot(session: RevealSession) {
    if (!snapshot.length) return false;
    const { rows, changed, ok } = remapSnapshotToSession(snapshot, session);
    if (!ok) return false;
    if (!changed) return true;
    snapshot = rows;
    restoreRows();
    applyRows(snapshot);
    if (open) renderVisibility();
    return true;
  }

  function teamFingerprint(session: RevealSession): TeamIdentity[] {
    const team = Array.isArray(session?.myTeam) ? session.myTeam : [];
    return team
      .map((player) => ({
        cellId: Number(player?.cellId),
        summonerId: Number(player?.summonerId) || 0,
        puuid: String(player?.puuid || ''),
        obf: String(player?.obfuscatedPuuid || ''),
      }))
      .sort((a, b) => a.cellId - b.cellId);
  }

  function sameTeamIdentity(prev: TeamIdentity[], next: TeamIdentity[]): boolean {
    if (!prev.length || prev.length !== next.length) return false;
    return prev.every((left, index) => {
      const right = next[index];
      if (left.cellId !== right.cellId) return false;
      if (left.puuid && right.puuid && left.puuid !== right.puuid) return false;
      if (left.summonerId && right.summonerId && left.summonerId !== right.summonerId) return false;
      if (left.obf && right.obf && left.obf !== right.obf) return false;

      const shared =
        (left.puuid && right.puuid) ||
        (left.summonerId && right.summonerId) ||
        (left.obf && right.obf);
      if (shared) return true;

      const leftHas = Boolean(left.puuid || left.summonerId || left.obf);
      const rightHas = Boolean(right.puuid || right.summonerId || right.obf);
      if (leftHas && rightHas) return false;
      return true;
    });
  }

  function sessionSignature(session: RevealSession): string {
    return JSON.stringify(teamFingerprint(session));
  }

  async function handleMuteAll() {
    if (muteStatus === 'muting' || !currentSession || !lcu) return;
    muteStatus = 'muting';
    renderVisibility();
    try {
      const res = await muteTeammatesImpl(lcu, currentSession);
      muteStatus = res?.success ? 'muted' : 'failed';
    } catch {
      muteStatus = 'failed';
    }
    if (open) renderVisibility();
  }

  if (buildPanel?.onUpdate) {
    buildPanel.onUpdate(() => {
      if (open && activeTab === 'build') {
        renderVisibility();
      }
    });
  }

  function setStatus(phase: TeamRevealStatusPhase) {
    statusPhase = phase;
    statusSeq += 1;
    publish();
  }

  function renderVisibility() {
    publish();
  }

  function restoreRows() {
    const seen = new Set<RevealLabel>();
    const restore = (label: RevealLabel | null | undefined) => {
      if (!label || seen.has(label)) return;
      seen.add(label);
      if (label.dataset?.[ORIGINAL_NAME_KEY] || label.dataset?.[APPLIED_KEY]) restoreLabel(label);
    };
    for (const label of doc.querySelectorAll?.('[data-drake-reveal-root]') || []) restore(label);
    for (const row of doc.querySelectorAll('[data-cell-id]')) restore(toLabelNode(row));
    for (const label of readLabelNodes(doc)) restore(label);
    boundLabels = new Map();
  }

  function restoreLabel(label: RevealLabel) {
    if (stillShowsOurReveal(label)) {
      if (typeof label.innerHTML === 'string') {
        label.innerHTML = label.dataset[ORIGINAL_HTML_KEY] || label.dataset[ORIGINAL_NAME_KEY] || '';
      } else {
        label.textContent = label.dataset[ORIGINAL_NAME_KEY];
      }
      if (label.style) {
        label.style.cssText = label.dataset[ORIGINAL_STYLE_KEY] || '';
      }
    }
    delete label.dataset[ORIGINAL_NAME_KEY];
    delete label.dataset[ORIGINAL_HTML_KEY];
    delete label.dataset[ORIGINAL_STYLE_KEY];
    delete label.dataset[ROOT_KEY];
    label.removeAttribute?.('data-drake-reveal-root');
    delete label.dataset[APPLIED_KEY];
    delete label.dataset[LABEL_SIG_KEY];
  }

  function applyRows(rows: RevealSnapshotRow[]) {
    const byCell = new Map(rows.map((row) => [Number(row.cellId), row]));
    const used = new Set<RevealSnapshotRow>();

    for (const row of rows) {
      const key = Number(row?.cellId);
      const bound = boundLabels.get(key);
      if (!bound || bound.isConnected === false) continue;
      applyLabel(bound, row);
      used.add(row);
    }

    for (const row of doc.querySelectorAll('[data-cell-id]')) {
      const label = toLabelNode(row);
      if (!label) continue;
      if (!label.dataset) label.dataset = {};
      const cellId = readCellId(row);
      const info = byCell.get(cellId);
      if (!info?.riotId) continue;
      if (used.has(info)) continue;
      applyLabel(label, info);
      boundLabels.set(cellId, label);
      used.add(info);
    }

    const remaining = rows.filter((row) => !used.has(row) && row?.riotId);

    for (const { row, label } of findLabelsByCurrentNames(doc, remaining)) {
      applyLabel(label, row);
      boundLabels.set(Number(row.cellId), label);
      used.add(row);
    }

    const unmatched = remaining.filter((row) => !used.has(row));
    if (!unmatched.length) {
      syncChat();
      return;
    }

    const labels = readLabelNodes(doc).filter((label) => {
      if (!label?.dataset) label.dataset = {};
      return !label.dataset[APPLIED_KEY];
    });
    const count = Math.min(unmatched.length, labels.length);
    for (let index = 0; index < count; index += 1) {
      const label = labels[index];
      const info = unmatched[index];
      applyLabel(label, info);
      boundLabels.set(Number(info.cellId), label);
    }
    syncChat();
  }

  function syncChat() {
    chat.setEntries(collectRevealChatPairs(boundLabels, snapshot, ORIGINAL_NAME_KEY));
  }

  async function handleSession(session: unknown): Promise<void> {
    if (!enabled) return;
    if (!isLiveRevealSession(session)) {
      clearReveal();
      return;
    }

    scrubStaleRows();
    currentSession = session;

    const lobbyKey = readLobbyKey(session);
    const team = teamFingerprint(session);
    const newLobby = Boolean(lobbyKey && lastLobbyKey && lobbyKey !== lastLobbyKey);
    if (newLobby) {
      clearReveal();
      pendingScrub = false;
    }

    const currentLobbyId = lobbyKey || sessionSignature(session);
    if (getAutoMute() && lcu && currentLobbyId && autoMutedLobbyKey !== currentLobbyId) {
      autoMutedLobbyKey = currentLobbyId;
      void muteTeammatesImpl(lcu, session)
        .then((res) => {
          if (res?.success) {
            muteStatus = 'muted';
            if (open) renderVisibility();
          }
        })
        .catch(() => {});
    }

    const autoMessage = typeof getAutoMessage === 'function' ? String(getAutoMessage() || '').trim() : '';
    if (autoMessage && lcu && currentLobbyId && lastAutoMessageLobbyKey !== currentLobbyId) {
      lastAutoMessageLobbyKey = currentLobbyId;
      void sendChampSelectMessageImpl(lcu, session, autoMessage).catch(() => {});
    }

    if (snapshot.length && lastTeam.length && sameTeamIdentity(lastTeam, team)) {
      mergeRowsByCell(session);
      applyPickRefresh(session);
      if (needsReapply()) applyRows(snapshot);
      if (open) renderVisibility();
      if (lobbyKey) lastLobbyKey = lobbyKey;
      lastTeam = team;
      lastSessionSig = sessionSignature(session);
      return;
    } else if (snapshot.length && applyRemappedSnapshot(session)) {
      applyPickRefresh(session);
      if (needsReapply()) applyRows(snapshot);
      if (open) renderVisibility();
      if (lobbyKey) lastLobbyKey = lobbyKey;
      lastTeam = team;
      lastSessionSig = sessionSignature(session);
      return;
    }

    if (lobbyKey) lastLobbyKey = lobbyKey;
    lastTeam = team;

    const sig = sessionSignature(session);
    if (sig && sig === lastSessionSig) {
      mergeRowsByCell(session);
      if (snapshot.length && needsReapply()) applyRows(snapshot);
      if (open) renderVisibility();
      return;
    }

    stopRevealLoad();
    lastSessionSig = sig;
    const gen = loadGen;
    loadAbort = typeof AbortController === 'function' ? new AbortController() : null;
    const startedAt = Date.now();
    try {
      setStatus('loading');
      const next = await loadSnapshot(session, {
        signal: loadAbort?.signal,
        onProgress(rows: RevealSnapshotRow[]) {
          if (gen !== loadGen) return;
          snapshot = Array.isArray(rows) ? rows : [];
          mergeRowsByCell(session);
          applyRows(snapshot);
          if (open) renderVisibility();
        },
      });
      if (gen !== loadGen) return;
      snapshot = Array.isArray(next) ? next : [];
      mergeRowsByCell(session);
      applyPickRefresh(session);
      setStatus(snapshot.length ? 'ready' : 'hidden');
      if (snapshot.length) applyRows(snapshot);
      if (open) renderVisibility();
      if (typeof onRevealTiming === 'function' && snapshot.length) {
        onRevealTiming({
          durationMs: Date.now() - startedAt,
          teamSize: snapshot.length,
        });
      }
    } catch {
      if (gen !== loadGen) return;
      setStatus(snapshot.length ? 'ready' : 'hidden');
    }
  }

  function setEnabled(next: boolean) {
    if (next === enabled) return;
    enabled = next;
    if (enabled) {
      if (!stopPhase) {
        stopPhase = subscribe(GAMEFLOW_PHASE_ROUTE, (phase) => {
          handlePhase(phase);
        });
      }
      return;
    }
    if (stopSession) {
      stopSession();
      stopSession = null;
    }
    if (stopPhase) {
      stopPhase();
      stopPhase = null;
    }
    lastPhase = '';
    clearReveal();
  }

  function setActiveTab(tab: TeamRevealTab | null | undefined) {
    activeTab = tab || 'scouting';
    if (activeTab === 'build' && buildPanel?.loadBuild) {
      void buildPanel.loadBuild();
    }
    renderVisibility();
  }

  function openCards(tab?: TeamRevealTab | null) {
    if (!enabled) return;
    if (tab) activeTab = tab;
    open = true;
    if (activeTab === 'build' && buildPanel?.loadBuild) {
      void buildPanel.loadBuild();
    }
    if (snapshot.length && needsReapply()) applyRows(snapshot);
    renderVisibility();
    if (statusPhase !== 'loading' && snapshot.length) setStatus('ready');
  }

  function closeCards() {
    open = false;
    renderVisibility();
    setStatus(statusPhase === 'loading' ? 'loading' : snapshot.length ? 'ready' : 'hidden');
  }

  function toggleCards(tab?: TeamRevealTab | null) {
    if (!enabled) return;
    if (open) {
      if (tab && tab !== activeTab) {
        setActiveTab(tab);
        return;
      }
      closeCards();
      return;
    }
    openCards(tab || activeTab || 'scouting');
  }

  function teardown() {
    setEnabled(false);
  }

  return {
    setEnabled,
    handleSession,
    toggleCards,
    closeCards,
    openCards,
    isOpen: () => open,
    getActiveTab: () => activeTab,
    setActiveTab,
    muteAll: handleMuteAll,
    teardown,
  };
}
