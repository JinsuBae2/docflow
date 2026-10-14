import { beforeEach, afterEach, expect, it } from 'vitest';
import { mkdtemp, rm, readFile, writeFile, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ProjectStore } from '../../src/main/project/store';
import { UserFlowStore } from '../../src/main/project/user-flows';
import { parseUserFlow } from '../../src/shared/user-flow';
let root: string;
let store: ProjectStore;
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'docflow-user-flow-'));
  store = await ProjectStore.open(root);
});
afterEach(async () => {
  store.close();
  await rm(root, { recursive: true, force: true });
});
const service = () => new UserFlowStore(root, store.workspace().project.id, store.listDocuments());
const draft = () =>
  parseUserFlow({
    schemaVersion: 1,
    id: 'journey',
    projectId: store.workspace().project.id,
    title: '여정',
    revision: '',
    nodes: [
      {
        id: 'start',
        type: 'startEnd',
        data: { label: '시작', role: 'start' },
        origin: 'inferred',
        evidence: [],
      },
    ],
    edges: [],
  });
it('atomically saves JSON as source of truth and rejects stale revisions and cross-project writes', async () => {
  const doc = await store.createDocument('원문', 'note', '# 시작\n본문');
  const saved = service().save(draft(), null);
  expect(saved.revision).not.toBe('');
  expect(
    JSON.parse(await readFile(join(root, '.workspace/flows/journey.json'), 'utf8')).revision,
  ).toBe(saved.revision);
  expect(() => service().save({ ...saved, title: '중복' }, null)).toThrow();
  expect(() => service().save({ ...saved, projectId: 'other' }, saved.revision)).toThrow();
  const next = service().save({ ...saved, title: '수정' }, saved.revision);
  expect(() => service().save(saved, saved.revision)).toThrow();
  store.close();
  store = await ProjectStore.open(root);
  expect(service().read('journey')).toEqual(next);
  expect(store.document(doc.id).markdown).toBe(doc.markdown);
});
it('checks actual evidence and preserves stale files for reading after a document changes', async () => {
  const doc = await store.createDocument('근거', 'note', '# 시작\n본문');
  const flow = draft();
  flow.nodes[0].origin = 'grounded';
  flow.nodes[0].evidence = [
    {
      documentId: doc.id,
      sectionId: doc.sections[0].id,
      revision: doc.revision,
      quoteRange: { start: doc.markdown.indexOf('# 시작'), end: doc.markdown.length },
    },
  ];
  const saved = service().save(flow, null);
  await store.saveDocument(doc.id, doc.markdown + '\n수정', doc.revision);
  expect(service().read('journey').id).toBe('journey');
  expect(() => service().save(saved, saved.revision)).toThrow(/근거/);
  expect(() => service().save({ ...draft(), id: '../escape' }, null)).toThrow();
});
it('reports corrupt JSON without hiding valid flows and rejects symlink paths', async () => {
  service().save(draft(), null);
  await writeFile(join(root, '.workspace/flows/broken.json'), '{');
  expect(service().list().flows).toHaveLength(1);
  expect(service().list().issues).toHaveLength(1);
  if (process.platform !== 'win32') {
    await symlink(
      join(root, '.workspace/flows/journey.json'),
      join(root, '.workspace/flows/link.json'),
    );
    expect(() => service().read('link')).toThrow();
  }
});
it('imports supported inline Mermaid without rewriting its source document', async () => {
  const doc = await store.createDocument(
    '기존 흐름',
    'flow',
    '# 기존 흐름\n```mermaid\nflowchart LR\nA["화면"]\nB["완료"]\nA --> B\n```',
  );
  const source = store.workspace().flows.find((flow) => flow.documentId === doc.id)!;
  const imported = service().importMermaid(source);
  expect(imported.nodes.map((node) => node.data.label)).toEqual(['화면', '완료']);
  expect(imported.nodes.every((node) => node.origin === 'grounded')).toBe(true);
  expect(imported.edges[0]).toMatchObject({ source: 'A', target: 'B' });
  expect(store.document(doc.id).markdown).toBe(doc.markdown);
  expect(() =>
    service().importMermaid({ ...source, code: 'sequenceDiagram\nA->>B: hello' }),
  ).toThrow();
});
