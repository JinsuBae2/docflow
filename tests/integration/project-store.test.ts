import { describe, it, expect, afterEach } from 'vitest';
import { mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ProjectStore } from '../../src/main/project/store';
const roots: string[] = [];
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }); });
describe('Project storage', () => {
  it('rejects a stored document over 2MB before writing and keeps the original', async () => {
    const root = await mkdtemp(join(tmpdir(), 'docflow-size-')); roots.push(root);
    const store = await ProjectStore.open(root);
    try {
      const doc = await store.createDocument('원본', 'note');
      expect(await store.saveDocument(doc.id, '# Too large\n' + '한'.repeat(700000), doc.revision).then(() => 'saved', e => e.message)).toMatch(/2MB/);
      expect(store.document(doc.id).markdown).toBe(doc.markdown);
    } finally { store.close(); }
  });
  it('preserves documents, links and settings after reopening', async () => {
    const root = await mkdtemp(join(tmpdir(), 'docflow-store-')); roots.push(root);
    let store = await ProjectStore.open(root);
    const a = await store.createDocument('목표', 'prd', '# 목표\n회원가입 없이 사용');
    const b = await store.createDocument('흐름', 'feature', '# 흐름\n파일 열기');
    store.addRelation(a.id, b.id, '구현');
    store.updateProject('개인 도구', '맥락 보존', '로컬');
    store.close(); store = await ProjectStore.open(root);
    expect(store.workspace().documents).toHaveLength(2);
    expect(store.workspace().relations[0].toId).toBe(b.id);
    expect(store.workspace().project.goal).toBe('맥락 보존');
    store.close();
  });
  it('rejects traversal and symlinks and preserves externally edited content', async () => {
    const root = await mkdtemp(join(tmpdir(), 'docflow-path-')); roots.push(root);
    const outside = await mkdtemp(join(tmpdir(), 'docflow-outside-')); roots.push(outside);
    const store = await ProjectStore.open(root);
    await expect(store.importFile('../outside.md')).rejects.toThrow();
    await writeFile(join(outside, 'secret.md'), 'secret');
    await symlink(join(outside, 'secret.md'), join(root, 'documents', 'link.md'));
    await expect(store.importFile('documents/link.md')).rejects.toThrow();
    const doc = await store.createDocument('원본', 'note', '# 원본');
    await writeFile(join(root, doc.relativePath), doc.markdown + '\n외부 변경');
    await expect(store.saveDocument(doc.id, '# 덮어쓰기', doc.revision)).rejects.toThrow(/변경/);
    expect(store.workspace().documents.find(d => d.id === doc.id)!.markdown).toContain('외부 변경');
    store.close();
  });
  it('imports a second copy with quoted YAML IDs without collisions', async () => {
    const root = await mkdtemp(join(tmpdir(), 'docflow-copy-')); roots.push(root);
    const store = await ProjectStore.open(root);
    const first = await store.createDocument('사본', 'note', '# 사본\n## 기능');
    const second = await store.createDocument('사본', 'note', first.markdown.replace('docflow-id:', '"docflow-id":'));
    expect(second.id).not.toBe(first.id);
    expect(second.sections.some(s => first.sections.some(old => old.id === s.id))).toBe(false);
    store.close();
  });
  it('keeps other documents available when an external editor removes one file', async () => {
    const root = await mkdtemp(join(tmpdir(), 'docflow-missing-')); roots.push(root);
    const store = await ProjectStore.open(root);
    const missing = await store.createDocument('삭제된 문서', 'note');
    const safe = await store.createDocument('남은 문서', 'note');
    await rm(join(root, missing.relativePath));
    expect(store.workspace().documents.map(d => d.id)).toEqual([safe.id]);
    expect(store.workspace().documentIssues[0]).toContain('삭제된 문서');
    expect((await store.createDocument('새 문서', 'note')).title).toBe('새 문서');
    store.close();
  });
  it('keeps unreadable document metadata and IDs when importing a backup as a new document', async () => {
    const root = await mkdtemp(join(tmpdir(), 'docflow-backup-')); roots.push(root);
    const store = await ProjectStore.open(root);
    try {
      const original = await store.createDocument('원본', 'prd', '# 원본\n## 요구사항\n보존');
      const other = await store.createDocument('참고', 'note');
      store.addRelation(original.id, other.id, '참고');
      await rm(join(root, original.relativePath));
      const imported = await store.createDocument('가져온 사본', 'note', original.markdown);
      expect(imported.id).not.toBe(original.id);
      expect(imported.sections.some(s => original.sections.some(old => old.id === s.id))).toBe(false);
      expect(store.get<{ type: string; title: string }>('document', original.id)).toMatchObject({ type: 'prd', title: '원본' });
      expect(store.workspace().relations[0].fromId).toBe(original.id);
      expect(store.workspace().documentIssues).toHaveLength(1);
    } finally { store.close(); }
  });
});
