import { dirname, relative, resolve } from 'node:path';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkFrontmatter from 'remark-frontmatter';
import type { Document, ProjectFlow } from '../../shared/contracts';
import { flowKind, flowSafetyError, parseSimpleFlow } from '../../shared/flows';
import { readDocumentFile, safePath, fileIdentity } from './files';
import { checkDocumentPath } from './discovery';
import { revisionOf } from './markdown';

const parser = unified().use(remarkParse).use(remarkGfm).use(remarkFrontmatter, ['yaml']);
const languages = new Set(['mermaid', 'plantuml', 'puml', 'dot', 'graphviz', 'd2']);
const extensions: Record<string, string> = {
  mmd: 'mermaid',
  mermaid: 'mermaid',
  plantuml: 'plantuml',
  puml: 'plantuml',
  dot: 'dot',
  d2: 'd2',
};
function walk(node: any, fn: (node: any, parent: any) => void, parent?: any) {
  fn(node, parent);
  for (const child of node.children || []) walk(child, fn, node);
}
export function indexProjectFlows(root: string, documents: Document[]) {
  const flows: ProjectFlow[] = [];
  const issues: string[] = [];
  const definitions = new Set<string>();
  for (const doc of documents) {
    const tree = parser.parse(doc.markdown);
    const refs = new Map<string, string>();
    walk(tree, (node) => {
      if (node.type === 'definition' && !refs.has(node.identifier))
        refs.set(node.identifier, node.url);
    });
    const occurrences = new Map<string, number>();
    const add = (
      code: string,
      language: string,
      path: string,
      line: number,
      sourceKind: ProjectFlow['sourceKind'],
      sourceRevision: string,
      meta?: string,
      contentStart?: number,
      contentEnd?: number,
    ) => {
      const section = doc.sections.filter((section) => section.line <= line).at(-1);
      const fingerprint = revisionOf(
        `${sourceKind === 'markdown' ? doc.id : path}:${language}:${code}`,
      );
      const occurrence = occurrences.get(fingerprint) || 0;
      occurrences.set(fingerprint, occurrence + 1);
      const safetyError =
        language === 'mermaid'
          ? flowSafetyError(code)
          : '이 형식의 실행 엔진은 설치하지 않습니다. 원문 보기로 확인하세요.';
      const editable =
        language === 'mermaid' &&
        sourceKind === 'markdown' &&
        contentStart !== undefined &&
        !!parseSimpleFlow(code);
      flows.push({
        id: fingerprint + '-' + occurrence,
        documentId: doc.id,
        documentTitle: doc.title,
        title: meta?.trim() || section?.title || doc.title,
        sectionId: section?.id || doc.id,
        sectionTitle: section?.title || doc.title,
        path,
        line: sourceKind === 'definition' ? 1 : line,
        referenceLine: sourceKind === 'definition' ? line : undefined,
        sourceKind,
        sourceRevision,
        language,
        kind: language === 'mermaid' ? flowKind(code) : 'unsupported',
        code,
        editable,
        editReason: editable
          ? undefined
          : sourceKind === 'definition'
            ? '연결된 정의 파일은 읽기 전용입니다.'
            : '복잡한 문법·중첩 블록은 원문을 보존하는 읽기 보기입니다.',
        safetyError,
        contentStart,
        contentEnd,
      });
    };
    walk(tree, (node, parent) => {
      if (node.type === 'code' && languages.has(node.lang?.toLowerCase())) {
        let start: number | undefined;
        let end: number | undefined;
        const raw = doc.markdown.slice(node.position.start.offset, node.position.end.offset);
        const firstEnd = raw.indexOf('\n');
        const lastStart = raw.lastIndexOf('\n') + 1;
        const opening = /^ {0,3}(`{3,}|~{3,})/.exec(raw);
        const closing = /^ {0,3}(`{3,}|~{3,})[ \t]*$/.exec(raw.slice(lastStart));
        if (
          parent?.type === 'root' &&
          opening &&
          closing &&
          opening[1][0] === closing[1][0] &&
          closing[1].length >= opening[1].length &&
          firstEnd >= 0 &&
          lastStart > firstEnd
        ) {
          start = node.position.start.offset + firstEnd + 1;
          end = node.position.start.offset + lastStart;
        }
        add(
          node.value,
          node.lang.toLowerCase(),
          doc.relativePath,
          node.position.start.line,
          'markdown',
          doc.revision,
          node.meta,
          start,
          end,
        );
      }
      const href =
        node.type === 'link'
          ? node.url
          : node.type === 'linkReference'
            ? refs.get(node.identifier)
            : undefined;
      if (typeof href !== 'string') return;
      const file = href.split('#')[0].split('?')[0];
      const language = extensions[file.split('.').at(-1)?.toLowerCase() || ''];
      if (!language) return;
      try {
        const decoded = decodeURIComponent(file).replace(/\\/g, '/');
        if (/^[a-z][a-z\d+.-]*:|^[\\/]/i.test(decoded))
          throw new Error('프로젝트 내부 정의 파일만 읽습니다.');
        const path = relative(root, resolve(root, dirname(doc.relativePath), decoded)).replace(
          /\\/g,
          '/',
        );
        checkDocumentPath(path);
        safePath(root, path);
        const identity = fileIdentity(root, path);
        if (definitions.has(identity)) return;
        const code = readDocumentFile(root, path);
        definitions.add(identity);
        add(
          code,
          language,
          path,
          node.position.start.line,
          'definition',
          revisionOf(code),
          file.split('/').at(-1),
        );
      } catch (error) {
        issues.push(
          `${doc.title} ${node.position.start.line}행 · ${href}: ${(error as Error).message}`,
        );
      }
    });
  }
  return { flows, issues };
}
