import { describe, it, expect } from 'vitest';
import { parseDocument } from '../../src/main/project/markdown';
describe('Markdown structure', () => {
  it('keeps duplicate Korean headings distinct and ignores fenced headings', () => {
    const doc = parseDocument(
      '# 설계\n\n## 기능\n내용\n\n```md\n# 가짜\n```\n\n## 기능\n다른 내용',
    );
    expect(doc.sections.map((s: any) => s.title)).toEqual(['설계', '기능', '기능']);
    expect(new Set(doc.sections.map((s: any) => s.id)).size).toBe(3);
    expect(doc.markdown).toContain('docflow-id:');
  });
  it('keeps ids across renaming and flags deleted markers', () => {
    const doc = parseDocument('# 제목\n\n## 기능\n본문');
    const renamed = parseDocument(doc.markdown.replace('## 기능', '## 바뀐 기능'), doc);
    expect(renamed.sections[1].id).toBe(doc.sections[1].id);
    expect(renamed.needsReconnect).toBe(false);
    const stripped = parseDocument(
      renamed.markdown.replace(/<!-- docflow-section:[^>]+-->\n/g, ''),
      renamed,
    );
    expect(stripped.needsReconnect).toBe(true);
  });
  it('repairs duplicate section markers and ignores unsafe document IDs', () => {
    const doc = parseDocument(
      '---\ndocflow-id: ../../outside\n---\n<!-- docflow-section:duplicate -->\n# 하나\n<!-- docflow-section:duplicate -->\n## 둘',
    );
    expect(doc.id).not.toContain('/');
    expect(new Set(doc.sections.map((s) => s.id)).size).toBe(2);
    expect(doc.needsReconnect).toBe(true);
  });
});
