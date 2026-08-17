import { describe, it, expect, vi } from 'vitest';
import { makeStatus, STATUS_ROUTE, normalise } from '../src/features/status.js';

describe('normalise', () => {
  it('keeps line breaks, which is the whole point', () => {
    // Measured against the live LCU: newlines survive the round trip and the
    // client renders them as real lines in the social panel.
    expect(normalise('a\nb\nc')).toBe('a\nb\nc');
  });

  it('folds CRLF to LF so pasted art does not double-space', () => {
    expect(normalise('a\r\nb')).toBe('a\nb');
  });

  it('leaves an empty message empty rather than sending whitespace', () => {
    expect(normalise('   ')).toBe('');
  });
});

describe('makeStatus', () => {
  it('reads the current status from the client', async () => {
    const lcu = { get: vi.fn().mockResolvedValue({ statusMessage: 'hello' }) };
    const s = makeStatus({ lcu });

    expect(await s.read()).toBe('hello');
    expect(lcu.get).toHaveBeenCalledWith(STATUS_ROUTE);
  });

  it('returns an empty string when the client has no status set', async () => {
    const lcu = { get: vi.fn().mockResolvedValue({}) };
    expect(await makeStatus({ lcu }).read()).toBe('');
  });

  it('survives the read failing instead of breaking the panel', async () => {
    const lcu = { get: vi.fn().mockRejectedValue(new Error('nope')) };
    expect(await makeStatus({ lcu }).read()).toBe('');
  });

  it('writes the message as a multiline status', async () => {
    const lcu = { put: vi.fn().mockResolvedValue({ ok: true }) };
    const s = makeStatus({ lcu });

    const result = await s.write('line one\nline two');

    expect(result.ok).toBe(true);
    expect(lcu.put).toHaveBeenCalledWith(STATUS_ROUTE, { statusMessage: 'line one\nline two' });
  });

  it('reports a failed write rather than claiming success', async () => {
    const lcu = { put: vi.fn().mockRejectedValue(new Error('offline')) };
    const result = await makeStatus({ lcu }).write('x');
    expect(result.ok).toBe(false);
    expect(result.reason).toBeTruthy();
  });

  it('reports a rejected write by status code', async () => {
    const lcu = { put: vi.fn().mockResolvedValue({ ok: false, status: 400 }) };
    const result = await makeStatus({ lcu }).write('x');
    expect(result.ok).toBe(false);
    expect(result.reason).toContain('400');
  });
});
