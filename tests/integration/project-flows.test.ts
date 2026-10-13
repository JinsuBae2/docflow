import { expect, it, afterEach } from 'vitest';
import { mkdtemp, mkdir, writeFile, readFile, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ProjectStore } from '../../src/main/project/store';
const roots: string[] = [];
const stores: ProjectStore[] = [];
afterEach(async () => {
  stores.splice(0).forEach((store) => store.close());
  for (const root of roots.splice(0))
    await rm(root, { recursive: true, force: true, maxRetries: 5 });
});
async function fixture(markdown: string) {
  const root = await mkdtemp(join(tmpdir(), 'docflow-flows-'));
  roots.push(root);
  await mkdir(join(root, 'docs'));
  await writeFile(join(root, 'docs/flows.md'), markdown);
  const store = await ProjectStore.open(root);
  stores.push(store);
  const [doc] = store.linkDocuments(store.discoverDocuments().files);
  return { root, store, doc };
}

it('indexes multiple and nested blocks plus relative definition files with stable identity', async () => {
  const original =
    '# 시스템\n## 가입\n```mermaid 로그인\nflowchart TD\nA[시작] --> B[완료]\n```\n\n> ```mermaid\n> sequenceDiagram\n> User->>API: 요청\n> ```\n\n[상태 정의](./state.mmd)\n[다시](state.mmd)\n[위험](../../outside.mmd)\n[없는 파일](missing.mmd)';
  const { root, store, doc } = await fixture(original);
  await writeFile(join(root, 'docs/state.mmd'), 'stateDiagram-v2\n[*] --> Ready');
  const before = store.workspace();
  expect(before.flows.map((flow) => flow.kind)).toEqual(['flowchart', 'sequence', 'state']);
  expect(before.flows[0].title).toBe('로그인');
  expect(before.flows[1].editable).toBe(false);
  expect(before.flowIssues).toHaveLength(2);
  const id = before.flows[0].id;
  await store.saveDocument(doc.id, '# 새로운 설명\n\n' + original, doc.revision);
  expect(store.workspace().flows.find((flow) => flow.title === '로그인')!.id).toBe(id);
  expect(await readFile(join(root, 'docs/state.mmd'), 'utf8')).toBe(
    'stateDiagram-v2\n[*] --> Ready',
  );
});

it('saves only the selected block while preserving fences, other blocks and raw document bytes', async () => {
  const original =
    '# 흐름\r\n설명 유지\r\n~~~mermaid\r\nflowchart TD\r\nA[시작] --> B[완료]\r\n~~~\r\n\r\n```mermaid\r\nsequenceDiagram\r\nA->>B: 보존\r\n```\r\n';
  const { root, store } = await fixture(original);
  const flow = store.workspace().flows[0];
  const result = await store.saveFlow(
    flow.id,
    flow.sourceRevision,
    'flowchart LR\nA[수정] --> B[완료]',
  );
  expect(await readFile(join(root, 'docs/flows.md'), 'utf8')).toBe(
    original.replace('flowchart TD\r\nA[시작]', 'flowchart LR\r\nA[수정]'),
  );
  expect(result.flows.find((item) => item.code.includes('수정'))?.kind).toBe('flowchart');
  store.close();
  stores.pop();
  const reopened = await ProjectStore.open(root);
  stores.push(reopened);
  expect(reopened.workspace().flows.map((item) => item.code)).toEqual(
    result.flows.map((item) => item.code),
  );
});

it('rejects stale, complex, executable and draft-conflicting edits and keeps source unchanged', async () => {
  const { root, store, doc } = await fixture('# 흐름\n```mermaid\nflowchart TD\nA --> B\n```\n');
  const flow = store.workspace().flows[0];
  for (const code of [
    'flowchart TD\nA{결정}-->B',
    'flowchart TD\nclick A bad',
    'sequenceDiagram\nA->>B: 변경',
  ])
    await expect(store.saveFlow(flow.id, flow.sourceRevision, code)).rejects.toThrow();
  store.saveDraft({ documentId: doc.id, markdown: '# 초안 보존', baseRevision: doc.revision });
  await expect(
    store.saveFlow(flow.id, flow.sourceRevision, 'flowchart TD\nA --> C'),
  ).rejects.toThrow(/초안/);
  store.discardDraft(doc.id);
  await writeFile(join(root, 'docs/flows.md'), '# 외부 변경\n');
  await expect(
    store.saveFlow(flow.id, flow.sourceRevision, 'flowchart TD\nA --> C'),
  ).rejects.toThrow();
  expect(await readFile(join(root, 'docs/flows.md'), 'utf8')).toBe('# 외부 변경\n');
});

it('blocks symlink definition files and marks unsupported formats as read-only', async () => {
  const { root, store } = await fixture(
    '# 흐름\n[링크](link.mmd)\n```plantuml\nflowchart TD\nA --> B\n```',
  );
  await writeFile(join(root, 'docs/real.mmd'), 'flowchart TD\nA-->B');
  await symlink(join(root, 'docs/real.mmd'), join(root, 'docs/link.mmd'));
  expect(store.workspace().flowIssues[0]).toMatch(/링크/);
  const flow = store.workspace().flows[0];
  expect(flow.kind).toBe('unsupported');
  expect(flow.editable).toBe(false);
});

it('preserves managed Markdown CRLF and metadata outside the edited flow block', async () => {
  const { root, store } = await fixture('# linked');
  const doc = await store.createDocument(
    '관리 문서',
    'flow',
    '# 관리 문서\n설명 보존\n```mermaid\nflowchart TD\nA --> B\n```\n\n## 다음\n본문 보존\n',
  );
  const original = doc.markdown.replace(/\n/g, '\r\n');
  await writeFile(join(root, doc.relativePath), original);
  const flow = store.workspace().flows.find((flow) => flow.documentId === doc.id)!;
  await store.saveFlow(flow.id, flow.sourceRevision, 'flowchart LR\nA --> B');
  expect(await readFile(join(root, doc.relativePath), 'utf8')).toBe(
    original.replace('flowchart TD', 'flowchart LR'),
  );
});
