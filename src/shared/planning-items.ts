import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkFrontmatter from 'remark-frontmatter';
import type { Document, DocumentType } from './contracts';
import { compareDocuments } from './document-presentation';

interface AstNode {
  type: string;
  value?: string;
  depth?: number;
  children?: AstNode[];
  position?: { start: { line: number; offset: number }; end: { line: number; offset: number } };
}
export interface PlanningItem {
  id: string;
  label: string;
  title: string;
  markdown: string;
  evidence: {
    documentId: string;
    sectionId?: string;
    revision: string;
    start: number;
    end: number;
  };
}
export interface PlanningDocumentGroup {
  document: Document;
  members: Document[];
}
const parser = unified().use(remarkParse).use(remarkGfm).use(remarkFrontmatter, ['yaml']);
const plain = (node: AstNode): string => node.value || (node.children || []).map(plain).join('');
export function planningCategory(doc: {
  title: string;
  type: DocumentType;
  relativePath?: string;
}) {
  const name = `${doc.title} ${doc.relativePath?.split(/[\\/]/).pop() || ''}`;
  const reference =
    /가이드|guide|설치|install|배포|deploy|운영|operations?|실험|테스트|test|용어표|회의록|changelog/i.test(
      name,
    );
  if (doc.type === 'note' && reference)
    return { label: '참고·운영', color: '#526071', core: false };
  for (const [pattern, label, color] of [
    [/요구사항|requirements?|\bprd\b/i, '요구사항', '#7953b8'],
    [/아키텍처|architecture/i, '아키텍처', '#147d78'],
    [/\bapi\b/i, 'API', '#b56722'],
    [/데이터|database|schema|로그.?이벤트/i, '데이터', '#147d78'],
    [/기능|feature|탐지.?규칙/i, '기능·규칙', '#155eef'],
    [/개요|overview|readme/i, '프로젝트 개요', '#7953b8'],
  ] as const)
    if (pattern.test(name)) return { label, color, core: true };
  const explicit = doc.type !== 'note';
  return {
    label: explicit
      ? (
          {
            overview: '개요',
            prd: '요구사항',
            feature: '기능',
            flow: '사용자 흐름',
            design: '설계',
          } as const
        )[doc.type as Exclude<DocumentType, 'note'>]
      : reference
        ? '참고·운영'
        : '문서',
    color: explicit ? '#7953b8' : '#526071',
    core: explicit || !reference,
  };
}
function bodyKey(doc: Document) {
  return doc.markdown
    .replace(/\r\n/g, '\n')
    .replace(/^---\n[\s\S]*?\n---\n/, '')
    .replace(/<!--\s*docflow-section:[^>]+-->\s*/g, '')
    .trim();
}
export function groupPlanningDocuments(
  documents: Document[],
  group = true,
): PlanningDocumentGroup[] {
  const groups = new Map<string, Document[]>();
  for (const doc of documents) {
    const key = group ? bodyKey(doc) || doc.id : doc.id;
    const members = groups.get(key) || [];
    members.push(doc);
    groups.set(key, members);
  }
  return [...groups.values()]
    .map((members) => ({
      document: members.find((doc) => doc.source === 'linked') || members[0],
      members,
    }))
    .sort((a, b) => compareDocuments(a.document, b.document));
}
export function extractPlanningItems(document: Document): PlanningItem[] {
  const tree = parser.parse(document.markdown) as unknown as AstNode;
  const structured: PlanningItem[] = [],
    lists: PlanningItem[] = [];
  const identities = new Set<string>();
  const raw = (node: AstNode) =>
    node.position
      ? document.markdown.slice(node.position.start.offset, node.position.end.offset)
      : plain(node);
  const make = (
    node: AstNode,
    label: string,
    title: string,
    markdown: string,
    endLine?: number,
  ): PlanningItem => {
    const start = node.position?.start.line || 1;
    const section = [...document.sections].reverse().find((section) => section.line <= start);
    return {
      id: `${document.id}:item:${label || start}`,
      label,
      title,
      markdown,
      evidence: {
        documentId: document.id,
        sectionId: section?.id,
        revision: document.revision,
        start,
        end: endLine ?? node.position?.end.line ?? start,
      },
    };
  };
  const add = (
    node: AstNode,
    label: string,
    title: string,
    markdown: string,
    endLine?: number,
    prefer = false,
  ) => {
    const existing = structured.findIndex((item) => item.label === label);
    if (identities.has(label)) {
      if (prefer) structured[existing] = make(node, label, title, markdown, endLine);
      return;
    }
    identities.add(label);
    structured.push(make(node, label, title, markdown, endLine));
  };
  const visit = (node: AstNode) => {
    if (node.type === 'code' || node.type === 'html' || node.type === 'yaml') return;
    if (node.type === 'table') {
      const rows = node.children || [],
        headers = rows[0]?.children?.map(plain) || [];
      const idHeader = headers.findIndex((header) =>
        /^(id|식별자|요구사항.?id|기능.?id)$/i.test(header.trim()),
      );
      const idIndex = Math.max(0, idHeader);
      for (const row of rows.slice(1)) {
        const cells = row.children || [],
          values = cells.map(plain),
          first = values[idIndex] || '';
        const id =
          idHeader >= 0 && /^[A-Za-z0-9가-힣][A-Za-z0-9가-힣_-]{0,60}$/.test(first.trim())
            ? first.trim()
            : /^(?:N?FR|REQ|F|UC|US)[-_][A-Za-z0-9_-]+(?=\s|$)/i.exec(first)?.[0];
        const methodIndex = values.findIndex((value) =>
          /^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)(?:\s+\/|$)/i.test(value),
        );
        const endpoint =
          methodIndex < 0
            ? ''
            : values[methodIndex].trim() +
              (values[methodIndex].includes('/') ? '' : ` ${values[methodIndex + 1] || ''}`);
        const label =
          id || (/^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s+\//i.test(endpoint) ? endpoint : '');
        if (!label) continue;
        const title =
          values.find(
            (value, index) =>
              index !== idIndex && index !== methodIndex && value && !value.startsWith('/'),
          ) || label;
        add(
          row,
          label,
          title,
          cells
            .map(
              (cell, index) =>
                `**${headers[index] || '내용'}**\n\n${raw(cell)
                  .replace(/^\s*\|/, '')
                  .replace(/(?<!\\)\|\s*$/, '')
                  .trim()}`,
            )
            .join('\n\n'),
        );
      }
      return;
    }
    if (node.type === 'heading') {
      const endpoint = /(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s+\/[^\s`]+/i.exec(plain(node));
      if (endpoint) {
        const siblings = tree.children || [];
        const next = siblings
          .slice(siblings.indexOf(node) + 1)
          .find(
            (candidate) =>
              candidate.type === 'heading' && (candidate.depth || 1) <= (node.depth || 1),
          );
        const content = document.markdown
          .slice(
            node.position!.start.offset,
            next?.position?.start.offset ?? document.markdown.length,
          )
          .replace(/\n?<!--\s*docflow-section:[^>]+-->\s*$/, '')
          .trimEnd();
        add(
          node,
          endpoint[0],
          plain(node),
          content,
          (node.position?.start.line || 1) + content.split(/\r?\n/).length - 1,
          true,
        );
      }
    }
    if (node.type === 'listItem') {
      lists.push(make(node, '', plain(node).trim(), raw(node)));
      return;
    }
    node.children?.forEach(visit);
  };
  visit(tree);
  if (structured.length) return structured.sort((a, b) => a.evidence.start - b.evidence.start);
  if (lists.length) return lists;
  const leaves = document.sections.filter(
    (section) => !document.sections.some((child) => child.parentId === section.id),
  );
  if (leaves.length)
    return leaves.map((section) => ({
      id: `${document.id}:section:${section.id}`,
      label: '',
      title: section.title,
      markdown: section.content,
      evidence: {
        documentId: document.id,
        sectionId: section.id,
        revision: document.revision,
        start: section.line,
        end: section.line + section.content.split(/\r?\n/).length - 1,
      },
    }));
  return document.markdown.trim()
    ? [
        {
          id: `${document.id}:body`,
          label: '',
          title: document.title,
          markdown: document.markdown,
          evidence: {
            documentId: document.id,
            revision: document.revision,
            start: 1,
            end: document.markdown.split(/\r?\n/).length,
          },
        },
      ]
    : [];
}
