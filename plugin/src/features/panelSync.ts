export type PanelSyncDecision = 'noop' | 'reject' | 'apply';

export interface PanelSyncOptions {
  now?: () => number;
  ignoreMs?: number;
}

export interface PanelSync {
  localChange(open: boolean): void;
  remote(wantOpen: unknown, panelOpen: unknown): PanelSyncDecision;
}

export function createPanelSync({ now = () => Date.now(), ignoreMs = 1500 }: PanelSyncOptions = {}): PanelSync {
  let ignoreOpenUntil = 0;
  return {
    localChange(open: boolean) {
      ignoreOpenUntil = open ? 0 : now() + ignoreMs;
    },
    remote(wantOpen: unknown, panelOpen: unknown): PanelSyncDecision {
      if (!!wantOpen === !!panelOpen) return 'noop';
      if (wantOpen && now() < ignoreOpenUntil) return 'reject';
      return 'apply';
    },
  };
}
