import type { FetchLike } from './lcu';

export interface ErrorReport {
  source: string;
  kind: string;
  message: string;
  stack?: string;
}

export type OwnsError = (stack: string, filename?: string) => boolean;

export interface ErrorLikeEvent {
  error?: unknown;
  message?: unknown;
  filename?: string;
  reason?: unknown;
}

export interface ErrorTarget {
  addEventListener?(type: string, listener: (event: ErrorLikeEvent) => void): void;
  removeEventListener?(type: string, listener: (event: ErrorLikeEvent) => void): void;
}

export interface ErrorReporterOptions {
  send: (report: ErrorReport) => unknown;
  source: string;
  target?: ErrorTarget;
  ownsError?: OwnsError;
}

export interface ErrorReporter {
  report(kind: string, message: unknown, stack?: unknown): boolean;
  reportError(value: unknown, extraStack?: string): boolean;
  stop(): void;
}

const MAX_REPORTS = 20;
const MAX_MESSAGE = 500;
const MAX_STACK = 4000;

let active: ErrorReporter | null = null;

export const PLUGIN_URL_MARK = 'plugins/Drake/';

export function ownedByPlugin(stack: unknown, filename?: unknown): boolean {
  return String(stack || '').includes(PLUGIN_URL_MARK) || String(filename || '').includes(PLUGIN_URL_MARK);
}

function describe(value: unknown): { kind: string; message: string; stack: string } {
  if (value instanceof Error) {
    return { kind: value.name || 'Error', message: value.message || String(value), stack: value.stack || '' };
  }
  return { kind: 'Error', message: typeof value === 'string' ? value : safeString(value), stack: '' };
}

function safeString(value: unknown): string {
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
}

export function installErrorReporter({
  send,
  source,
  target = globalThis,
  ownsError = () => true,
}: ErrorReporterOptions): ErrorReporter {
  const seen = new Set<string>();

  function report(kind: string, message: unknown, stack?: unknown): boolean {
    const text = String(message || '').slice(0, MAX_MESSAGE);
    const key = `${kind}|${text}`;
    if (!text || seen.has(key) || seen.size >= MAX_REPORTS) return false;
    seen.add(key);
    try {
      Promise.resolve(send({ source, kind, message: text, stack: stack ? String(stack).slice(0, MAX_STACK) : undefined })).catch(() => {});
    } catch {
      return false;
    }
    return true;
  }

  function reportError(value: unknown, extraStack = ''): boolean {
    const { kind, message, stack } = describe(value);
    if (!ownsError(stack, '')) return false;
    return report(kind, message, [stack, extraStack].filter(Boolean).join('\n'));
  }

  const onError = (event: ErrorLikeEvent) => {
    const { kind, message, stack } = describe(event?.error ?? event?.message);
    if (!ownsError(stack, event?.filename)) return;
    report(kind, message, stack);
  };
  const onRejection = (event: ErrorLikeEvent) => {
    reportError(event?.reason);
  };

  target.addEventListener?.('error', onError);
  target.addEventListener?.('unhandledrejection', onRejection);

  const reporter: ErrorReporter = {
    report,
    reportError,
    stop() {
      target.removeEventListener?.('error', onError);
      target.removeEventListener?.('unhandledrejection', onRejection);
      if (active === reporter) active = null;
    },
  };
  active = reporter;
  return reporter;
}

export function reportReactError(error: unknown, info?: { componentStack?: string | null } | null): boolean {
  return active ? active.reportError(error, info?.componentStack || '') : false;
}

export function sendToTray({
  port,
  token,
  fetchImpl = fetch,
}: {
  port: number;
  token: string;
  fetchImpl?: FetchLike;
}): (report: ErrorReport) => Promise<Response> {
  return (report) =>
    fetchImpl(`http://127.0.0.1:${port}/errors`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, ...report }),
    });
}
