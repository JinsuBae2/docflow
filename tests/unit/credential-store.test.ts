import { it, expect } from 'vitest';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { CredentialStore } from '../../src/main/ai/credential-store';
it('stores encrypted bytes, can delete them, and refuses insecure backends', () => {
  const root = mkdtempSync(join(tmpdir(), 'docflow-keys-')); const file = join(root, 'claude-key.enc');
  const crypto = { isEncryptionAvailable: () => true, getSelectedStorageBackend: () => 'keychain', encryptString: (key: string) => Buffer.from(key.split('').reverse().join('')), decryptString: (bytes: Buffer) => bytes.toString().split('').reverse().join('') };
  try {
    const store = new CredentialStore(file, crypto); store.set('fixture-secret');
    expect(readFileSync(file, 'utf8')).not.toContain('fixture-secret'); expect(store.get()).toBe('fixture-secret');
    store.set(''); expect(store.get()).toBe('');
    expect(() => new CredentialStore(file, { ...crypto, isEncryptionAvailable: () => false }).set('fixture-secret')).toThrow();
    expect(() => new CredentialStore(file, { ...crypto, getSelectedStorageBackend: () => 'basic_text' }).set('fixture-secret')).toThrow();
  } finally { rmSync(root, { recursive: true, force: true }); }
});
