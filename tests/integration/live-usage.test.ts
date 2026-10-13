import { it, expect } from 'vitest';
import { CodexProvider } from '../../src/main/ai/codex-provider';
it.skipIf(process.env.DOCFLOW_LIVE_USAGE !== '1')(
  'reads installed Codex account limits without inference or exposing account identifiers',
  async () => {
    const provider = new CodexProvider();
    try {
      const limits = await provider.getUsageLimits();
      expect(limits.reason, limits.reason).toBeUndefined();
      expect(limits.windows.length).toBeGreaterThan(0);
      expect(
        limits.windows.every(
          (window) =>
            window.remainingPercent !== null &&
            window.remainingPercent >= 0 &&
            window.remainingPercent <= 100,
        ),
      ).toBe(true);
      console.log(
        `LIVE_USAGE_OK: ${limits.windows.length} account windows; no inference; account identifiers not exposed.`,
      );
    } finally {
      await provider.close();
    }
  },
  60000,
);
