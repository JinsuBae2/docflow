import { afterEach, expect, it } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm, symlink, link as hardlink } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ProjectStore } from '../../src/main/project/store';
import { ProposalService } from '../../src/main/project/proposals';
import { buildContext } from '../../src/main/project/context';

const roots: string[] = [];
const stores: ProjectStore[] = [];
afterEach(async () => {
  stores.splice(0).forEach((store) => store.close());
  for (const root of roots.splice(0))
    await rm(root, { recursive: true, force: true, maxRetries: 5 });
});
async function fixture(files: Record<string, string>) {
  const root = await mkdtemp(join(tmpdir(), 'docflow-links-'));
  roots.push(root);
  await mkdir(join(root, 'docs'));
  for (const [name, text] of Object.entries(files)) await writeFile(join(root, name), text);
  const store = await ProjectStore.open(root);
  stores.push(store);
  store.linkDocuments(store.discoverDocuments().files.filter((file) => !file.reason));
  return { root, store };
}

it('resolves inline/reference and encoded relative links to duplicate Korean heading anchors', async () => {
  const { store } = await fixture({
    'docs/a.md':
      '# 시작\n[첫 기능](./한글%20문서.md#기능)\n[두 번째][REF]\n\n[ref]: <한글 문서.md#기능-1>\n\n[내부](#시작)\n[반복](한글%20문서.md#기능)\n`[코드](fake.md)`\n```md\n[코드](fake.md)\n```',
    'docs/한글 문서.md': '# 설계\n## 기능\n처음\n## 기능\n다음',
  });
  const workspace = store.workspace();
  const target = workspace.documents.find((doc) => doc.title === '설계')!;
  expect(workspace.documentLinks).toHaveLength(4);
  expect(workspace.documentLinks.map((link) => link.status)).toEqual([
    'resolved',
    'resolved',
    'resolved',
    'resolved',
  ]);
  expect(workspace.documentLinks[0].targetId).toBe(target.sections[1].id);
  expect(workspace.documentLinks[1].targetId).toBe(target.sections[2].id);
  expect(workspace.relations.filter((relation) => relation.origin === 'markdown')).toHaveLength(2);
});

it('distinguishes unregistered, missing, missing-anchor and external targets and blocks unsafe paths', async () => {
  const { root, store } = await fixture({ 'docs/a.md': '# 시작', 'docs/b.md': '# 목적' });
  await writeFile(join(root, 'docs/new.md'), '# 미등록');
  await symlink(join(root, 'docs/b.md'), join(root, 'docs/link.md'));
  const doc = store.workspace().documents.find((doc) => doc.title === '시작')!;
  const urls = [
    'new.md',
    'missing.md',
    'b.md#없음',
    'https://example.com/path',
    '../../secret.md',
    'javascript:alert(1)',
    'file:///tmp/private.md',
    'link.md',
    '../.workspace/key.md',
    '%2e%2e/%2e%2e/secret.md',
    'https://user:secret@example.com',
    'new.md#unknown',
  ];
  await store.saveDocument(
    doc.id,
    '# 시작\n' + urls.map((url, index) => `[링크${index}](<${url}>)`).join('\n'),
    doc.revision,
  );
  expect(store.workspace().documentLinks.map((link) => link.status)).toEqual([
    'unregistered',
    'missing',
    'missing-anchor',
    'external',
    'blocked',
    'blocked',
    'blocked',
    'blocked',
    'blocked',
    'blocked',
    'blocked',
    'unregistered',
  ]);
  expect(store.workspace().documentLinks[0].targetPath).toBe('docs/new.md');
  expect(store.workspace().relations).toHaveLength(0);
});

