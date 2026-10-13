import { afterEach, expect, it } from 'vitest';
import { mkdtemp, mkdir, writeFile, readFile, rm, rename, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { realpathSync } from 'node:fs';
import { projectRelativePath } from '../../src/main/project/files';
import { ProjectStore } from '../../src/main/project/store';
import { buildContext } from '../../src/main/project/context';
import { ProposalService } from '../../src/main/project/proposals';

const roots: string[] = [];
const stores: ProjectStore[] = [];
afterEach(async () => {
  stores.splice(0).forEach((store) => store.close());
  for (const root of roots.splice(0))
    await rm(root, { recursive: true, force: true, maxRetries: 5 });
});
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'docflow-linked-'));
  roots.push(root);
  const store = await ProjectStore.open(root);
  stores.push(store);
  await mkdir(join(root, 'docs'));
  return { root, store };
}

it('accepts native project path aliases while rejecting symlinks inside the project', async () => {
  const { root } = await fixture();
  await writeFile(join(root, 'docs', 'native.md'), '# native');
  expect(projectRelativePath(realpathSync(root), join(root, 'docs', 'native.md'))).toBe(
    'docs/native.md',
  );
  await symlink(join(root, 'docs', 'native.md'), join(root, 'docs', 'alias.md'));
  expect(() => projectRelativePath(realpathSync(root), join(root, 'docs', 'alias.md'))).toThrow(
    /링크/,
  );
});

it('discovers nested docs and unsupported files without registering or modifying originals', async () => {
  const { root, store } = await fixture();
  for (const path of ['docs', 'packages/한글 공간/DOCS', 'node_modules/pkg/docs', '.git/docs']) {
    await mkdir(join(root, path), { recursive: true });
    await writeFile(join(root, path, '계획.md'), '# 계획\r\n원본\r\n');
  }
  await writeFile(join(root, 'docs', 'image.png'), 'image');
  const preview = store.discoverDocuments();
  expect(preview.files.map((file) => file.path).sort()).toEqual([
    'docs/image.png',
    'docs/계획.md',
    'packages/한글 공간/DOCS/계획.md',
  ]);
  expect(preview.files.find((file) => file.path.endsWith('image.png'))?.reason).toMatch(/지원/);
  expect(store.workspace().documents).toEqual([]);
  expect(await readFile(join(root, 'docs', '계획.md'), 'utf8')).toBe('# 계획\r\n원본\r\n');
});

it('keeps linked identity, original bytes, drafts and history across restart and explicit saves', async () => {
  const { root, store } = await fixture();
  const original = '---\ncustom: yes\n---\n# 요구사항\r\n## 기능\r\n원본\r\n';
  await writeFile(join(root, 'docs', '요구 사항.markdown'), original);
  const managed = await store.createDocument('기존', 'note');
  const candidate = store.discoverDocuments().files.find((file) => !file.reason)!;
  store.linkDocuments([candidate]);
  const doc = store.workspace().documents.find((item) => item.source === 'linked')!;
  expect(doc.markdown).toBe(original);
  expect(doc.relativePath).toBe('docs/요구 사항.markdown');
  expect(doc.sections.map((section) => section.line)).toEqual([4, 5]);
  store.addRelation(managed.id, doc.sections[1].id, '참고');
  store.saveDraft({ documentId: doc.id, markdown: '# 초안', baseRevision: doc.revision });
  store.addDecision('기존 결정', [doc.id]);
  expect(() => store.linkDocuments([candidate])).toThrow(/등록/);
  expect(await readFile(join(root, doc.relativePath), 'utf8')).toBe(original);
  store.close();
  stores.pop();
  const reopened = await ProjectStore.open(root);
  stores.push(reopened);
  expect(reopened.document(doc.id).sections.map((section) => section.id)).toEqual(
    doc.sections.map((section) => section.id),
  );
  expect(reopened.workspace().drafts?.[0].markdown).toBe('# 초안');
  expect(reopened.workspace().decisions).toHaveLength(1);
  await reopened.saveDocument(doc.id, original + '\n명시 저장', doc.revision);
  expect(await readFile(join(root, doc.relativePath), 'utf8')).toBe(original + '\n명시 저장');
  expect(reopened.document(managed.id).markdown).toBe(managed.markdown);
  expect(reopened.workspace().relations[0].toId).toBe(doc.sections[1].id);
});

