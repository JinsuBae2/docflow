import type { UsageLimits, UsageReport, UsageWindow } from '../../shared/contracts';
const tokens = (value: unknown): number | null =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null;
export function normalizeCodexUsage(raw: any): UsageReport {
  const fields = {
    inputTokens: raw?.inputTokens,
    outputTokens: raw?.outputTokens,
    cachedInputTokens: raw?.cachedInputTokens,
    cacheWriteInputTokens: raw?.cacheWriteInputTokens,
    totalTokens: raw?.totalTokens,
  };
  const result = Object.fromEntries(
    Object.entries(fields).map(([key, value]) => [key, tokens(value)]),
  ) as unknown as UsageReport;
  if (Object.values(fields).some((value) => value != null && tokens(value) === null))
    result.reason = 'invalid_response';
  else if (Object.values(fields).every((value) => value == null))
    result.reason = 'missing_response';
  return result;
}
export function normalizeClaudeUsage(raw: any): UsageReport {
  const input = tokens(raw?.input_tokens);
  const output = tokens(raw?.output_tokens);
  const cached = tokens(raw?.cache_read_input_tokens);
  const written = tokens(raw?.cache_creation_input_tokens);
  const overallInput = input === null ? null : input + (cached || 0) + (written || 0);
  const result: UsageReport = {
    inputTokens: overallInput,
    outputTokens: output,
    cachedInputTokens: cached,
    cacheWriteInputTokens: written,
    totalTokens: overallInput !== null && output !== null ? overallInput + output : null,
  };
  if (
    [
      raw?.input_tokens,
      raw?.output_tokens,
      raw?.cache_read_input_tokens,
      raw?.cache_creation_input_tokens,
    ].some((value) => value != null && tokens(value) === null)
  )
    result.reason = 'invalid_response';
  else if (input === null && output === null && cached === null && written === null)
    result.reason = 'missing_response';
  return result;
}
const iso = (value: unknown): string | null => {
  const date =
    typeof value === 'number'
      ? new Date(value * 1000)
      : typeof value === 'string' && value
        ? new Date(value)
        : null;
  return date && Number.isFinite(date.getTime()) ? date.toISOString() : null;
};
export function codexLimits(raw: any): UsageLimits {
  const result: UsageLimits = {
    provider: 'codex',
    checkedAt: new Date().toISOString(),
    source: 'account',
    windows: [],
  };
  const buckets =
    raw?.rateLimitsByLimitId &&
    typeof raw.rateLimitsByLimitId === 'object' &&
    Object.keys(raw.rateLimitsByLimitId).length
      ? Object.entries(raw.rateLimitsByLimitId)
      : raw?.rateLimits
        ? [[raw.rateLimits.limitId || 'codex', raw.rateLimits]]
        : [];
  for (const [key, value] of buckets as Array<[string, any]>) {
    for (const name of ['primary', 'secondary']) {
      const window = value?.[name];
      if (!window) continue;
      const valid =
        typeof window.usedPercent === 'number' &&
        Number.isFinite(window.usedPercent) &&
        window.usedPercent >= 0;
      if (!valid) {
        result.reason = 'invalid_response';
        continue;
      }
      result.windows.push({
        id: key + ':' + name,
        label: value.limitName || key,
        unit: 'percent',
        windowMinutes: tokens(window.windowDurationMins),
        limit: null,
        remaining: null,
        remainingPercent: Math.max(0, 100 - window.usedPercent),
        resetsAt: iso(window.resetsAt),
      });
    }
  }
  if (!result.windows.length && !result.reason) result.reason = 'missing_response';
  return result;
}
export function claudeLimits(headers: Headers): UsageLimits {
  const result: UsageLimits = {
    provider: 'claude',
    checkedAt: new Date().toISOString(),
    source: 'response',
    windows: [],
  };
  const labels = {
    requests: '요청 한도',
    tokens: '토큰 한도',
    'input-tokens': '입력 토큰 한도',
    'output-tokens': '출력 토큰 한도',
  };
  for (const [key, label] of Object.entries(labels)) {
    const prefix = 'anthropic-ratelimit-' + key;
    const limit = headers.get(prefix + '-limit');
    const remaining = headers.get(prefix + '-remaining');
    if (limit === null && remaining === null) continue;
    const numeric = (text: string | null) =>
      text !== null && /^\d+$/.test(text) ? tokens(Number(text)) : null;
    const window: UsageWindow = {
      id: key,
      label,
      unit: key === 'requests' ? 'requests' : 'tokens',
      windowMinutes: null,
      limit: numeric(limit),
      remaining: numeric(remaining),
      remainingPercent: null,
      resetsAt: iso(headers.get(prefix + '-reset')),
    };
    if (
      (limit !== null && window.limit === null) ||
      (remaining !== null && window.remaining === null)
    ) {
      window.reason = 'invalid_response';
      result.reason = 'invalid_response';
    }
    result.windows.push(window);
  }
  if (!result.windows.length) result.reason = 'missing_response';
  return result;
}
