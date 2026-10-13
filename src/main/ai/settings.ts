import type { Preferences, PreferencesPatch } from '../../shared/contracts';

export function normalizePreferences(value: Partial<Preferences> = {}): Preferences {
  const provider = value.provider === 'claude' ? 'claude' : 'codex';
  const models = { codex: '', claude: '', ...value.models };
  if (typeof value.model === 'string') models[provider] = value.model;
  return {
    provider,
    model: models[provider],
    models,
    onboardingDone: value.onboardingDone === true,
  };
}
export function updatePreferences(current: Preferences, patch: PreferencesPatch): Preferences {
  const provider = patch.provider || current.provider;
  const models = { ...current.models, [provider]: patch.model ?? current.models[provider] };
  return { ...current, ...patch, provider, model: models[provider], models };
}
