import { describe, it, expect } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ProjectStore } from '../../src/main/project/store';
import { buildContext } from '../../src/main/project/context';
describe('Context selection', () => {
  it('retrieves relevant sections from large optional documents and keeps excluded sections out', async () => {
    const root = await mkdtemp(join(tmpdir(), 'docflow-context-sections-'));
    const store = await ProjectStore.open(root);
    try {
      const a = await store.createDocument('요청', 'note', '# 요청\n인증');
      const b = await store.createDocument(
        '참고',
        'note',
        '# 관계없는 본문\n' +
          'x'.repeat(65000) +
          '\n## 인증\n중요한 인증 근거\n## 비밀\n전송 금지 문자열',
      );
      const ctx = await buildContext(
        { instruction: '인증 검토', selectedIds: [a.id], excludedIds: [b.sections[2].id] },
        store,
      );
      const evidence = ctx.sources.find((s) => s.documentId === b.id)!;
      expect(evidence.complete).toBe(false);
      expect(evidence.content).toContain('중요한 인증 근거');
      expect(b.markdown.slice(evidence.range!.start, evidence.range!.end)).toBe(evidence.content);
      expect(JSON.stringify(ctx)).not.toContain('전송 금지 문자열');
      expect(ctx.omittedIds).toContain(b.id);
      const selected = await buildContext(
        {
          instruction: '검토',
          selectedIds: [b.id],
          excludedIds: [b.sections[0].id, b.sections[2].id],
        },
        store,
      );
      expect(JSON.stringify(selected)).not.toContain('전송 금지 문자열');
      expect(selected.sources.every((s) => s.complete === false)).toBe(true);
    } finally {
      store.close();
      await rm(root, { recursive: true, force: true });
    }
  });
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
