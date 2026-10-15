import { describe, it, expect, vi } from 'vitest';
import { ClaudeProvider } from '../../src/main/ai/claude-provider';
import type { ContextSnapshot } from '../../src/shared/contracts';

const context: ContextSnapshot = {
  id: 'ctx',
  requestId: 'req',
  instruction: '검토',
  sources: [],
  decisions: [],
  proposalHistory: [],
  omittedIds: [],
  project: { name: 'test', goal: '', constraints: '' },
};
const models = {
  data: [
    {
      id: 'test-claude',
      display_name: 'Test Claude',
      capabilities: { structured_outputs: { supported: true } },
    },
  ],
  has_more: false,
};
const response = {
  stop_reason: 'end_turn',
  content: [{ type: 'text', text: JSON.stringify({ message: '검토했습니다.', proposals: [] }) }],
};
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });
async function events(
  provider: ClaudeProvider,
  signal = new AbortController().signal,
  model = 'test-claude',
) {
  const result = [];
  for await (const event of provider.run(context, signal, model)) result.push(event);
  return result;
}

describe('Claude API provider', () => {
  it('blocks empty document evidence before any API or model discovery request', async () => {
    const request = vi.fn();
    const provider = new ClaudeProvider(() => 'fixture-key', request);
    const result = [];
    for await (const event of provider.run(
      { ...context, requiresEvidence: true },
      new AbortController().signal,
      'test-claude',
    ))
      result.push(event);
    expect(result.at(-1)).toMatchObject({
      type: 'error',
      message: expect.stringContaining('원문 근거'),
    });
    expect(request).not.toHaveBeenCalled();
  });
  it('uses planning instructions and keeps selection diagnostics out of the AI payload', async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce(json(models))
      .mockResolvedValueOnce(json(response));
    const provider = new ClaudeProvider(() => 'fixture-key', request);
    for await (const event of provider.run(
      {
        ...context,
        selection: {
          mode: 'full',
          limit: 60000,
          usedCharacters: 100,
          estimatedInputTokens: 100,
          omitted: [],
          omittedDecisions: 0,
          omittedHistory: 0,
        },
      },
      new AbortController().signal,
      'test-claude',
    ))
      void event;
    const body = JSON.parse(request.mock.calls[1][1].body);
    expect(JSON.stringify(body.system)).toContain('in-app planning conversation');
    expect(JSON.stringify(body.messages)).not.toContain('estimatedInputTokens');
  });
  it('forwards the explicit analysis output budget', async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce(json(models))
      .mockResolvedValueOnce(json(response));
    const provider = new ClaudeProvider(() => 'fixture-key', request);
    for await (const _ of provider.run(
      {
        ...context,
        budget: {
          contextTokens: 32768,
          inputTokens: 16384,
          outputTokens: 4096,
          reserveTokens: 8192,
        },
      },
      new AbortController().signal,
      'test-claude',
    ))
      void _;
    expect(JSON.parse(request.mock.calls[1][1].body).max_tokens).toBe(4096);
  });
  it('retains measured usage when cancellation arrives after the response body', async () => {
    const controller = new AbortController();
    const request = vi
      .fn()
      .mockResolvedValueOnce(json(models))
      .mockImplementationOnce(async () => {
        controller.abort();
        return json({
          ...response,
          usage: {
            input_tokens: 10,
            output_tokens: 2,
            cache_read_input_tokens: 0,
            cache_creation_input_tokens: 0,
          },
        });
      });
    const result = await events(
      new ClaudeProvider(() => 'fixture-key', request),
      controller.signal,
    );
    expect(result.find((e) => e.type === 'usage')).toMatchObject({ usage: { totalTokens: 12 } });
    expect(result.at(-1)).toMatchObject({ type: 'cancelled' });
  });
  it('reports usage and response rate limits even when generated output is incomplete', async () => {
    const measured = {
      ...response,
      stop_reason: 'max_tokens',
      model: 'test-claude',
      usage: {
        input_tokens: 100,
        output_tokens: 50,
        cache_read_input_tokens: 40,
        cache_creation_input_tokens: 10,
      },
    };
    const request = vi
      .fn()
      .mockResolvedValueOnce(json(models))
      .mockResolvedValueOnce(
        new Response(JSON.stringify(measured), {
          headers: {
            'anthropic-ratelimit-tokens-limit': '40000',
            'anthropic-ratelimit-tokens-remaining': '35000',
          },
        }),
      );
    const provider = new ClaudeProvider(() => 'fixture-key', request);
    const result = await events(provider);
    expect(result.find((e) => e.type === 'usage')).toMatchObject({
      model: 'test-claude',
      usage: { totalTokens: 200 },
      limits: { source: 'response', windows: [{ remaining: 35000 }] },
    });
    expect(result.at(-1)).toMatchObject({ type: 'error' });
    const before = request.mock.calls.length;
    expect((await provider.getUsageLimits()).windows[0].remaining).toBe(35000);
    expect(request).toHaveBeenCalledTimes(before);
  });
  it('keeps reported usage on HTTP failures while hiding raw error bodies', async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce(json(models))
      .mockResolvedValueOnce(
        json(
          {
            error: { message: 'fixture-secret' },
            usage: {
              input_tokens: 10,
              output_tokens: 2,
              cache_read_input_tokens: 0,
              cache_creation_input_tokens: 0,
            },
          },
          429,
        ),
      );
    const result = await events(new ClaudeProvider(() => 'fixture-secret', request));
    expect(result.find((e) => e.type === 'usage')).toMatchObject({ usage: { totalTokens: 12 } });
    expect(JSON.stringify(result)).not.toContain('fixture-secret');
    expect(result.at(-1)).toMatchObject({ type: 'error' });
  });
  it('does not contact the service without credentials', async () => {
    const request = vi.fn();
    const provider = new ClaudeProvider(() => '', request);
    expect((await provider.getStatus()).connected).toBe(false);
    expect((await events(provider)).at(-1)).toMatchObject({ type: 'error' });
    expect(request).not.toHaveBeenCalled();
  });
  it('paginates model discovery and excludes models that explicitly lack structured outputs', async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce(
        json({
          data: [
            ...models.data,
            { id: 'old', capabilities: { structured_outputs: { supported: false } } },
          ],
          has_more: true,
          last_id: 'old',
        }),
      )
      .mockResolvedValueOnce(
        json({ data: [{ id: 'next', display_name: 'Next' }], has_more: false }),
      );
    const provider = new ClaudeProvider(() => 'fixture-key', request);
    expect((await provider.listModels()).map((m) => m.model)).toEqual(['test-claude', 'next']);
    expect(request.mock.calls[1][0]).toContain('after_id=old');
  });
  it('sends only supplied context with no tools and validates a complete response', async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce(json(models))
      .mockResolvedValueOnce(json(response));
    const provider = new ClaudeProvider(() => 'fixture-key', request);
    expect((await events(provider)).at(-1)).toEqual({
      type: 'result',
      response: { message: '검토했습니다.', proposals: [] },
    });
    const [url, options] = request.mock.calls[1];
    const body = JSON.parse(options.body);
    expect(url).toBe('https://api.anthropic.com/v1/messages');
    expect(body.model).toBe('test-claude');
    expect(body.tools).toBeUndefined();
    expect(JSON.parse(body.messages[0].content)).toEqual(context);
    expect(body.output_config.format.type).toBe('json_schema');
    expect(JSON.stringify(body.output_config.format.schema)).not.toMatch(
      /maxLength|minLength|maxItems|\$schema/,
    );
    expect(options.redirect).toBe('error');
  });
  it.each(['max_tokens', 'refusal', 'tool_use'])(
    'rejects incomplete or unexpected stop reason %s',
    async (stop_reason) => {
      const provider = new ClaudeProvider(
        () => 'fixture-key',
        vi
          .fn()
          .mockResolvedValueOnce(json(models))
          .mockResolvedValueOnce(json({ ...response, stop_reason })),
      );
      expect((await events(provider)).at(-1)).toMatchObject({ type: 'error' });
    },
  );
  it('rejects invalid proposals and unavailable models without retrying a paid request', async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce(json(models))
      .mockResolvedValueOnce(
        json({
          ...response,
          content: [{ type: 'text', text: '{"message":"bad","proposals":[{}]}' }],
        }),
      );
    expect((await events(new ClaudeProvider(() => 'fixture-key', request))).at(-1)).toMatchObject({
      type: 'error',
    });
    expect(request).toHaveBeenCalledTimes(2);
    const missing = vi.fn().mockResolvedValue(json(models));
    expect(
      (await events(new ClaudeProvider(() => 'fixture-key', missing), undefined, 'missing')).at(-1),
    ).toMatchObject({ type: 'error' });
    expect(missing).toHaveBeenCalledTimes(1);
  });
  it('never includes service error payloads or keys in diagnostics', async () => {
    const provider = new ClaudeProvider(
      () => 'fixture-secret',
      vi.fn().mockResolvedValue(json({ error: { message: 'fixture-secret' } }, 401)),
    );
    const status = await provider.getStatus();
    expect(status.connected).toBe(false);
    expect(status.detail).not.toContain('fixture-secret');
  });
  it('cancels an in-flight request and emits no result', async () => {
    const controller = new AbortController();
    const request = vi
      .fn()
      .mockResolvedValueOnce(json(models))
      .mockImplementationOnce(
        (_url, options) =>
          new Promise((_resolve, reject) => {
            options.signal.addEventListener('abort', () => reject(new Error('aborted')), {
              once: true,
            });
            controller.abort();
          }),
      );
    const provider = new ClaudeProvider(() => 'fixture-key', request);
    expect((await events(provider, controller.signal)).at(-1)).toEqual({ type: 'cancelled' });
  });
  it('does not start a cancelled request', async () => {
    const request = vi.fn();
    const controller = new AbortController();
    controller.abort();
    expect(
      await events(new ClaudeProvider(() => 'fixture-key', request), controller.signal),
    ).toEqual([{ type: 'cancelled' }]);
    expect(request).not.toHaveBeenCalled();
  });
  it('bounds network waits and aborts the underlying request on timeout', async () => {
    vi.useFakeTimers();
    try {
      const request = vi.fn().mockImplementation(
        (_url, options) =>
          new Promise((_resolve, reject) =>
            options.signal.addEventListener('abort', () => reject(new Error('aborted')), {
              once: true,
            }),
          ),
      );
      const result = events(new ClaudeProvider(() => 'fixture-key', request));
      await vi.advanceTimersByTimeAsync(25001);
      expect((await result).at(-1)).toMatchObject({
        type: 'error',
        message: expect.stringContaining('초과'),
      });
      expect(request.mock.calls[0][1].signal.aborted).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
});
