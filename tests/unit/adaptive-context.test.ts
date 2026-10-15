import { ProposalService } from '../../src/main/project/proposals';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ProjectStore } from '../../src/main/project/store';
import { buildContext, assertReviewedContext } from '../../src/main/project/context';
import { contextPayload, assertDocumentEvidence } from '../../src/shared/context-payload';
let root: string;
let store: ProjectStore;
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'docflow-adaptive-'));
  store = await ProjectStore.open(root);
});
afterEach(async () => {
  store.close();
  await rm(root, { recursive: true, force: true, maxRetries: 5 });
});
it('automatically selects real relevant sections from oversized mandatory documents within the wire budget', async () => {
  const doc = await store.createDocument(
    '로그인 명세',
    'prd',
    '# 개요\n' +
      '배경'.repeat(45000) +
      '\n## 로그인 오류\n로그인 오류를 안내합니다.\n## 결제\n' +
      '다른'.repeat(35000),
  );
  const context = await buildContext(
    {
      instruction: '로그인 오류 검토',
      selectedIds: [doc.id],
      excludedIds: [],
      maxCharacters: 5000,
    },
    store,
  );
  expect(context.selection?.mode).toBe('excerpts');
  expect(context.sources.some((s) => s.title === '로그인 오류')).toBe(true);
  expect(context.sources.every((s) => s.complete === false && !!s.range)).toBe(true);
  for (const source of context.sources) {
    expect(source.revision).toBe(doc.revision);
    expect(doc.markdown.slice(source.range!.start, source.range!.end)).toBe(source.content);
  }
  expect(JSON.stringify(contextPayload(context)).length).toBeLessThanOrEqual(5000);
  expect(context.selection?.omitted.length).toBeGreaterThan(0);
  expect(store.document(doc.id).revision).toBe(doc.revision);
});
it('keeps excluded sections out of both selected fragments and the provider payload', async () => {
  const doc = await store.createDocument(
    '명세',
    'note',
    '# 개요\n' +
      '긴내용'.repeat(25000) +
      '\n## 비밀 토큰\nPRIVATE_SECRET_BODY\n## 로그인\n공개된 근거',
  );
  const context = await buildContext(
    {
      instruction: '로그인',
      selectedIds: [doc.id],
      excludedIds: [doc.sections[1].id],
      maxCharacters: 4000,
    },
    store,
  );
  expect(JSON.stringify(contextPayload(context))).not.toMatch(/PRIVATE_SECRET_BODY|비밀 토큰/);
  expect(
    context.selection?.omitted.some(
      (s) => s.sectionId === doc.sections[1].id && s.reason === 'excluded',
    ),
  ).toBe(true);
});
it('fits oversized single sections with exact UTF-16 ranges without splitting surrogate pairs', async () => {
  const doc = await store.createDocument('문서', 'note', '# 긴 섹션\n' + '😀"\\'.repeat(20000));
  const context = await buildContext(
    { instruction: '긴 섹션', selectedIds: [doc.id], excludedIds: [], maxCharacters: 3000 },
    store,
  );
  const source = context.sources[0];
  expect(source.content).toBe(doc.markdown.slice(source.range!.start, source.range!.end));
  expect(source.content).not.toMatch(/[\uD800-\uDBFF]$/);
  expect(JSON.stringify(contextPayload(context)).length).toBeLessThanOrEqual(3000);
});
it('blocks document requests with no usable evidence while preserving explicit idea-only requests', async () => {
  const doc = await store.createDocument('참고', 'note', '# 참고\n본문');
  const empty = await buildContext(
    { instruction: '문서 검토', selectedIds: [doc.id], excludedIds: [doc.id] },
    store,
  );
  expect(() => assertDocumentEvidence(empty)).toThrow(/근거/);
  const idea = await buildContext(
    { instruction: '새 아이디어', selectedIds: [], excludedIds: [], mode: 'idea' },
    store,
  );
  expect(idea.sources).toEqual([]);
  expect(() => assertDocumentEvidence(idea)).not.toThrow();
});
it('rejects sending an approved preview after its source revision changes', async () => {
  const doc = await store.createDocument('근거', 'note', '# 근거\n처음 내용');
  const input = { instruction: '검토', selectedIds: [doc.id], excludedIds: [] };
  const approved = await buildContext(input, store);
  await store.saveDocument(doc.id, doc.markdown + '\n변경', doc.revision);
  const current = await buildContext(input, store);
  expect(() => assertReviewedContext(current, approved)).toThrow(/맥락이 변경/);
});

