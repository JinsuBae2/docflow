import { it, expect } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ProjectStore } from '../../src/main/project/store';
import { buildContext } from '../../src/main/project/context';
import { ProposalService } from '../../src/main/project/proposals';
it('validates evidence, deduplicates, rejects without editing and applies only the matching version', async () => {
  const root = await mkdtemp(join(tmpdir(), 'docflow-proposals-'));
  const store = await ProjectStore.open(root);
  try {
    const doc = await store.createDocument('PRD', 'prd', '# PRD\n로컬');
    const ctx = await buildContext(
      { instruction: '보완', selectedIds: [doc.id], excludedIds: [] },
      store,
    );
    const service = new ProposalService(store);
    const draft = {
      kind: 'update',
      title: '실패 처리',
      documentType: 'prd',
      targetId: doc.id,
      baseRevision: doc.revision,
      replacement: doc.markdown + '\n실패 시 원본 유지',
      sourceIds: [doc.id],
      reason: '데이터 보존',
      dependencyIds: [],
    };
    await expect(
      service.register(ctx.id, { message: '', proposals: [{ ...draft, sourceIds: ['unknown'] }] }),
    ).rejects.toThrow(/근거/);
    const proposals = await service.register(ctx.id, {
      message: '검토',
      proposals: [draft, { ...draft, title: '다른 제안' }],
    });
    const revision = await buildContext(
      { instruction: '마지막 항목 제거', selectedIds: [], excludedIds: [] },
      store,
      proposals[0].id,
    );
    expect(revision.revisionProposal?.replacement).toBe(draft.replacement);
    expect(revision.sources.some((s) => s.id === doc.id)).toBe(true);
    expect(await service.register(ctx.id, { message: '검토', proposals: [draft] })).toHaveLength(2);
    await service.reject(proposals[1].id, '범위 밖');
    expect(store.document(doc.id).markdown).toBe(doc.markdown);
    await service.accept(proposals[0].id);
    expect(store.document(doc.id).markdown).toContain('실패 시 원본 유지');
    const next = await buildContext(
      { instruction: '다시 검토', selectedIds: [doc.id], excludedIds: [] },
      store,
    );
    expect(next.proposalHistory.map((p) => p.status)).toEqual(['accepted', 'rejected']);
    expect(next.sources[0].content).toContain('실패 시 원본 유지');
    const newer = await service.register(next.id, {
      message: '',
      proposals: [{ ...draft, baseRevision: store.document(doc.id).revision }],
    });
    await store.saveDocument(
      doc.id,
      store.document(doc.id).markdown + '\n직접 수정',
      store.document(doc.id).revision,
    );
    await expect(service.accept(newer[0].id)).rejects.toThrow(/변경/);
    expect(store.get<any>('proposal', newer[0].id).status).toBe('stale');
  } finally {
    store.close();
    await rm(root, { recursive: true, force: true });
  }
});
it('creates new documents and diagrams only after acceptance and retains decisions as context', async () => {
  const root = await mkdtemp(join(tmpdir(), 'docflow-create-'));
  const store = await ProjectStore.open(root);
  try {
    const source = await store.createDocument('기획', 'prd', '# 기획\n로컬 문서');
    const context = await buildContext(
      { instruction: '새 문서와 흐름, 결정', selectedIds: [source.id], excludedIds: [] },
      store,
    );
    const service = new ProposalService(store);
    const base = {
      targetId: null,
      baseRevision: null,
      sourceIds: [source.id],
      reason: '기획 구체화',
      dependencyIds: [],
    };
    const proposals = await service.register(context.id, {
      message: '초안',
      proposals: [
        {
          ...base,
          kind: 'create',
          title: '기능',
          documentType: 'feature',
          replacement: '# 기능\n문서 열기',
        },
        {
          ...base,
          kind: 'diagram',
          title: '흐름',
          documentType: 'flow',
          replacement: '# 흐름\n```mermaid\nflowchart LR\nA[열기] --> B[검토]\n```',
        },
        {
          ...base,
          kind: 'decision',
          title: '로컬',
          documentType: 'note',
          replacement: '회원가입은 도입하지 않는다.',
        },
      ],
    });
    expect(store.workspace().documents).toHaveLength(1);
    for (const proposal of proposals) await service.accept(proposal.id);
    expect(store.workspace().documents).toHaveLength(3);
    const next = await buildContext(
      { instruction: '검토', selectedIds: [source.id], excludedIds: [] },
      store,
    );
    expect(next.decisions[0].text).toBe('회원가입은 도입하지 않는다.');
    await store.saveDocument(source.id, source.markdown + '\n새 요구사항', source.revision);
    expect(store.workspace().staleDiagramIds).toHaveLength(1);
  } finally {
    store.close();
    await rm(root, { recursive: true, force: true });
  }
});
