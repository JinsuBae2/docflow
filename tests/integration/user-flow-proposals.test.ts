import { afterEach, beforeEach, expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ProjectStore } from '../../src/main/project/store';
import { UserFlowStore } from '../../src/main/project/user-flows';
import { ProposalService } from '../../src/main/project/proposals';
import { FeedbackService } from '../../src/main/project/feedback';
import { buildContext } from '../../src/main/project/context';
import type { ContextSnapshot } from '../../src/shared/contracts';
import type { UserFlow } from '../../src/shared/user-flow';
let root: string;
let store: ProjectStore;
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'docflow-flow-proposals-'));
  store = await ProjectStore.open(root);
});
afterEach(async () => {
  store.close();
  await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
});
const flows = () => new UserFlowStore(root, store.workspace().project.id, store.listDocuments());
async function context(flowId: string | null = null) {
  const doc =
    store.listDocuments()[0] ||
    (await store.createDocument('가입', 'prd', '# 가입\n로그인 화면에서 가입 버튼을 누릅니다.'));
  const snapshot = await buildContext(
    { instruction: '유저플로우 생성', selectedIds: [doc.id], excludedIds: [], flowId },
    store,
  );
  store.put('context', snapshot);
  return snapshot;
}
function response(snapshot: ContextSnapshot) {
  const source = snapshot.sources[0];
  const base = snapshot.flowContext!.baseFlow;
  const flow: UserFlow = base
    ? structuredClone(base)
    : {
        schemaVersion: 1,
        id: snapshot.flowContext!.flowId,
        projectId: snapshot.flowContext!.projectId,
        revision: '',
        title: '가입 여정',
        nodes: [
          {
            id: 'login',
            type: 'page',
            data: { label: '로그인' },
            origin: 'grounded',
            evidence: [
              {
                documentId: source.documentId,
                sectionId: null,
                revision: source.revision,
                quoteRange: { start: 0, end: source.content.length },
              },
            ],
          },
        ],
        edges: [],
      };
  return {
    message: '흐름 제안',
    proposals: [
      {
        kind: 'flow',
        title: flow.title,
        documentType: 'flow',
        targetId: base?.id || null,
        baseRevision: base?.revision || null,
        replacement: '가입 흐름',
        sourceIds: [source.id],
        reason: '문서에 따른 흐름',
        dependencyIds: [],
        flow,
      },
    ],
  };
}
it('registers grounded flow without writing files; rejects missing, excluded, out-of-range and malformed evidence', async () => {
  const snapshot = await context();
  const service = new ProposalService(store);
  for (const change of ['missing', 'range', 'revision', 'schema']) {
    const raw = response(snapshot);
    const node = raw.proposals[0].flow.nodes[0];
    if (change === 'missing') node.evidence[0].documentId = 'unknown';
    if (change === 'range') node.evidence[0].quoteRange.end += 1;
    if (change === 'revision') node.evidence[0].revision = 'old';
    if (change === 'schema')
      raw.proposals[0].flow.edges.push({
        id: 'bad',
        source: 'absent',
        target: 'login',
        origin: 'inferred',
        evidence: [],
      });
    await expect(service.register(snapshot.id, raw)).rejects.toThrow();
  }
  const [proposal] = await service.register(snapshot.id, response(snapshot));
  expect(proposal.status).toBe('pending');
  expect(proposal.baseFlow).toBeNull();
  expect(flows().list().flows).toHaveLength(0);
});
it('accepts only layout changes, saves once and rejects processed proposals', async () => {
  const snapshot = await context();
  const service = new ProposalService(store);
  const [proposal] = await service.register(snapshot.id, response(snapshot));
  const laid = structuredClone(proposal.flow!);
  laid.nodes[0].position = { x: 42, y: 70 };
  await expect(service.accept(proposal.id, { ...laid, title: 'tampered' })).rejects.toThrow();
  await service.accept(proposal.id, laid);
  expect(flows().read(laid.id).nodes[0].position).toEqual({ x: 42, y: 70 });
  expect(store.workspace().proposals[0].status).toBe('accepted');
  await expect(service.accept(proposal.id, laid)).rejects.toThrow();
});
it('preserves stable node coordinates and detects changed flow revisions at acceptance', async () => {
  const first = await context();
  const initial = response(first).proposals[0].flow;
  initial.nodes[0].position = { x: 123, y: 234 };
  const saved = flows().save(initial, null);
  const snapshot = await context(saved.id);
  const raw = response(snapshot);
  raw.proposals[0].flow.nodes[0].position = { x: 900, y: 900 };
  raw.proposals[0].flow.nodes[0].data.label = '가입 화면';
  const service = new ProposalService(store);
  const [proposal] = await service.register(snapshot.id, raw);
  expect(proposal.flow!.nodes[0].position).toEqual({ x: 123, y: 234 });
  flows().save({ ...saved, title: '외부 수정' }, saved.revision);
  await expect(service.accept(proposal.id, proposal.flow)).rejects.toThrow();
  expect(store.workspace().proposals[0].status).toBe('stale');
});
it('rejects stale document evidence without changing the original flow', async () => {
  const snapshot = await context();
  const service = new ProposalService(store);
  const [proposal] = await service.register(snapshot.id, response(snapshot));
  const doc = store.listDocuments()[0];
  await store.saveDocument(doc.id, doc.markdown + '\n변경', doc.revision);
  await expect(service.accept(proposal.id, proposal.flow)).rejects.toThrow();
  expect(flows().list().flows).toHaveLength(0);
  expect(store.workspace().proposals[0].status).toBe('stale');
});
it('rejects without writing a flow and carries flow context into feedback', async () => {
  const snapshot = await context();
  const [proposal] = await new ProposalService(store).register(snapshot.id, response(snapshot));
  new FeedbackService(store).prepare(proposal.id, '완료 화면 추가', 'feedback');
  const next = await buildContext(
    { instruction: '피드백', selectedIds: [], excludedIds: [] },
    store,
    undefined,
    'feedback',
  );
  expect(next.flowContext?.flowId).toBe(snapshot.flowContext!.flowId);
  expect(next.sources.length).toBeGreaterThan(0);
  expect(flows().list().flows).toHaveLength(0);
  expect(store.workspace().proposals[0].status).toBe('rejected');
});
it('preserves section-only context in feedback without exposing other document sections', async () => {
  const doc = await store.createDocument(
    '범위',
    'prd',
    '# 공개\n화면 이동\n# 비공개\n전달 금지 내용',
  );
  const snapshot = await buildContext(
    { instruction: '플로우', selectedIds: [doc.sections[0].id], excludedIds: [], flowId: null },
    store,
  );
  const raw = response(snapshot);
  raw.proposals[0].flow.nodes[0].evidence[0] = {
    documentId: doc.id,
    sectionId: doc.sections[0].id,
    revision: doc.revision,
    quoteRange: snapshot.sources[0].range!,
  };
  const [proposal] = await new ProposalService(store).register(snapshot.id, raw);
  new FeedbackService(store).prepare(proposal.id, '다시 검토', 'scoped-feedback');
  const next = await buildContext(
    { instruction: '피드백', selectedIds: [], excludedIds: [] },
    store,
    undefined,
    'scoped-feedback',
  );
  expect(
    next.sources.every(
      (source) => source.complete === false && source.sectionId === doc.sections[0].id,
    ),
  ).toBe(true);
  expect(next.sources.some((source) => source.content.includes('전달 금지 내용'))).toBe(false);
});
it('recovers accepted flow status after interruption between file replacement and database persistence', async () => {
  const snapshot = await context();
  const [proposal] = await new ProposalService(store).register(snapshot.id, response(snapshot));
  const flow = structuredClone(proposal.flow!);
  flow.nodes[0].position = { x: 10, y: 20 };
  expect(() => store.saveUserFlowProposal(flow, null, proposal.id, 'replaced')).toThrow(
    /Injected interruption/,
  );
  store.close();
  store = await ProjectStore.open(root);
  expect(store.workspace().proposals[0].status).toBe('accepted');
  expect(flows().read(flow.id).nodes[0].position).toEqual({ x: 10, y: 20 });
  expect(store.listDocuments()).toHaveLength(1);
});
