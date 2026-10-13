import { createHash, randomUUID } from 'node:crypto';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkFrontmatter from 'remark-frontmatter';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import type { Document, Section } from '../../shared/contracts';
const parser = unified().use(remarkParse).use(remarkFrontmatter, ['yaml']);
export const revisionOf = (text: string) => createHash('sha256').update(text, 'utf8').digest('hex');
function plain(node: any): string {
  return node.value || (node.children || []).map(plain).join('');
}
export function parseLinkedDocument(
  input: string,
  previous: Pick<Document, 'id' | 'type' | 'relativePath'> & Partial<Document>,
): Document {
  const headings = parser.parse(input).children.filter((node) => node.type === 'heading') as any[];
  const occurrences = new Map<string, number>();
  const parents: Section[] = [];
  const sections: Section[] = headings.map((heading, order) => {
    const title = plain(heading);
    const key = `${heading.depth}:${title}`;
    const occurrence = occurrences.get(key) || 0;
    occurrences.set(key, occurrence + 1);
    while (parents.length && parents.at(-1)!.level >= heading.depth) parents.pop();
    const section: Section = {
      id: revisionOf(`${previous.id}:${key}:${occurrence}`),
      documentId: previous.id,
      parentId: parents.at(-1)?.id || null,
      title,
      level: heading.depth,
      order,
      line: heading.position.start.line,
      content: input
        .slice(
          heading.position.start.offset,
          headings[order + 1]?.position.start.offset ?? input.length,
        )
        .trim(),
    };
    parents.push(section);
    return section;
  });
  return {
    id: previous.id,
    type: previous.type,
    relativePath: previous.relativePath,
    title: sections[0]?.title || previous.title || '제목 없음',
    markdown: input,
    revision: revisionOf(input),
    sections,
    source: 'linked',
    needsReconnect: !!previous.sections?.some(
      (old) => !sections.some((section) => section.id === old.id),
    ),
  };
}
export function parseDocument(input: string, previous?: Document, fresh = false): Document {
  let markdown = input.replace(/\r\n/g, '\n');
  let tree = parser.parse(markdown);
  const yaml = tree.children[0]?.type === 'yaml' ? (tree.children[0] as any) : undefined;
  let metadata: Record<string, unknown> = {};
  if (yaml) {
    const parsed = parseYaml(yaml.value);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) metadata = parsed;
  }
  const storedId = metadata['docflow-id'];
  const id = fresh
    ? randomUUID()
    : previous?.id ||
      (typeof storedId === 'string' && /^[a-zA-Z0-9_-]{1,100}$/.test(storedId)
        ? storedId
        : randomUUID());
  if (metadata['docflow-id'] !== id) {
    metadata['docflow-id'] = id;
    const header = `---\n${stringifyYaml(metadata)}---\n`;
    markdown = yaml
      ? header + markdown.slice(yaml.position.end.offset).replace(/^\n/, '')
      : header + '\n' + markdown;
    tree = parser.parse(markdown);
  }
  const headings = tree.children.filter((n) => n.type === 'heading') as any[];
  const ids = new Map<number, string>();
  const seen = new Set<string>();
  let invalidMarker = false;
  for (const heading of headings) {
    const offset = heading.position.start.offset;
    const marker = /<!-- docflow-section:([a-zA-Z0-9_-]+) -->\s*$/.exec(markdown.slice(0, offset));
    let sectionId = marker?.[1];
    if (fresh || !sectionId || seen.has(sectionId)) {
      if (!fresh && sectionId) invalidMarker = true;
      sectionId = randomUUID();
    }
    ids.set(offset, sectionId);
    seen.add(sectionId);
  }
  const needsReconnect = invalidMarker || !!previous?.sections.some((s) => !seen.has(s.id));
  for (const heading of [...headings].reverse()) {
    const offset = heading.position.start.offset;
    const existing = /<!-- docflow-section:[a-zA-Z0-9_-]+ -->\s*$/.exec(markdown.slice(0, offset));
    markdown =
      markdown.slice(0, existing ? existing.index : offset) +
      `<!-- docflow-section:${ids.get(offset)} -->\n` +
      markdown.slice(offset);
  }
  tree = parser.parse(markdown);
  const finalHeadings = tree.children.filter((n) => n.type === 'heading') as any[];
  const parents: Section[] = [];
  const sections: Section[] = [];
  for (const [order, heading] of finalHeadings.entries()) {
    const offset = heading.position.start.offset;
    const marker = /<!-- docflow-section:([a-zA-Z0-9_-]+) -->\s*$/.exec(markdown.slice(0, offset));
    while (parents.length && parents.at(-1)!.level >= heading.depth) parents.pop();
    const end = finalHeadings[order + 1]?.position.start.offset ?? markdown.length;
    const section: Section = {
      id: marker?.[1] || randomUUID(),
      documentId: id,
      parentId: parents.at(-1)?.id || null,
      title: plain(heading),
      level: heading.depth,
      order,
      line: heading.position.start.line,
      content: markdown
        .slice(offset, end)
        .replace(/\n<!-- docflow-section:[^>]+-->\s*$/, '')
        .trim(),
    };
    sections.push(section);
    parents.push(section);
  }
  return {
    id,
    type: previous?.type || 'note',
    title: sections[0]?.title || previous?.title || '제목 없음',
    relativePath: previous?.relativePath || '',
    revision: revisionOf(markdown),
    markdown,
    sections,
    needsReconnect,
  };
}
