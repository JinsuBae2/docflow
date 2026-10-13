import { it, expect } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ProjectStore } from '../../src/main/project/store';
it.each(['prepared', 'replaced'] as const)(
  'recovers interruption at %s without a half-applied document',
  async (stage) => {
    const root = await mkdtemp(join(tmpdir(), 'docflow-recovery-'));
    let store = await ProjectStore.open(root);
    try {
      const doc = await store.createDocument('설계', 'design', '# 설계\n원본');
      await expect(
        store.saveDocument(doc.id, doc.markdown + '\n수락한 변경', doc.revision, undefined, stage),
      ).rejects.toThrow(/Injected/);
      store.close();
      store = await ProjectStore.open(root);
      expect(store.document(doc.id).markdown.includes('수락한 변경')).toBe(stage === 'replaced');
    } finally {
      store.close();
      await rm(root, { recursive: true, force: true });
    }
  },
);
