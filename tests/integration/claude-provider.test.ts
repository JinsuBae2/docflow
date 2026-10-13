import { describe, it, expect, vi } from 'vitest';
import { ClaudeProvider } from '../../src/main/ai/claude-provider';
import type { ContextSnapshot } from '../../src/shared/contracts';

const context: ContextSnapshot = { id: 'ctx', requestId: 'req', instruction: '검토', sources: [], decisions: [], proposalHistory: [], omittedIds: [], project: { name: 'test', goal: '', constraints: '' } };
const models = { data: [{ id: 'test-claude', display_name: 'Test Claude', capabilities: { structured_outputs: { supported: true } } }], has_more: false };
const response = { stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify({ message: '검토했습니다.', proposals: [] }) }] };
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });
async function events(provider: ClaudeProvider, signal = new AbortController().signal, model = 'test-claude') { const result = []; for await (const event of provider.run(context, signal, model)) result.push(event); return result; }

describe('Claude API provider', () => {
  it('does not contact the service without credentials', async () => {
    const request = vi.fn(); const provider = new ClaudeProvider(() => '', request);
    expect((await provider.getStatus()).connected).toBe(false);
    expect((await events(provider)).at(-1)).toMatchObject({ type: 'error' });
    expect(request).not.toHaveBeenCalled();
  });
  it('paginates model discovery and excludes models that explicitly lack structured outputs', async () => {
    const request = vi.fn().mockResolvedValueOnce(json({ data: [...models.data, { id: 'old', capabilities: { structured_outputs: { supported: false } } }], has_more: true, last_id: 'old' })).mockResolvedValueOnce(json({ data: [{ id: 'next', display_name: 'Next' }], has_more: false }));
    const provider = new ClaudeProvider(() => 'fixture-key', request);
    expect((await provider.listModels()).map(m => m.model)).toEqual(['test-claude', 'next']);
    expect(request.mock.calls[1][0]).toContain('after_id=old');
  });
  it('sends only supplied context with no tools and validates a complete response', async () => {
    const request = vi.fn().mockResolvedValueOnce(json(models)).mockResolvedValueOnce(json(response));
    const provider = new ClaudeProvider(() => 'fixture-key', request);
    expect((await events(provider)).at(-1)).toEqual({ type: 'result', response: { message: '검토했습니다.', proposals: [] } });
    const [url, options] = request.mock.calls[1]; const body = JSON.parse(options.body);
    expect(url).toBe('https://api.anthropic.com/v1/messages');
    expect(body.model).toBe('test-claude'); expect(body.tools).toBeUndefined();
    expect(JSON.parse(body.messages[0].content)).toEqual(context);
    expect(body.output_config.format.type).toBe('json_schema');
    expect(JSON.stringify(body.output_config.format.schema)).not.toMatch(/maxLength|minLength|maxItems|\$schema/);
    expect(options.redirect).toBe('error');
  });
  it.each(['max_tokens', 'refusal', 'tool_use'])('rejects incomplete or unexpected stop reason %s', async stop_reason => {
    const provider = new ClaudeProvider(() => 'fixture-key', vi.fn().mockResolvedValueOnce(json(models)).mockResolvedValueOnce(json({ ...response, stop_reason })));
    expect((await events(provider)).at(-1)).toMatchObject({ type: 'error' });
  });
  it('rejects invalid proposals and unavailable models without retrying a paid request', async () => {
    const request = vi.fn().mockResolvedValueOnce(json(models)).mockResolvedValueOnce(json({ ...response, content: [{ type: 'text', text: '{"message":"bad","proposals":[{}]}' }] }));
    expect((await events(new ClaudeProvider(() => 'fixture-key', request))).at(-1)).toMatchObject({ type: 'error' });
    expect(request).toHaveBeenCalledTimes(2);
    const missing = vi.fn().mockResolvedValue(json(models));
    expect((await events(new ClaudeProvider(() => 'fixture-key', missing), undefined, 'missing')).at(-1)).toMatchObject({ type: 'error' });
    expect(missing).toHaveBeenCalledTimes(1);
  });
  it('never includes service error payloads or keys in diagnostics', async () => {
    const provider = new ClaudeProvider(() => 'fixture-secret', vi.fn().mockResolvedValue(json({ error: { message: 'fixture-secret' } }, 401)));
    const status = await provider.getStatus(); expect(status.connected).toBe(false); expect(status.detail).not.toContain('fixture-secret');
  });
  it('cancels an in-flight request and emits no result', async () => {
    const controller = new AbortController();
    const request = vi.fn().mockResolvedValueOnce(json(models)).mockImplementationOnce((_url, options) => new Promise((_resolve, reject) => { options.signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true }); controller.abort(); }));
    const provider = new ClaudeProvider(() => 'fixture-key', request);
    expect((await events(provider, controller.signal)).at(-1)).toEqual({ type: 'cancelled' });
  });
  it('does not start a cancelled request', async () => {
    const request = vi.fn(); const controller = new AbortController(); controller.abort();
    expect(await events(new ClaudeProvider(() => 'fixture-key', request), controller.signal)).toEqual([{ type: 'cancelled' }]); expect(request).not.toHaveBeenCalled();
  });
  it('bounds network waits and aborts the underlying request on timeout', async () => {
    vi.useFakeTimers();
    try {
      const request = vi.fn().mockImplementation((_url, options) => new Promise((_resolve, reject) => options.signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true })));
      const result = events(new ClaudeProvider(() => 'fixture-key', request));
      await vi.advanceTimersByTimeAsync(25001);
      expect((await result).at(-1)).toMatchObject({ type: 'error', message: expect.stringContaining('초과') });
      expect(request.mock.calls[0][1].signal.aborted).toBe(true);
    } finally { vi.useRealTimers(); }
  });
});
