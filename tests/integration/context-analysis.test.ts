import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ProjectStore } from '../../src/main/project/store';
import { AnalysisService, estimateTokens } from '../../src/main/project/analysis';
import { ProposalService } from '../../src/main/project/proposals';
import type { AiEvent, ContextSnapshot } from '../../src/shared/contracts';

describe('bounded project analysis', () => {
  let root: string;
  let store: ProjectStore;
  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'docflow-analysis-'));
    store = await ProjectStore.open(root);
  });
  afterEach(async () => {
    store.close();
    await rm(root, { recursive: true, force: true });
  });
  const input = { instruction: '인증 검토', selectedIds: [], excludedIds: [] };
  const settings = { provider: 'claude' as const, model: 'test-model' };
  const fake = (run: (snapshot: ContextSnapshot) => AsyncGenerator<AiEvent>) => () => ({
    run: (snapshot: ContextSnapshot) => run(snapshot),
    close: async () => {},
  });
  const decision = (snapshot: ContextSnapshot) => ({
    kind: 'decision' as const,
    title: '검토 결정',
    documentType: 'note' as const,
    targetId: null,
    baseRevision: null,
    replacement: '근거 검토',
    sourceIds: [snapshot.sources[0].id],
    reason: '문서 근거',
    dependencyIds: [],
  });

  it('covers a project beyond the old limit exactly and schedules linked evidence together', async () => {
    const a = await store.createDocument('인증', 'note', '# 인증\n' + '한글 근거\n'.repeat(12000));
    const b = await store.createDocument('연결', 'note', '# 연결\n인증 명세');
    const excluded = await store.createDocument('비밀', 'note', '# 비밀\n절대 전송 금지');
    store.addRelation(a.id, b.id, '참조');
    const service = new AnalysisService(store);
    const plan = service.prepare({ ...input, excludedIds: [excluded.id] }, settings);
    const record = service.get(plan.id);
    const sources = record.batches
      .filter((b) => b.phase === 'documents')
      .flatMap((b) => b.snapshot.sources);
    expect(
      sources
        .filter((s) => s.documentId === a.id)
        .sort((x, y) => x.range!.start - y.range!.start)
        .map((s) => s.content)
        .join(''),
    ).toBe(a.markdown);
    expect(sources.some((s) => s.documentId === excluded.id)).toBe(false);
    expect(
      record.batches.some(
        (batch) =>
          batch.phase === 'links' &&
          batch.snapshot.sources.some((s) => s.documentId === a.id) &&
          batch.snapshot.sources.some((s) => s.documentId === b.id),
      ),
    ).toBe(true);
    for (const batch of record.batches)
      expect(estimateTokens(batch.snapshot)).toBeLessThanOrEqual(plan.budget.inputTokens);
  });

  it('resumes completed batches without duplicating calls/proposals and invalidates changed sources', async () => {
    const a = await store.createDocument('큰 문서', 'note', '# 인증\n' + '내용\n'.repeat(10000));
    const service = new AnalysisService(store);
    const plan = service.prepare(input, settings);
    const controller = new AbortController();
    let calls = 0;
    const factory = fake(async function* (snapshot) {
      calls++;
      yield { type: 'result', response: { message: '검토 완료', proposals: [decision(snapshot)] } };
    });
    for await (const event of service.run(plan.id, factory, controller.signal))
      if (event.type === 'progress' && event.text.includes('2/')) controller.abort();
    expect(service.get(plan.id).status).toBe('paused');
    const completed = calls;
    for await (const _ of service.run(
      plan.id,
      fake(async function* (snapshot) {
        calls++;
        yield { type: 'result', response: { message: '완료', proposals: [decision(snapshot)] } };
      }),
      new AbortController().signal,
    ))
      void _;
    expect(calls).toBe(service.get(plan.id).batches.length);
    expect(store.all('proposal')).toHaveLength(calls);
    expect(completed).toBe(1);
    const second = service.prepare(input, settings);
    for await (const _ of service.run(second.id, factory, new AbortController().signal)) void _;
    expect(calls).toBe(service.get(plan.id).batches.length);
    expect(store.all('proposal')).toHaveLength(calls);
    const third = service.prepare(input, settings);
    await store.saveDocument(a.id, a.markdown + '\n変更', a.revision);
    for await (const _ of service.run(third.id, factory, new AbortController().signal)) void _;
    expect(service.get(third.id).error).toMatch(/변경/);
  });

  it('keeps completed/staged work after restart and records each billed retry separately', async () => {
    await store.createDocument('문서', 'note', '# 제목\n본문');
    let service = new AnalysisService(store);
    const plan = service.prepare(input, settings);
    const record = service.get(plan.id);
    const snapshot = record.batches[0].snapshot;
    store.saveSnapshot(snapshot);
    const response = { message: '검토 완료', proposals: [decision(snapshot)] };
    await new ProposalService(store).register(snapshot.id, response);
    store.put('analysis-result', { id: snapshot.id, response });
    store.put('analysis', { ...record, status: 'running' });
    store.close();
    store = await ProjectStore.open(root);
    service = new AnalysisService(store);
    expect(service.get(plan.id).status).toBe('paused');
    for await (const _ of service.run(
      plan.id,
      () => {
        throw new Error('완료된 응답을 다시 호출하면 안 됩니다.');
      },
      new AbortController().signal,
    ))
      void _;
    expect(service.get(plan.id).status).toBe('completed');
    expect(store.all('proposal')).toHaveLength(1);
    expect(store.all('usage')).toHaveLength(0);
    const next = service.prepare({ ...input, instruction: '새 요청' }, settings);
    const measured = {
      inputTokens: 100,
      outputTokens: 50,
      totalTokens: 150,
      cachedInputTokens: 0,
      cacheWriteInputTokens: 0,
    };
    for await (const _ of service.run(
      next.id,
      fake(async function* () {
        yield { type: 'usage', usage: measured };
        yield { type: 'error', message: '연결 끊김' };
      }),
      new AbortController().signal,
    ))
      void _;
    for await (const _ of service.run(
      next.id,
      fake(async function* () {
        yield { type: 'usage', usage: measured };
        yield { type: 'result', response: { message: '완료', proposals: [] } };
      }),
      new AbortController().signal,
    ))
      void _;
    expect(store.all<{ status: string }>('usage').map((u) => u.status)).toEqual([
      'error',
      'completed',
    ]);
    expect(
      store.usageSummary().totals.find((total) => total.provider === 'claude')!.totalTokens,
    ).toBe(300);
  });

  it('keeps excluded sections private, reports missing links and retrieves linked anchor evidence', async () => {
    const a = await store.createDocument(
      'A',
      'note',
      '# A\n[관련](b.md#target)\n## 비밀\n특수 비공개 문자열',
    );
    const b = await store.createDocument(
      'B',
      'note',
      '# B\n' + '내용 '.repeat(10000) + '\n## Target\n정확한 대상 근거',
    );
    store.addRelation(a.id, b.sections[1].id, '참조');
    const excluded = a.sections[1].id;
    const service = new AnalysisService(store);
    const plan = service.prepare({ ...input, excludedIds: [excluded] }, settings);
    const record = service.get(plan.id);
    expect(JSON.stringify(record.batches)).not.toContain('특수 비공개 문자열');
    expect(plan.warnings?.length).toBeGreaterThan(0);
    expect(
      record.batches.some(
        (batch) =>
          batch.phase === 'links' &&
          batch.snapshot.sources.some((s) => s.sectionId === b.sections[1].id),
      ),
    ).toBe(true);
  });

  it('invalidates an in-flight result when its document changes and reuses only unchanged documents', async () => {
    const a = await store.createDocument('A', 'note', '# A\n본문');
    await store.createDocument('B', 'note', '# B\n본문');
    const service = new AnalysisService(store);
    const plan = service.prepare(input, settings);
    for await (const _ of service.run(
      plan.id,
      fake(async function* () {
        yield { type: 'result', response: { message: '완료', proposals: [] } };
      }),
      new AbortController().signal,
    ))
      void _;
    const updated = await store.saveDocument(a.id, a.markdown + '\n수정', a.revision);
    const currentA = updated;
    const next = service.prepare(input, settings);
    let calls = 0;
    for await (const _ of service.run(
      next.id,
      fake(async function* () {
        calls++;
        yield { type: 'result', response: { message: '완료', proposals: [] } };
      }),
      new AbortController().signal,
    ))
      void _;
    expect(calls).toBe(1);
    expect(service.get(next.id).cached).toBe(1);
    const changed = service.prepare({ ...input, instruction: '다른 분석' }, settings);
    for await (const _ of service.run(
      changed.id,
      fake(async function* (snapshot) {
        await store.saveDocument(a.id, currentA.markdown + '\n또 수정', currentA.revision);
        yield { type: 'result', response: { message: '완료', proposals: [decision(snapshot)] } };
      }),
      new AbortController().signal,
    ))
      void _;
    expect(service.get(changed.id).error).toMatch(/변경/);
    expect(store.all('proposal')).toHaveLength(0);
  });

  it('does not send drafts and records output overflow/provider failures for retry', async () => {
    const a = await store.createDocument('문서', 'note', '# 제목\n본문');
    store.put('draft', {
      id: a.id,
      documentId: a.id,
      markdown: '초안 비밀',
      baseRevision: a.revision,
    });
    const service = new AnalysisService(store);
    expect(() => service.prepare(input, settings)).toThrow(/초안/);
    store.remove('draft', a.id);
    const plan = service.prepare(input, settings);
    for await (const _ of service.run(
      plan.id,
      fake(async function* () {
        yield { type: 'result', response: { message: 'x'.repeat(9000), proposals: [] } };
      }),
      new AbortController().signal,
    ))
      void _;
    expect(service.get(plan.id).error).toMatch(/출력/);
    for await (const _ of service.run(
      plan.id,
      fake(async function* () {
        yield { type: 'error', message: '제공자 오류' };
      }),
      new AbortController().signal,
    ))
      void _;
    expect(service.get(plan.id).error).toBe('제공자 오류');
  });

  it('rejects whole-document replacement from excerpts and applies only the supplied range', async () => {
    const a = await store.createDocument(
      '큰 문서',
      'note',
      '# 인증\n' + '내용\n'.repeat(6000) + '\n# 보존\n그대로',
    );
    const service = new AnalysisService(store);
    const plan = service.prepare(input, settings);
    const snapshot = service.get(plan.id).batches[0].snapshot;
    store.saveSnapshot(snapshot);
    const source = snapshot.sources[0];
    const draft = {
      kind: 'update' as const,
      title: '부분 수정',
      documentType: 'note' as const,
      targetId: a.id,
      baseRevision: a.revision,
      replacement: source.content.replace('내용', '수정'),
      sourceIds: [source.id],
      reason: '보완',
      dependencyIds: [],
    };
    const proposals = new ProposalService(store);
    await expect(
      proposals.register(snapshot.id, { message: '', proposals: [draft] }),
    ).rejects.toThrow(/맥락/);
    const [p] = await proposals.register(snapshot.id, {
      message: '',
      proposals: [{ ...draft, scopedSourceId: source.id }],
    });
    const workspace = await proposals.accept(p.id);
    expect(workspace.documents.find((d) => d.id === a.id)!.markdown).toBe(
      a.markdown.slice(0, source.range!.start) +
        draft.replacement +
        a.markdown.slice(source.range!.end),
    );
  });

  it('integrates section relations in small documents and unanchored links to large documents', async () => {
    const a = await store.createDocument('A', 'note', '# A\n## Section\n근거');
    const b = await store.createDocument('B', 'note', '# B\n## Section\n근거');
    store.addRelation(a.sections[1].id, b.sections[1].id, '참조');
    const service = new AnalysisService(store);
    const small = service.prepare(input, settings);
    expect(service.get(small.id).batches.filter((batch) => batch.phase === 'links')).toHaveLength(
      1,
    );
    expect(small.warnings).toHaveLength(0);
    await writeFile(join(root, 'documents/a.md'), '# A\n[B](b.md)');
    await writeFile(join(root, 'documents/b.md'), '# B\n' + '대상 본문 '.repeat(10000));
    store.linkDocuments(
      store.discoverDocuments(['documents/a.md', 'documents/b.md']).files.filter((f) => !f.reason),
    );
    const linked = service.prepare(input, settings);
    const linkBatches = service.get(linked.id).batches.filter((batch) => batch.phase === 'links');
    expect(linkBatches.length).toBeGreaterThan(1);
    expect(linked.warnings).toHaveLength(0);
  });

  it('rejects scoped deletion of managed section IDs and preserves linked CRLF outside the excerpt', async () => {
    const a = await store.createDocument('A', 'note', '# Parent\n본문\n## Child\n내용');
    const service = new AnalysisService(store);
    const plan = service.prepare({ ...input, selectedIds: [a.id] }, settings);
    const snapshot = service.get(plan.id).batches[0].snapshot;
    const source = snapshot.sources[0];
    store.saveSnapshot(snapshot);
    const draft = {
      ...decision(snapshot),
      kind: 'update',
      targetId: a.id,
      baseRevision: a.revision,
      scopedSourceId: source.id,
      replacement: source.content.replace('## Child', 'Child'),
    };
    const [proposal] = await new ProposalService(store).register(snapshot.id, {
      message: '',
      proposals: [draft],
    });
    await expect(new ProposalService(store).accept(proposal.id)).rejects.toThrow(/식별자/);
    expect(store.document(a.id).markdown).toBe(a.markdown);
    const original = '# 링크\r\n' + '본문 유지\r\n'.repeat(4000);
    await writeFile(join(root, 'documents/linked.md'), original);
    store.linkDocuments(
      store.discoverDocuments(['documents/linked.md']).files.filter((f) => !f.reason),
    );
    const linked = store.listDocuments().find((d) => d.relativePath === 'documents/linked.md')!;
    const second = service.prepare({ ...input, selectedIds: [linked.id] }, settings);
    const context = service.get(second.id).batches[0].snapshot;
    const excerpt = context.sources[0];
    store.saveSnapshot(context);
    const replacement = excerpt.content.replace('본문', '수정');
    const [patch] = await new ProposalService(store).register(context.id, {
      message: '',
      proposals: [
        {
          ...draft,
          targetId: linked.id,
          baseRevision: linked.revision,
          sourceIds: [excerpt.id],
          scopedSourceId: excerpt.id,
          replacement,
        },
      ],
    });
    await new ProposalService(store).accept(patch.id);
    expect(store.document(linked.id).markdown).toBe(
      original.slice(0, excerpt.range!.start) + replacement + original.slice(excerpt.range!.end),
    );
  });
});
