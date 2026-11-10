import type { StreamingMode } from '../settings';

export type StreamingEffective = 'overlay' | 'in-client';

export interface OverlayChromePolicy {
  showInClientChrome: boolean;
  forceRevealOff: boolean;
}

export interface TrayHealth {
  record(ok: boolean): void;
  reachable(): boolean;
}

export function normalizeStreamingMode(value: unknown): StreamingMode {
  const v = String(value || '').trim().toLowerCase();
  if (v === 'on' || v === 'auto') return v;
  return 'off';
}

export function effectiveFrom(setting: unknown, toolRunning: boolean): StreamingEffective {
  const mode = normalizeStreamingMode(setting);
  if (mode === 'on') return 'overlay';
  if (mode === 'auto' && toolRunning) return 'overlay';
  return 'in-client';
}

export function overlayChromePolicy(effective: string): OverlayChromePolicy {
  const overlay = effective === 'overlay';
  return {
    showInClientChrome: !overlay,
    forceRevealOff: overlay,
  };
}

export function appliedEffective(desired: string, trayReachable: boolean): StreamingEffective {
  if (desired === 'overlay' && !trayReachable) return 'in-client';
  return desired === 'overlay' ? 'overlay' : 'in-client';
}

export function createTrayHealth({ threshold = 3 }: { threshold?: number } = {}): TrayHealth {
  let failures = 0;
  return {
    record(ok: boolean) {
      failures = ok ? 0 : failures + 1;
    },
    reachable() {
      return failures < threshold;
    },
  };
}
