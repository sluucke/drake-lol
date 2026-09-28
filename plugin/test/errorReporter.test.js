import { describe, it, expect, vi } from 'vitest';
import { installErrorReporter, ownedByPlugin, reportReactError, sendToTray } from '../src/errorReporter.js';

function fakeTarget() {
  const listeners = {};
  return {
    addEventListener: (type, fn) => {
      listeners[type] = fn;
    },
    removeEventListener: (type) => {
      delete listeners[type];
    },
    fire: (type, event) => listeners[type]?.(event),
    listeners,
  };
}

function ownError(message) {
  const error = new TypeError(message);
  error.stack = `TypeError: ${message}\n    at build (https://plugins/Drake/index.js:1:200)`;
  return error;
}

describe('errorReporter', () => {
  it('reports errors thrown by Drake and ignores the client and other plugins', () => {
    const target = fakeTarget();
    const send = vi.fn(async () => {});
    const reporter = installErrorReporter({ send, source: 'plugin', target, ownsError: ownedByPlugin });

    target.fire('error', { error: ownError('x is undefined') });
    const foreign = new Error('riot broke');
    foreign.stack = 'Error: riot broke\n    at rcp (https://riot:1234/fe/lol-champ-select/index.js:1:1)';
    target.fire('error', { error: foreign });
    target.fire('unhandledrejection', { reason: 'no stack at all' });

    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][0]).toMatchObject({ source: 'plugin', kind: 'TypeError', message: 'x is undefined' });
    expect(send.mock.calls[0][0].stack).toContain('plugins/Drake/index.js');
    reporter.stop();
  });

  it('sends each error once and caps a session', () => {
    const target = fakeTarget();
    const send = vi.fn(async () => {});
    const reporter = installErrorReporter({ send, source: 'overlay', target });
    target.fire('error', { error: ownError('same') });
    target.fire('error', { error: ownError('same') });
    for (let i = 0; i < 40; i += 1) target.fire('unhandledrejection', { reason: ownError(`e${i}`) });
    expect(send).toHaveBeenCalledTimes(20);
    reporter.stop();
    expect(target.listeners).toEqual({});
  });

  it('adds the React component stack to render errors', () => {
    const send = vi.fn(async () => {});
    const reporter = installErrorReporter({ send, source: 'overlay', target: fakeTarget() });
    expect(reportReactError(ownError('bad render'), { componentStack: '\n    in BuildTab' })).toBe(true);
    expect(send.mock.calls[0][0].stack).toContain('in BuildTab');
    reporter.stop();
    expect(reportReactError(ownError('after stop'), {})).toBe(false);
  });

  it('never throws when the tray is unreachable', () => {
    const send = () => Promise.reject(new Error('offline'));
    const reporter = installErrorReporter({ send, source: 'overlay', target: fakeTarget() });
    expect(reporter.report('Error', 'boom', '')).toBe(true);
    reporter.stop();
  });

  it('posts to the tray with its token', async () => {
    const fetchImpl = vi.fn(async () => ({ ok: true }));
    await sendToTray({ port: 48151, token: 't0k', fetchImpl })({ source: 'plugin', kind: 'Error', message: 'm' });
    expect(fetchImpl).toHaveBeenCalledWith('http://127.0.0.1:48151/errors', expect.objectContaining({ method: 'POST' }));
    expect(JSON.parse(fetchImpl.mock.calls[0][1].body)).toEqual({ token: 't0k', source: 'plugin', kind: 'Error', message: 'm' });
  });
});