it('rejects generated identity metadata as evidence for blank documents and empty explicit document requests', async () => {
  const doc = await store.createDocument('빈 문서', 'note', '');
  const context = await buildContext(
    { instruction: '검토', selectedIds: [doc.id], excludedIds: [], mode: 'documents' },
    store,
  );
  expect(context.sources).toEqual([]);
  expect(() => assertDocumentEvidence(context)).toThrow(/근거/);
});
it('deduplicates whole documents and separately selected sections', async () => {
  const doc = await store.createDocument('근거', 'note', '# 근거\n본문');
  const context = await buildContext(
    { instruction: '검토', selectedIds: [doc.id, doc.sections[0].id], excludedIds: [] },
    store,
  );
  expect(context.sources).toHaveLength(1);
});
it('preserves reviewed flow identity while ignoring transient request IDs', async () => {
  const doc = await store.createDocument('근거', 'note', '# 근거\n본문');
  const input = { instruction: '흐름', selectedIds: [doc.id], excludedIds: [], flowId: null };
  const preview = await buildContext(input, store);
  const current = await buildContext(input, store);
  expect(current.flowContext!.flowId).not.toBe(preview.flowContext!.flowId);
  assertReviewedContext(current, preview);
  expect(current.flowContext!.flowId).toBe(preview.flowContext!.flowId);
});

it('keeps a useful original excerpt from each of 24 oversized selected documents', async () => {
  const docs = [];
  for (let i = 0; i < 24; i++)
    docs.push(
      await store.createDocument(`문서 ${i}`, 'note', `# 명세 ${i}\n` + '실제 원문 '.repeat(1500)),
    );
  const context = await buildContext(
    {
      instruction: '명세 검토',
      selectedIds: docs.map((d) => d.id),
      excludedIds: [],
      maxCharacters: 18000,
    },
    store,
  );
  expect(new Set(context.sources.map((s) => s.documentId)).size).toBe(24);
  expect(JSON.stringify(contextPayload(context)).length).toBeLessThanOrEqual(18000);
  expect(context.sources.every((s) => s.range && s.content.includes('실제 원문'))).toBe(true);
});

it('requires an explicit idea-only mode to send a request from an empty project', async () => {
  const context = await buildContext(
    { instruction: '새 기획', selectedIds: [], excludedIds: [] },
    store,
  );
  expect(() => assertDocumentEvidence(context)).toThrow(/근거/);
  const idea = await buildContext(
    { instruction: '새 기획', selectedIds: [], excludedIds: [], mode: 'idea' },
    store,
  );
  expect(() => assertDocumentEvidence(idea)).not.toThrow();
});

it('applies auto-selected excerpt proposals only to the exact original range', async () => {
  const doc = await store.createDocument(
    '로그인',
    'note',
    '# 배경\n' +
      '배경 '.repeat(25000) +
      '\n## 로그인 오류\n로그인 오류를 안내합니다.\n## 결제\n보존할 내용',
  );
  const context = await buildContext(
    { instruction: '로그인 오류', selectedIds: [doc.id], excludedIds: [], maxCharacters: 4000 },
    store,
  );
  const source = context.sources.find((s) => s.title === '로그인 오류')!;
  const service = new ProposalService(store);
  const draft = {
    kind: 'update' as const,
    title: '오류 안내',
    documentType: 'note' as const,
    targetId: doc.id,
    baseRevision: doc.revision,
    replacement: source.content.replace('안내합니다', '다시 안내합니다'),
    sourceIds: [source.id],
    reason: '안내 보완',
    dependencyIds: [],
  };
  await expect(service.register(context.id, { message: '', proposals: [draft] })).rejects.toThrow(
    /맥락/,
  );
  const [proposal] = await service.register(context.id, {
    message: '',
    proposals: [{ ...draft, scopedSourceId: source.id }],
  });
  const workspace = await service.accept(proposal.id);
  expect(workspace.documents.find((d) => d.id === doc.id)!.markdown).toBe(
    doc.markdown.slice(0, source.range!.start) +
      draft.replacement +
      doc.markdown.slice(source.range!.end),
  );
});
