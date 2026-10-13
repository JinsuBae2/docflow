import { it, expect } from 'vitest';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ProjectStore } from '../../src/main/project/store';

it('restores drafts and session without writing Markdown and isolates projects', async () => {
  const root = await mkdtemp(join(tmpdir(), 'docflow-drafts-'));
  let a = await ProjectStore.open(join(root, 'a')); const b = await ProjectStore.open(join(root, 'b'));
  try {
    const doc = await a.createDocument('Original', 'note', '# Original');
    const draft = { documentId: doc.id, markdown: '# Unsaved', baseRevision: doc.revision };
    a.saveDraft(draft); a.saveSession({ selectedId: doc.id, view: 'graph', prompt: 'Continue', collapsed: false });
    expect(await readFile(join(a.root, doc.relativePath), 'utf8')).toBe(doc.markdown);
    expect(b.workspace().drafts).toEqual([]); expect(() => b.saveDraft(draft)).toThrow(/문서/);
    const copied = await b.createDocument('Copy', 'note', doc.markdown);
    expect(copied.id).toBe(doc.id);
    b.saveDraft({ ...draft, markdown: '# Other project draft' });
    expect(a.workspace().drafts?.[0].markdown).toBe('# Unsaved');
    a.close(); a = await ProjectStore.open(join(root, 'a'));
    expect(a.workspace().drafts).toEqual([draft]); expect(a.workspace().session?.prompt).toBe('Continue');
    await a.saveDocument(doc.id, '# External revision', doc.revision);
    expect(a.workspace().drafts?.[0].baseRevision).toBe(doc.revision);
    a.discardDraft(doc.id); expect(a.workspace().drafts).toEqual([]);
  } finally { a.close(); b.close(); await rm(root, { recursive: true, force: true }); }
});
