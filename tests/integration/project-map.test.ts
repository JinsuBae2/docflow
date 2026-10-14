import { afterEach, beforeEach, expect, it } from 'vitest';
import { mkdtemp, rm, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ProjectStore } from '../../src/main/project/store';
import { ProjectMapStore } from '../../src/main/project/map-store';
let root: string;
let store: ProjectStore;
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'docflow-map-'));
  store = await ProjectStore.open(root);
});
afterEach(async () => {
  store.close();
  await rm(root, { recursive: true, force: true });
});
it('builds a root, all documents and distinct real sections without changing source', async () => {
  const doc = await store.createDocument('문서', 'note', '# 제목\n## 반복\n하나\n## 반복\n둘');
  const map = new ProjectMapStore(store).read();
  expect(map.nodes.filter((n) => n.kind === 'root')).toHaveLength(1);
  expect(map.nodes.filter((n) => n.kind === 'document')).toHaveLength(1);
  expect(map.nodes.filter((n) => n.kind === 'section')).toHaveLength(3);
  expect(new Set(map.nodes.map((n) => n.id)).size).toBe(5);
  expect(map.edges.filter((e) => e.kind === 'structure')).toHaveLength(4);
  expect(map.positions).toEqual([]);
  expect(store.document(doc.id).markdown).toBe(doc.markdown);
});
it('persists layout/view per project and rejects invalid IDs/coordinates atomically', async () => {
  const doc = await store.createDocument('문서', 'note', '# 제목');
  const service = new ProjectMapStore(store);
  const map = service.read();
  service.saveLayout(map.projectId, [{ nodeId: doc.id, x: 123, y: -45 }]);
  service.saveView(map.projectId, { collapsedDocumentIds: [doc.id], legendCollapsed: true });
  expect(service.read().version).toBe(2);
  for (const position of [
    { nodeId: doc.id, x: NaN, y: 0 },
    { nodeId: doc.id, x: Infinity, y: 0 },
    { nodeId: 'missing', x: 0, y: 0 },
  ])
    expect(() => service.saveLayout(map.projectId, [position])).toThrow();
  expect(() => service.saveLayout('other', [])).toThrow();
  expect(() =>
    service.saveView(map.projectId, { collapsedDocumentIds: ['missing'], legendCollapsed: false }),
  ).toThrow();
  store.close();
  store = await ProjectStore.open(root);
  expect(new ProjectMapStore(store).read()).toMatchObject({
    positions: [{ nodeId: doc.id, x: 123, y: -45 }],
    collapsedDocumentIds: [doc.id],
    legendCollapsed: true,
  });
});
it('keeps section endpoints and inactive positions without reassigning them on heading changes', async () => {
  const a = await store.createDocument('A', 'note', '# A\n## 같은 제목');
  const b = await store.createDocument('B', 'note', '# B\n## 같은 제목');
  store.addRelation(a.sections[1].id, b.sections[1].id, '설계 근거');
  const service = new ProjectMapStore(store);
  const map = service.read();
  service.saveLayout(map.projectId, [{ nodeId: a.sections[1].id, x: 760, y: 222 }]);
  expect(map.edges.find((e) => e.kind === 'semantic')).toMatchObject({
    fromId: a.sections[1].id,
    toId: b.sections[1].id,
    label: '설계 근거',
  });
  await store.saveDocument(a.id, a.markdown.replace('## 같은 제목', '같은 제목'), a.revision);
  expect(service.read().nodes.some((n) => n.id === a.sections[1].id)).toBe(false);
  expect(service.read().positions).toContainEqual({ nodeId: a.sections[1].id, x: 760, y: 222 });
});
it('drops inactive folded IDs after file deletion so the remaining map can still be saved', async () => {
  const doc = await store.createDocument('접은 문서', 'note', '# 소제목');
  const service = new ProjectMapStore(store);
  const map = service.read();
  service.saveView(map.projectId, { collapsedDocumentIds: [doc.id], legendCollapsed: false });
  await unlink(join(root, doc.relativePath));
  const updated = service.read();
  expect(updated.collapsedDocumentIds).toEqual([]);
  expect(() =>
    service.saveView(map.projectId, {
      collapsedDocumentIds: updated.collapsedDocumentIds,
      legendCollapsed: true,
    }),
  ).not.toThrow();
});
