import { it, expect } from 'vitest';
import { CodexProvider } from '../../src/main/ai/codex-provider';

it.skipIf(process.env.DOCFLOW_MODELS !== '1')('reads the installed CLI account and available models without inference', async () => {
  const provider = new CodexProvider();
  try {
    const status = await provider.getStatus();
    expect(status.connected, status.detail).toBe(true);
    const models = await provider.listModels();
    expect(models.length).toBeGreaterThan(0);
    expect(models.every(m => m.model && m.displayName)).toBe(true);
    console.log(`LIVE_MODELS_OK: ${models.length} available models; default ${models.find(m => m.isDefault)?.model || 'CLI default'}. No inference requested.`);
  } finally { await provider.close(); }
}, 60000);
