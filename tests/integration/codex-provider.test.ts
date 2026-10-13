import { describe, it, expect } from 'vitest';
import { resolve } from 'node:path';
import { CodexProvider } from '../../src/main/ai/codex-provider';

describe('Codex provider', () => {
  it.each([
    ['api-account', 'auth_mode'],
    ['no-account', 'auth_required'],
    ['old-server', 'unsupported'],
  ])('explains unavailable limits for %s without leaking diagnostics', async (mode, reason) => {
    const provider = new CodexProvider(process.execPath, [
      resolve('tests/fixtures/fake-codex.cjs'),
      mode,
    ]);
    try {
      expect(await provider.getUsageLimits()).toMatchObject({ windows: [], reason });
    } finally {
      await provider.close();
    }
  });
  it('reads account windows without inference and emits measured usage before a failed turn', async () => {
    const provider = new CodexProvider(process.execPath, [
      resolve('tests/fixtures/fake-codex.cjs'),
    ]);
    try {
      const limits = await provider.getUsageLimits();
      expect(limits.windows[0].remainingPercent).toBe(75);
      const events = [];
      for await (const event of provider.run(
        {
          id: 'usage',
          requestId: 'usage-request',
          instruction: '사용량 실패',
          sources: [],
          decisions: [],
          proposalHistory: [],
          omittedIds: [],
          project: { name: 'test', goal: '', constraints: '' },
        },
        new AbortController().signal,
      ))
        events.push(event);
      expect(events.find((e) => e.type === 'usage')).toMatchObject({
        usage: { totalTokens: 150, cachedInputTokens: 40 },
      });
      expect(events.at(-1)).toMatchObject({ type: 'error' });
    } finally {
      await provider.close();
    }
  });
  it('discovers actual picker models and forwards a chosen model', async () => {
    const provider = new CodexProvider(process.execPath, [
      resolve('tests/fixtures/fake-codex.cjs'),
    ]);
    try {
      expect((await provider.listModels()).map((m) => m.model)).toEqual([
        'test-balanced',
        'test-fast',
      ]);
      const events = [];
      for await (const event of provider.run(
        {
          id: 'ctx-model',
          requestId: 'req-model',
          instruction: '모델 전달 검증',
          sources: [],
          decisions: [],
          proposalHistory: [],
          omittedIds: [],
          project: { name: 'test', goal: '', constraints: '' },
        },
        new AbortController().signal,
        'test-fast',
      ))
        events.push(event);
      expect(events.at(-1)).toMatchObject({ type: 'result' });
    } finally {
      await provider.close();
    }
  });
  it('handshakes, reads login and emits one validated final response', async () => {
    const provider = new CodexProvider(process.execPath, [
      resolve('tests/fixtures/fake-codex.cjs'),
    ]);
    try {
      expect((await provider.getStatus()).connected).toBe(true);
      const events = [];
      for await (const event of provider.run(
        {
          id: 'ctx',
          requestId: 'req',
          instruction: '검토',
          sources: [],
          decisions: [],
          proposalHistory: [],
          omittedIds: [],
          project: { name: 'test', goal: '', constraints: '' },
        },
        new AbortController().signal,
      ))
        events.push(event);
      expect(events.filter((e) => e.type === 'result')).toHaveLength(1);
      expect(events.at(-1)).toMatchObject({
        type: 'result',
        response: { message: '검토했습니다.' },
      });
      const next = [];
      for await (const event of provider.run(
        {
          id: 'ctx2',
          requestId: 'req2',
          instruction: '다시 검토',
          sources: [],
          decisions: [],
          proposalHistory: [],
          omittedIds: [],
          project: { name: 'test', goal: '', constraints: '' },
        },
        new AbortController().signal,
      ))
        next.push(event);
      expect(next.at(-1)).toMatchObject({ type: 'result' });
    } finally {
      await provider.close();
    }
  });
  it('does not deliver a partial response after cancellation', async () => {
    const provider = new CodexProvider(process.execPath, [
      resolve('tests/fixtures/fake-codex.cjs'),
    ]);
    const controller = new AbortController();
    controller.abort();
    try {
      const events = [];
      for await (const event of provider.run({} as never, controller.signal)) events.push(event);
      expect(events.some((e) => e.type === 'result')).toBe(false);
      expect(events.at(-1)).toMatchObject({ type: 'cancelled' });
    } finally {
      await provider.close();
    }
  });
});
