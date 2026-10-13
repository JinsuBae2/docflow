import { it, expect } from 'vitest';
import {
  normalizeCodexUsage,
  normalizeClaudeUsage,
  codexLimits,
  claudeLimits,
} from '../../src/main/ai/usage';
import { ProjectStore } from '../../src/main/project/store';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

it('normalizes reported tokens without counting cached input twice', () => {
  expect(
    normalizeCodexUsage({
      totalTokens: 150,
      inputTokens: 100,
      cachedInputTokens: 40,
      cacheWriteInputTokens: 10,
      outputTokens: 50,
    }),
  ).toMatchObject({ totalTokens: 150, inputTokens: 100, cachedInputTokens: 40 });
  expect(
    normalizeClaudeUsage({
      input_tokens: 100,
      output_tokens: 50,
      cache_read_input_tokens: 40,
      cache_creation_input_tokens: 10,
    }),
  ).toMatchObject({
    inputTokens: 150,
    outputTokens: 50,
    cachedInputTokens: 40,
    cacheWriteInputTokens: 10,
    totalTokens: 200,
  });
  expect(normalizeCodexUsage(undefined)).toMatchObject({
    totalTokens: null,
    reason: 'missing_response',
  });
  expect(normalizeCodexUsage({ totalTokens: NaN, inputTokens: -1, outputTokens: 2 })).toMatchObject(
    { inputTokens: null, totalTokens: null, reason: 'invalid_response' },
  );
});
it('preserves multiple account windows, null reset times and missing-value reasons', () => {
  const result = codexLimits({
    rateLimitsByLimitId: {
      codex: {
        primary: { usedPercent: 25, windowDurationMins: 300, resetsAt: 1800000000 },
        secondary: null,
      },
      fast: { primary: { usedPercent: 110, windowDurationMins: null, resetsAt: null } },
    },
  });
  expect(result.windows).toHaveLength(2);
  expect(result.windows[0].remainingPercent).toBe(75);
  expect(result.windows[1].remainingPercent).toBe(0);
  expect(result.windows[1].resetsAt).toBeNull();
  expect(
    codexLimits({
      rateLimits: { primary: { usedPercent: 20, windowDurationMins: 10080, resetsAt: null } },
    }).windows[0].remainingPercent,
  ).toBe(80);
  expect(codexLimits({}).reason).toBe('missing_response');
  expect(codexLimits({ rateLimits: { primary: { usedPercent: -1 } } }).reason).toBe(
    'invalid_response',
  );
});
it('reads Claude rate headers as rate limits, never a subscription or credit balance', () => {
  const headers = new Headers({
    'anthropic-ratelimit-requests-limit': '50',
    'anthropic-ratelimit-requests-remaining': '47',
    'anthropic-ratelimit-requests-reset': '2026-10-13T04:00:00Z',
    'anthropic-ratelimit-tokens-limit': '40000',
    'anthropic-ratelimit-tokens-remaining': '35000',
  });
  const result = claudeLimits(headers);
  expect(result.source).toBe('response');
  expect(result.windows[0]).toMatchObject({ unit: 'requests', limit: 50, remaining: 47 });
  expect(result.windows[1]).toMatchObject({ unit: 'tokens', remaining: 35000 });
  expect(claudeLimits(new Headers()).reason).toBe('missing_response');
  expect(claudeLimits(new Headers({ 'anthropic-ratelimit-tokens-remaining': '-1' })).reason).toBe(
    'invalid_response',
  );
});
it('upserts one request, persists failed usage and labels older history instead of guessing zero', async () => {
  const root = await mkdtemp(join(tmpdir(), 'docflow-usage-'));
  let store = await ProjectStore.open(root);
  try {
    const record = {
      id: 'request',
      provider: 'codex' as const,
      model: 'reported-model',
      createdAt: new Date().toISOString(),
      status: 'running' as const,
      usage: normalizeCodexUsage({ inputTokens: 100, outputTokens: 10, totalTokens: 110 }),
    };
    store.saveUsage(record);
    store.saveUsage({
      ...record,
      status: 'error',
      usage: normalizeCodexUsage({ inputTokens: 100, outputTokens: 30, totalTokens: 130 }),
    });
    store.put('message', {
      id: 'old-message',
      role: 'user',
      text: 'old',
      requestId: 'old-request',
      createdAt: record.createdAt,
    });
    store.close();
    store = await ProjectStore.open(root);
    const summary = store.usageSummary();
    expect(summary.requests).toHaveLength(2);
    expect(summary.totals[0].totalTokens).toBe(130);
    expect(summary.requests.find((r) => r.id === 'request')?.status).toBe('error');
    expect(summary.requests.find((r) => r.id === 'old-request')?.usage.reason).toBe('no_history');
  } finally {
    store.close();
    await rm(root, { recursive: true, force: true });
  }
});

it('recovers interrupted usage on reopen without losing reported tokens', async () => {
  const root = await mkdtemp(join(tmpdir(), 'docflow-interrupted-usage-'));
  let store = await ProjectStore.open(root);
  try {
    store.saveUsage({
      id: 'interrupted',
      provider: 'codex',
      model: 'test',
      createdAt: new Date().toISOString(),
      status: 'running',
      usage: normalizeCodexUsage({ inputTokens: 100, outputTokens: 30, totalTokens: 130 }),
    });
    store.close();
    store = await ProjectStore.open(root);
    expect(store.usageSummary().requests[0]).toMatchObject({
      status: 'error',
      usage: { totalTokens: 130 },
    });
    expect(store.usageSummary().totals[0].totalTokens).toBe(130);
  } finally {
    store.close();
    await rm(root, { recursive: true, force: true });
  }
});
