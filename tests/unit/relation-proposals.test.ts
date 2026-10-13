import { it, expect, vi } from 'vitest';
import { mkdtemp, rm, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ProjectStore } from '../../src/main/project/store';
import { ProposalService } from '../../src/main/project/proposals';
import { buildContext } from '../../src/main/project/context';
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'docflow-relations-')); const store = await ProjectStore.open(root);
  const a = await store.createDocument('A', 'note', '# A'); const b = await store.createDocument('B', 'note', '# B');
  const context = await buildContext({ instruction: '관계 검토', selectedIds: [a.id, b.id], excludedIds: [] }, store);
  const draft = { kind: 'relation', title: 'A에서 B를 구체화', documentType: 'note', targetId: null, baseRevision: null, replacement: 'A → B · 구체화', sourceIds: [a.id, b.id], reason: '두 문서의 근거', dependencyIds: [], relation: { fromId: a.id, toId: b.id, relationType: '구체화', fromRevision: a.revision, toRevision: b.revision } };
  return { root, store, a, b, context, draft, service: new ProposalService(store), close: async () => { store.close(); await rm(root, { recursive: true, force: true }); } };
}
it('registers without editing, accepts atomically and avoids duplicate connections', async () => {
  const f = await fixture();
  try {
    const [proposal] = await f.service.register(f.context.id, { message: '검토', proposals: [f.draft] });
    expect(f.store.workspace().relations).toHaveLength(0);
    f.store.addRelation(f.a.id, f.b.id, '구체화'); await f.service.accept(proposal.id);
    expect(f.store.workspace().relations).toHaveLength(1); expect(f.store.workspace().proposals[0].status).toBe('accepted');
    const next = await buildContext({ instruction: '관계 검토', selectedIds: [f.a.id, f.b.id], excludedIds: [] }, f.store);
    expect(next.relations).toEqual([{ fromId: f.a.id, toId: f.b.id, type: '구체화' }]);
    const excluded = await buildContext({ instruction: '관계 검토', selectedIds: [f.a.id], excludedIds: [f.b.id] }, f.store);
    expect(excluded.relations).toEqual([]);
    f.store.updateRelation(f.store.workspace().relations[0].id, '근거'); expect(f.store.workspace().relations[0].type).toBe('근거');
    await expect(f.service.accept(proposal.id)).rejects.toThrow(/검토/);
  } finally { await f.close(); }
});
it('rejects self-links, unprovided endpoints and forged revisions without recording a proposal', async () => {
  const f = await fixture();
  try {
    for (const relation of [{ ...f.draft.relation, toId: f.a.id }, { ...f.draft.relation, toId: 'other-project' }, { ...f.draft.relation, fromRevision: 'forged' }]) {
      await expect(f.service.register(f.context.id, { message: '', proposals: [{ ...f.draft, relation }] })).rejects.toThrow();
    }
    expect(f.store.workspace().proposals).toHaveLength(0);
    const excluded = await buildContext({ instruction: '관계', selectedIds: [f.a.id], excludedIds: [f.b.id] }, f.store);
    await expect(f.service.register(excluded.id, { message: '', proposals: [f.draft] })).rejects.toThrow(/근거|문서/);
  } finally { await f.close(); }
});
it('marks changed or removed documents stale and rolls back a partial acceptance', async () => {
  const f = await fixture();
  try {
    const [proposal] = await f.service.register(f.context.id, { message: '', proposals: [f.draft] });
    const original = f.store.put.bind(f.store);
    const spy = vi.spyOn(f.store, 'put').mockImplementation((kind, record) => { if (kind === 'proposal') throw new Error('disk failure'); return original(kind, record); });
    await expect(f.service.accept(proposal.id)).rejects.toThrow('disk failure'); spy.mockRestore();
    expect(f.store.workspace().relations).toHaveLength(0); expect(f.store.workspace().proposals[0].status).toBe('pending');
    await f.store.saveDocument(f.a.id, '# A changed', f.a.revision);
    await expect(f.service.accept(proposal.id)).rejects.toThrow(/변경/); expect(f.store.workspace().proposals[0].status).toBe('stale');
    const next = await buildContext({ instruction: '관계', selectedIds: [f.a.id, f.b.id], excludedIds: [] }, f.store);
    const [removed] = await f.service.register(next.id, { message: '', proposals: [{ ...f.draft, relation: { ...f.draft.relation, fromRevision: f.store.document(f.a.id).revision } }] });
    await unlink(join(f.store.root, f.b.relativePath));
    await expect(f.service.accept(removed.id)).rejects.toThrow(/삭제|변경|문서/); expect(f.store.workspace().proposals.find(p => p.id === removed.id)?.status).toBe('stale');
  } finally { await f.close(); }
});