it('reindexes only derived links after external edits, saves and restart while preserving direct relations', async () => {
  const { root, store } = await fixture({ 'docs/a.md': '# A\n[문서](b.md)', 'docs/b.md': '# B' });
  const [a, b] = store.workspace().documents;
  const direct = store.addRelation(a.id, b.id, '사용자 관계');
  expect(store.workspace().relations).toHaveLength(2);
  await writeFile(join(root, 'docs/a.md'), '# A\n링크 제거');
  expect(store.workspace().relations).toEqual([direct]);
  const fresh = store.document(a.id);
  await store.saveDocument(a.id, '# A\n[복구](b.md)', fresh.revision);
  const derived = store.workspace().relations.find((relation) => relation.origin === 'markdown')!;
  expect(() => store.updateRelation(derived.id, '변경')).toThrow(/원문/);
  expect(() => store.removeRelation(derived.id)).toThrow(/원문/);
  store.close();
  stores.pop();
  const reopened = await ProjectStore.open(root);
  stores.push(reopened);
  expect(reopened.workspace().relations.map((relation) => relation.id)).toEqual([
    direct.id,
    derived.id,
  ]);
  await rm(join(root, 'docs/b.md'));
  expect(reopened.workspace().documentLinks[0].status).toBe('missing');
  expect(reopened.workspace().relations).toEqual([direct]);
});

it('rejects forged and stale link IDs and keeps AI acceptance distinct from parsed links', async () => {
  const { store } = await fixture({ 'docs/a.md': '# A\n[문서](b.md)', 'docs/b.md': '# B' });
  const workspace = store.workspace();
  const [a, b] = workspace.documents;
  const link = workspace.documentLinks[0];
  expect(store.resolveDocumentLink(a.id, link.id, a.revision).targetId).toBe(b.id);
  expect(() => store.resolveDocumentLink(a.id, 'forged', a.revision)).toThrow(/링크/);
  const context = await buildContext(
    { instruction: '관계 검토', selectedIds: [a.id, b.id], excludedIds: [] },
    store,
  );
  const service = new ProposalService(store);
  const [proposal] = await service.register(context.id, {
    message: '',
    proposals: [
      {
        kind: 'relation',
        title: 'AI 관계',
        documentType: 'note',
        targetId: null,
        baseRevision: null,
        replacement: 'A → B',
        sourceIds: [a.id, b.id],
        reason: '검토',
        dependencyIds: [],
        relation: {
          fromId: a.id,
          toId: b.id,
          relationType: '구체화',
          fromRevision: a.revision,
          toRevision: b.revision,
        },
      },
    ],
  });
  await service.accept(proposal.id);
  expect(store.workspace().relations.map((relation) => relation.origin)).toEqual([
    'ai',
    'markdown',
  ]);
  await store.saveDocument(a.id, '# A\n링크 제거', a.revision);
  expect(() => store.resolveDocumentLink(a.id, link.id, a.revision)).toThrow(/변경/);
  expect(store.workspace().relations.map((relation) => relation.origin)).toEqual(['ai']);
});

it('matches actual file identity across casing aliases and prevents duplicate original registration', async () => {
  const { root, store } = await fixture({
    'docs/a.md': '# A\n[다른 표기](b.md)',
    'docs/B.md': '# B',
  });
  if (!existsSync(join(root, 'docs/b.md')))
    await hardlink(join(root, 'docs/B.md'), join(root, 'docs/b.md'));
  const workspace = store.workspace();
  const b = workspace.documents.find((doc) => doc.title === 'B')!;
  expect(workspace.documentLinks[0].status).toBe('resolved');
  expect(workspace.documentLinks[0].targetId).toBe(b.id);
  expect(store.discoverDocuments(['docs/b.md']).files[0].reason).toMatch(/등록/);
  expect(() => store.linkDocuments([{ path: 'docs/b.md', revision: b.revision }])).toThrow(/등록/);
  expect(store.workspace().documents).toHaveLength(2);
});

it('resolves displayed heading text and nested headings without inserting HTML or modifying section records', async () => {
  const { store } = await fixture({
    'docs/a.md': '# A\n[HTML 제목](b.md#hello-world)\n[인용](b.md#quoted)\n[목록](b.md#list-title)',
    'docs/b.md': '# Hello <em>world</em>\n> ## Quoted\n\n- ### List Title\n\n## Tail',
  });
  const workspace = store.workspace();
  expect(workspace.documentLinks.map((link) => link.status)).toEqual([
    'resolved',
    'resolved',
    'resolved',
  ]);
  const quoted = workspace.documentAnchors.find((anchor) => anchor.slug === 'quoted')!;
  expect(workspace.documentLinks[1].targetId).toBe(quoted.id);
  expect(quoted.line).toBe(2);
  expect(
    workspace.documents.find((doc) => doc.relativePath === 'docs/b.md')!.sections,
  ).toHaveLength(2);
});
