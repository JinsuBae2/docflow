import {
  existsSync,
  lstatSync,
  readdirSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { randomUUID } from 'node:crypto';
import type { Document, ProjectFlow } from '../../shared/contracts';
import { parseUserFlow, type UserFlow } from '../../shared/user-flow';
import { parseSimpleFlow } from '../../shared/flows';
import { ensureProjectDirectory, safePath } from './files';
import { revisionOf } from './markdown';

export class UserFlowStore {
  constructor(
    private root: string,
    private projectId: string,
    private documents: Document[],
  ) {}
  private path(id: string) {
    if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,100}$/.test(id))
      throw new Error('플로우 ID가 올바르지 않습니다.');
    return safePath(this.root, `.workspace/flows/${id}.json`);
  }
  private version(flow: UserFlow): UserFlow {
    return { ...flow, revision: revisionOf(JSON.stringify({ ...flow, revision: '' })) };
  }
  read(id: string): UserFlow {
    const path = this.path(id);
    const stat = lstatSync(path);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 2_000_000)
      throw new Error('2MB 이하의 일반 플로우 JSON만 열 수 있습니다.');
    const flow = parseUserFlow(JSON.parse(readFileSync(path, 'utf8')));
    if (flow.id !== id || flow.projectId !== this.projectId)
      throw new Error('플로우의 프로젝트 또는 ID가 다릅니다.');
    return this.version(flow);
  }
  list(): { flows: UserFlow[]; issues: string[] } {
    const flows: UserFlow[] = [],
      issues: string[] = [];
    try {
      const path = safePath(this.root, '.workspace/flows');
      if (!existsSync(path)) return { flows, issues };
      for (const name of readdirSync(path)
        .filter((name) => name.endsWith('.json'))
        .sort()) {
        try {
          flows.push(this.read(name.slice(0, -5)));
        } catch (error) {
          issues.push(`${name}: ${(error as Error).message}`);
        }
      }
    } catch (error) {
      issues.push((error as Error).message);
    }
    return { flows, issues };
  }
  save(input: unknown, expectedRevision: string | null) {
    const flow = parseUserFlow(input);
    if (flow.projectId !== this.projectId) throw new Error('프로젝트가 변경되었습니다.');
    ensureProjectDirectory(this.root, '.workspace/flows');
    const path = this.path(flow.id);
    const current = existsSync(path) ? this.read(flow.id) : undefined;
    if (
      (current?.revision || null) !== expectedRevision ||
      (current && flow.revision !== expectedRevision)
    )
      throw new Error('플로우가 변경되었습니다. 최신 JSON을 다시 불러와 주세요.');
    for (const item of [...flow.nodes, ...flow.edges])
      for (const evidence of item.evidence) {
        const doc = this.documents.find((doc) => doc.id === evidence.documentId);
        const section = evidence.sectionId
          ? doc?.sections.find((section) => section.id === evidence.sectionId)
          : undefined;
        if (
          !doc ||
          doc.revision !== evidence.revision ||
          evidence.quoteRange.end > doc.markdown.length ||
          (evidence.sectionId && !section)
        )
          throw new Error('문서 근거가 변경되었거나 범위를 확인할 수 없습니다.');
        if (section) {
          const lines = doc.markdown.split('\n');
          const offset = (line: number) =>
            lines.slice(0, line - 1).reduce((total, text) => total + text.length + 1, 0);
          const next = doc.sections.find(
            (candidate) => candidate.line > section.line && candidate.level <= section.level,
          );
          if (
            evidence.quoteRange.start < offset(section.line) ||
            evidence.quoteRange.end > (next ? offset(next.line) : doc.markdown.length)
          )
            throw new Error('문서 근거가 해당 섹션 범위를 벗어났습니다.');
        }
      }
    const saved = this.version(flow);
    const text = JSON.stringify(saved, null, 2) + '\n';
    if (Buffer.byteLength(text, 'utf8') > 2_000_000)
      throw new Error('플로우 JSON은 2MB 이하여야 합니다.');
    const temporary = safePath(this.root, `.workspace/flows/${flow.id}-${randomUUID()}.tmp`);
    try {
      writeFileSync(temporary, text, { encoding: 'utf8', flag: 'wx' });
      renameSync(temporary, path);
    } finally {
      if (existsSync(temporary)) unlinkSync(temporary);
    }
    return saved;
  }
  importMermaid(source: ProjectFlow) {
    const simple = parseSimpleFlow(source.code);
    const doc = this.documents.find((doc) => doc.id === source.documentId);
    if (
      !simple ||
      !doc ||
      source.sourceKind !== 'markdown' ||
      source.contentStart === undefined ||
      source.contentEnd === undefined
    )
      throw new Error('문서 안의 지원 가능한 단순 flowchart만 가져올 수 있습니다.');
    const evidence = [
      {
        documentId: doc.id,
        sectionId: source.sectionId || null,
        revision: doc.revision,
        quoteRange: { start: source.contentStart, end: source.contentEnd },
      },
    ];
    const flow = parseUserFlow({
      schemaVersion: 1,
      id: randomUUID(),
      projectId: this.projectId,
      title: source.title,
      revision: '',
      nodes: simple.nodes.map((node) => ({
        id: node.id,
        type: 'action',
        data: { label: node.label },
        origin: 'grounded',
        evidence,
      })),
      edges: simple.edges.map((edge, index) => ({
        id: `edge-${index}`,
        source: edge.from,
        target: edge.to,
        origin: 'grounded',
        evidence,
      })),
    });
    return this.save(flow, null);
  }
}
