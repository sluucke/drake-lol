import { createContext, useContext } from 'react';
import type { DodgeResult } from '../../features/dodge';
import { EMPTY_TOTALS } from '../../features/loot';
import type { DisenchantEntry, DisenchantOptions, DisenchantResult, LootItem } from '../../features/loot';
import type { ActionResult } from '../../features/presence';
import type { removeAllFriends } from '../../features/profile';
import type { RestartUxResult } from '../../features/restartUx';
import type { RevealResult } from '../../features/reveal';
import type { UpdateApplyResult } from '../../features/update';
import type { SettingsPatch } from '../../settings';
import type { ProfileRankDraft } from '../store/sessionSlice';
import type { TeamRevealTab } from '../store/teamRevealSlice';

export type OnboardAction = 'skip' | 'tour' | 'tour-next';

export type RemoveAllFriendsResult = Awaited<ReturnType<typeof removeAllFriends>>;

export type DodgeActionResult = DodgeResult & { busy?: boolean };

export interface LegacyActions {
  navigate(id: string): void | Promise<void>;
  close(): void;
  openUrl(url: string): void;
  setSettings(patch: SettingsPatch): Promise<ActionResult>;
  saveStatus(text: string): Promise<ActionResult>;
  revealLobby(providerId: string): Promise<RevealResult>;
  dodge(): Promise<DodgeActionResult>;
  checkUpdates(): Promise<void>;
  installUpdate(): Promise<UpdateApplyResult>;
  installRequiredUpdate(): Promise<void>;
  restartClient(): Promise<RestartUxResult>;
  selectProfileTab(tab: string): Promise<void>;
  applyProfileRank(draft: ProfileRankDraft): Promise<ActionResult>;
  resetProfileRank(): Promise<ActionResult>;
  removeBadges(): Promise<ActionResult>;
  cloneBadge(): Promise<ActionResult>;
  saveRiotId(raw: string): Promise<ActionResult>;
  setBackground(id: number): Promise<ActionResult>;
  removeAllFriends(): Promise<RemoveAllFriendsResult>;
  onboard(action: OnboardAction): Promise<void>;
  dismissWhatsNew(target?: string): Promise<boolean | void>;
  openScouting(): void;
  closeScouting(): void;
  setScoutingTab(tab: TeamRevealTab): void;
  muteScouting(): void | Promise<void>;
  loadBuild(): void | Promise<void>;
  setBuildTier(value: string): void;
  setBuildRegion(value: string): void;
  retryBuild(): void | Promise<void>;
  showAllRanks(): void;
  viewPlayerBuild(riotId: string, region: string): void | Promise<void>;
  clearPlayerBuild(): void;
  applyBuildRunes(index: number): void | Promise<void>;
  applyBuildSpells(index: number): void | Promise<void>;
  applyBuildItems(): void | Promise<void>;
  cancelQueue(): Promise<void>;
  loadLoot(): Promise<LootItem[]>;
  disenchantLoot(plan: readonly DisenchantEntry[], options?: DisenchantOptions): Promise<DisenchantResult>;
  togglePanel(): void;
  setOverlayDragging?(dragging: boolean): void;
}

const resolved = async (): Promise<ActionResult> => ({ ok: true });

export const NOOP_ACTIONS: LegacyActions = {
  navigate() {},
  close() {},
  openUrl() {},
  setSettings: resolved,
  saveStatus: resolved,
  revealLobby: async () => ({ ok: true, count: 0 }),
  dodge: resolved,
  checkUpdates: async () => {},
  installUpdate: async () => ({ ok: true, installing: true, upToDate: true }),
  installRequiredUpdate: async () => {},
  restartClient: resolved,
  selectProfileTab: async () => {},
  applyProfileRank: resolved,
  resetProfileRank: resolved,
  removeBadges: resolved,
  cloneBadge: resolved,
  saveRiotId: resolved,
  setBackground: resolved,
  removeAllFriends: async () => ({ removed: 0, failed: 0 }),
  onboard: async () => {},
  dismissWhatsNew: async () => {},
  openScouting() {},
  closeScouting() {},
  setScoutingTab() {},
  muteScouting: async () => {},
  loadBuild: async () => {},
  setBuildTier() {},
  setBuildRegion() {},
  retryBuild: async () => {},
  showAllRanks() {},
  viewPlayerBuild: async () => {},
  clearPlayerBuild() {},
  applyBuildRunes: async () => {},
  applyBuildSpells: async () => {},
  applyBuildItems: async () => {},
  cancelQueue: async () => {},
  loadLoot: async () => [],
  disenchantLoot: async () => ({ done: [], failed: [], skipped: [], cancelled: false, gained: { ...EMPTY_TOTALS }, inventory: [] }),
  togglePanel() {},
  setOverlayDragging() {},
};

export const LegacyActionsContext = createContext<LegacyActions>(NOOP_ACTIONS);

export function useLegacyActions(): LegacyActions {
  return useContext(LegacyActionsContext);
}
