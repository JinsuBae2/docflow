import { lstatSync, existsSync } from 'node:fs';
import { dirname, relative, resolve, isAbsolute } from 'node:path';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkFrontmatter from 'remark-frontmatter';
import GithubSlugger from 'github-slugger';
import type { Document, DocumentAnchor, DocumentLink, Relation } from '../../shared/contracts';
import { safePath, fileIdentity } from './files';
import { checkDocumentPath } from './discovery';
import { revisionOf } from './markdown';

const parser = unified().use(remarkParse).use(remarkGfm).use(remarkFrontmatter, ['yaml']);
function text(node: any): string {
  // GitHub slugs come from rendered text, so raw HTML tags are dropped.
  if (node.type === 'html') return '';
  return node.value || node.alt || (node.children || []).map(text).join('');
}
function visit(node: any, fn: (node: any) => void) {
  fn(node);
  for (const child of node.children || []) visit(child, fn);
}
export function indexDocumentLinks(root: string, documents: Document[]) {
  const trees = new Map(documents.map((doc) => [doc.id, parser.parse(doc.markdown)]));
  const anchors = new Map<string, Map<string, DocumentAnchor>>();
  const documentAnchors: DocumentAnchor[] = [];
  const byIdentity = new Map(documents.map((doc) => [fileIdentity(root, doc.relativePath), doc]));
  for (const doc of documents) {
    const slugger = new GithubSlugger();
    const byLine = new Map(doc.sections.map((section) => [section.line, section]));
    const map = new Map<string, DocumentAnchor>();
    visit(trees.get(doc.id), (node) => {
      if (node.type !== 'heading') return;
      const slug = slugger.slug(text(node));
      const line = node.position.start.line;
      const section = byLine.get(line);
      // Nested headings (blockquote, list) are not sections; they move to their enclosing section.
      const enclosing = doc.sections.filter((item) => item.line <= line).at(-1);
      const anchor: DocumentAnchor = {
        id: section?.id || 'anchor-' + revisionOf(`${doc.id}:${slug}`),
        documentId: doc.id,
        slug,
        line,
        sectionId: section?.id || enclosing?.id || doc.id,
      };
      map.set(slug, anchor);
      documentAnchors.push(anchor);
    });
    for (const section of doc.sections)
      if (!map.has(section.id))
        map.set(section.id, {
          id: section.id,
          documentId: doc.id,
          slug: section.id,
          line: section.line,
          sectionId: section.id,
        });
    anchors.set(doc.id, map);
  }
  const links: DocumentLink[] = [];
  for (const doc of documents) {
    const tree = trees.get(doc.id);
    const definitions = new Map<string, string>();
    visit(tree, (node) => {
      if (node.type === 'definition' && !definitions.has(node.identifier))
        definitions.set(node.identifier, node.url);
    });
    visit(tree, (node) => {
      if (node.type !== 'link' && node.type !== 'linkReference') return;
      const href = node.type === 'link' ? node.url : definitions.get(node.identifier);
      if (typeof href !== 'string') return;
      const link: DocumentLink = {
        id: revisionOf(`${doc.id}:${doc.revision}:${node.position.start.offset}`),
        documentId: doc.id,
        revision: doc.revision,
        href,
        label: text(node),
        line: node.position.start.line,
        column: node.position.start.column,
        status: 'blocked',
      };
      links.push(link);
      try {
        if (
          [...href].some(
            (character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127,
          )
        )
          throw new Error('제어문자가 포함된 URL은 열 수 없습니다.');
        if (/^https?:\/\//i.test(href)) {
          const url = new URL(href);
          if (url.username || url.password)
            throw new Error('인증정보가 포함된 외부 URL은 열 수 없습니다.');
          link.status = 'external';
          return;
        }
        if (/^[a-z][a-z\d+.-]*:/i.test(href) || /^[\\/]/.test(href))
          throw new Error('허용되지 않은 URL 또는 절대 경로입니다.');
        const hash = href.indexOf('#');
        const file = decodeURIComponent(
          (hash < 0 ? href : href.slice(0, hash)).split('?')[0],
        ).replace(/\\/g, '/');
        const anchor = hash < 0 ? '' : decodeURIComponent(href.slice(hash + 1));
        if (isAbsolute(file) || /^[a-z][a-z\d+.-]*:/i.test(file))
          throw new Error('프로젝트 내부 상대 경로만 열 수 있습니다.');
        const path = file
          ? relative(root, resolve(root, dirname(doc.relativePath), file)).replace(/\\/g, '/')
          : doc.relativePath;
        checkDocumentPath(path);
        const target = safePath(root, path);
        if (!/\.(md|markdown)$/i.test(path))
          throw new Error('등록 가능한 Markdown 파일 링크만 지원합니다.');
        link.targetPath = path;
        if (!existsSync(target)) {
          link.status = 'missing';
          link.reason = '대상 파일이 없습니다. 삭제·이동을 확인해 주세요.';
          return;
        }
        const stat = lstatSync(target);
        if (!stat.isFile() || stat.size > 2_000_000)
          throw new Error('2MB 이하의 일반 Markdown 파일만 지원합니다.');
        const destination = byIdentity.get(fileIdentity(root, path));
        if (!destination) {
          link.status = 'unregistered';
          link.reason = '프로젝트 안에 있지만 아직 등록하지 않은 문서입니다.';
          return;
        }
        link.targetDocumentId = destination.id;
        const found = anchor ? anchors.get(destination.id)?.get(anchor) : undefined;
        if (anchor && !found) {
          link.status = 'missing-anchor';
          link.reason = '대상 문서에 해당 제목 앵커가 없습니다.';
          return;
        }
        link.status = 'resolved';
        link.targetId = found?.id || destination.id;
        link.targetSectionId = found?.sectionId || destination.id;
      } catch (error) {
        link.reason = (error as Error).message;
      }
    });
  }
  const relations = new Map<string, Relation>();
  for (const link of links) {
    if (link.status !== 'resolved' || link.documentId === link.targetDocumentId) continue;
    // Relations point at graph nodes (documents/sections), not nested heading anchors.
    const id = 'markdown-' + revisionOf(`${link.documentId}:${link.targetSectionId}`);
    if (!relations.has(id))
      relations.set(id, {
        id,
        fromId: link.documentId,
        toId: link.targetSectionId!,
        type: '원문 링크',
        confirmed: true,
        origin: 'markdown',
        linkId: link.id,
      });
  }
  return { links, anchors: documentAnchors, relations: [...relations.values()] };
}