it('rejects stale selection and external save conflicts without partially registering or overwriting', async () => {
  const { root, store } = await fixture();
  await writeFile(join(root, 'docs', 'a.md'), '# A');
  await writeFile(join(root, 'docs', 'b.md'), '# B');
  const files = store.discoverDocuments().files;
  await writeFile(join(root, 'docs', 'b.md'), '# 외부 변경');
  expect(() => store.linkDocuments(files)).toThrow(/변경/);
  expect(store.workspace().documents).toEqual([]);
  store.linkDocuments(store.discoverDocuments().files);
  const doc = store.workspace().documents.find((item) => item.title === 'A')!;
  await writeFile(join(root, doc.relativePath), '# A\n외부 수정');
  await expect(store.saveDocument(doc.id, '# 덮어쓰기', doc.revision)).rejects.toThrow(/변경/);
  expect(await readFile(join(root, doc.relativePath), 'utf8')).toBe('# A\n외부 수정');
  await rename(join(root, doc.relativePath), join(root, 'docs', 'moved.md'));
  expect(store.workspace().documentIssues[0]).toMatch(/삭제·이동/);
  expect(store.get('document', doc.id)).toBeDefined();
  await expect(store.saveDocument(doc.id, '# 복원', doc.revision)).rejects.toThrow();
  expect(await readFile(join(root, 'docs', 'moved.md'), 'utf8')).toBe('# A\n외부 수정');
});

it('restricts manual paths and skips symlinks, excluded folders and oversized files', async () => {
  const { root, store } = await fixture();
  await writeFile(join(root, 'README.md'), '# 수동 등록');
  await writeFile(join(root, 'docs', 'large.md'), 'x'.repeat(2_000_001));
  await symlink(join(root, 'README.md'), join(root, 'docs', 'link.md'));
  const files = store.discoverDocuments(['README.md', 'docs']).files;
  expect(files.find((file) => file.path === 'README.md')?.reason).toBeUndefined();
  expect(files.find((file) => file.path === 'docs/large.md')?.reason).toMatch(/2MB/);
  expect(files.find((file) => file.path === 'docs/link.md')?.reason).toMatch(/링크/);
  expect(() => store.discoverDocuments(['../secret.md'])).toThrow();
  expect(() => store.discoverDocuments(['.workspace'])).toThrow();
  expect(() => store.linkDocuments([{ path: 'README.md', revision: 'forged' }])).toThrow(/변경/);
  expect(() => store.linkDocuments([{ path: 'docs/link.md', revision: '' }])).toThrow();
});

it('reports truncated discovery and rejects oversized batches without partial registration', async () => {
  const { root, store } = await fixture();
  for (let index = 0; index < 501; index++)
    await writeFile(join(root, 'docs', `${index}.md`), '# 문서');
  const preview = store.discoverDocuments();
  expect(preview.files.length).toBeLessThan(501);
  expect(preview.warnings.join(' ')).toMatch(/상한/);
  expect(() => store.linkDocuments(preview.files.slice(0, 31))).toThrow(/30/);
  expect(store.workspace().documents).toEqual([]);
  for (let index = 0; index < 6; index++)
    await writeFile(join(root, `${index}.md`), 'x'.repeat(1_800_000));
  const large = store.discoverDocuments(['0.md', '1.md', '2.md', '3.md', '4.md', '5.md']);
  expect(() => store.linkDocuments(large.files)).toThrow(/10MB/);
  expect(store.workspace().documents).toEqual([]);
});

it('accepts reviewed AI updates to linked originals without requiring embedded section markers', async () => {
  const { root, store } = await fixture();
  const original = '# 원본\n## 기능\n기존 내용';
  await writeFile(join(root, 'docs', 'ai.md'), original);
  const [doc] = store.linkDocuments(store.discoverDocuments().files);
  const context = await buildContext(
    { instruction: '보완', selectedIds: [doc.id], excludedIds: [] },
    store,
  );
  const service = new ProposalService(store);
  const [proposal] = await service.register(context.id, {
    message: '검토',
    proposals: [
      {
        kind: 'update',
        title: '기능 보완',
        documentType: 'note',
        targetId: doc.id,
        baseRevision: doc.revision,
        replacement: original + '\n검토한 내용',
        sourceIds: [doc.id],
        reason: '보완',
        dependencyIds: [],
      },
    ],
  });
  expect(await readFile(join(root, 'docs', 'ai.md'), 'utf8')).toBe(original);
  await service.accept(proposal.id);
  expect(await readFile(join(root, 'docs', 'ai.md'), 'utf8')).toBe(original + '\n검토한 내용');
  expect(store.document(doc.id).sections.map((section) => section.id)).toEqual(
    doc.sections.map((section) => section.id),
  );
});
