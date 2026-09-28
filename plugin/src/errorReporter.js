const MAX_REPORTS = 20;
const MAX_MESSAGE = 500;
const MAX_STACK = 4000;

let active = null;

export const PLUGIN_URL_MARK = 'plugins/Drake/';

export function ownedByPlugin(stack, filename) {
  return String(stack || '').includes(PLUGIN_URL_MARK) || String(filename || '').includes(PLUGIN_URL_MARK);
}

function describe(value) {
  if (value instanceof Error) {
    return { kind: value.name || 'Error', message: value.message || String(value), stack: value.stack || '' };
  }
  return { kind: 'Error', message: typeof value === 'string' ? value : safeString(value), stack: '' };
}

function safeString(value) {
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
}

export function installErrorReporter({ send, source, target = globalThis, ownsError = () => true }) {
  const seen = new Set();

  function report(kind, message, stack) {
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

  function reportError(value, extraStack = '') {
    const { kind, message, stack } = describe(value);
    if (!ownsError(stack, '')) return false;
    return report(kind, message, [stack, extraStack].filter(Boolean).join('\n'));
  }

  const onError = (event) => {
    const { kind, message, stack } = describe(event?.error ?? event?.message);
    if (!ownsError(stack, event?.filename)) return;
    report(kind, message, stack);
  };
  const onRejection = (event) => {
    reportError(event?.reason);
  };

  target.addEventListener?.('error', onError);
  target.addEventListener?.('unhandledrejection', onRejection);

  const reporter = {
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

export function reportReactError(error, info) {
  return active ? active.reportError(error, info?.componentStack || '') : false;
}

export function sendToTray({ port, token, fetchImpl = fetch }) {
  return (report) =>
    fetchImpl(`http://127.0.0.1:${port}/errors`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, ...report }),
    });
}
