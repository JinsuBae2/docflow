import { describe, it, expect } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ProjectStore } from '../../src/main/project/store';
import { buildContext } from '../../src/main/project/context';
describe('Context selection', () => {
  it('uses linked documents and decisions, respects exclusions and fails on mandatory overflow', async () => {
    const root = await mkdtemp(join(tmpdir(), 'docflow-context-'));
    const store = await ProjectStore.open(root);
    try {
      const a = await store.createDocument('PRD', 'prd', '# 목표\n회원가입 없음');
      const b = await store.createDocument('기능', 'feature', '# 기능\n로컬 파일');
      store.addRelation(a.id, b.id, '구현');
      store.addDecision('회원가입 없음', [a.id]);
      const ctx = await buildContext(
        { instruction: '검토', selectedIds: [a.id], excludedIds: [] },
        store,
      );
      expect(ctx.sources.some((s: any) => s.documentId === b.id)).toBe(true);
      expect(ctx.decisions[0].text).toBe('회원가입 없음');
      const excluded = await buildContext(
        { instruction: '검토', selectedIds: [a.id], excludedIds: [b.id] },
        store,
      );
      expect(excluded.sources.some((s: any) => s.documentId === b.id)).toBe(false);
      await expect(
        buildContext(
          { instruction: '검토', selectedIds: [a.id], excludedIds: [], maxCharacters: 10 },
          store,
        ),
      ).rejects.toThrow(/범위/);
    } finally {
      store.close();
      await rm(root, { recursive: true, force: true });
    }
  });
});
