import { describe, it, expect, vi } from 'vitest';
import { makeProxyFetch } from '../src/features/proxyFetch.js';

describe('makeProxyFetch', () => {
  it('proxies requests through local daemon when port and token are present', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        status: 200,
        text: JSON.stringify({ result: { content: [{ text: 'mock text' }] } }),
      }),
    });

    const proxy = makeProxyFetch({ port: 48151, token: 'abc-token', fetchImpl });
    const res = await proxy('https://mcp-api.op.gg/mcp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1 }),
    });

    expect(fetchImpl).toHaveBeenCalledWith(
      'http://127.0.0.1:48151/proxy',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          token: 'abc-token',
          url: 'https://mcp-api.op.gg/mcp',
          method: 'POST',
          body: { jsonrpc: '2.0', id: 1 },
          headers: { 'Content-Type': 'application/json' },
        }),
      }),
    );

    expect(res.ok).toBe(true);
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toContain('mock text');
    const json = await res.json();
    expect(json.result.content[0].text).toBe('mock text');
  });

  it('falls back to direct fetch when port or token is missing', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => 'direct response',
    });

    const proxy = makeProxyFetch({ port: 0, token: '', fetchImpl });
    const res = await proxy('https://mcp-api.op.gg/mcp');

    expect(fetchImpl).toHaveBeenCalledWith('https://mcp-api.op.gg/mcp', {});
    expect(await res.text()).toBe('direct response');
  });

  it('falls back to direct fetch when local proxy request fails', async () => {
    const fetchImpl = vi
      .fn()
      .mockRejectedValueOnce(new Error('Daemon down'))
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => 'direct fallback',
      });

    const proxy = makeProxyFetch({ port: 48151, token: 'token', fetchImpl });
    const res = await proxy('https://mcp-api.op.gg/mcp');

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(await res.text()).toBe('direct fallback');
  });
});
