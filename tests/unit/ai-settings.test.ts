import { it, expect } from 'vitest';
import { normalizePreferences, updatePreferences } from '../../src/main/ai/settings';
it('migrates legacy Codex settings and keeps models separate across providers', () => {
  const old = normalizePreferences({ model: 'codex-old', onboardingDone: true });
  expect(old.provider).toBe('codex');
  const claude = updatePreferences(old, { provider: 'claude', model: 'claude-picked' });
  expect(updatePreferences(claude, { provider: 'codex' }).model).toBe('codex-old');
  expect(updatePreferences(updatePreferences(claude, { provider: 'codex' }), { provider: 'claude' }).model).toBe('claude-picked');
  expect(claude.onboardingDone).toBe(true);
});
