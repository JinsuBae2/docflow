import { DatabaseSync } from 'node:sqlite';
import type { MapView } from '../../shared/project-map';
import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, realpathSync } from 'node:fs';
import { basename, relative } from 'node:path';
import type {
  Document,
  DocumentType,
  Project,
  Workspace,
  Relation,
  Decision,
  Proposal,
  ContextSnapshot,
  ContextSource,
  AnalysisSummary,
  Message,
  EditorDraft,
  ProjectSession,
  RequestUsage,
  UsageSummary,
  AiProviderId,
  RejectionFeedback,
} from '../../shared/contracts';
import { parseDocument, parseLinkedDocument, revisionOf } from './markdown';
import { discoverDocuments, checkDocumentPath } from './discovery';
import { indexDocumentLinks } from './links';
import { indexProjectFlows } from './flows';
import { UserFlowStore } from './user-flows';
import { parseSimpleFlow } from '../../shared/flows';
import { ensureProjectDirectory, safePath, readDocumentFile, fileIdentity } from './files';
import { commitFile, recoverPendingOperations, type RecoveryOperation } from './recovery';
type DocumentRecord = Omit<Document, 'markdown' | 'sections'> & { sections: Array<{ id: string }> };
export class ProjectStore {
  private db: DatabaseSync;
  private documentIssues: string[] = [];
  private constructor(readonly root: string) {
    ensureProjectDirectory(root, 'documents');
    ensureProjectDirectory(root, '.workspace');
    this.db = new DatabaseSync(safePath(root, '.workspace/project.db'));
    this.db.exec(
      'PRAGMA journal_mode=WAL; PRAGMA user_version=1; CREATE TABLE IF NOT EXISTS records (kind TEXT NOT NULL, id TEXT NOT NULL, value TEXT NOT NULL, PRIMARY KEY(kind,id));',
    );
    if (!this.all<Project>('project').length)
      this.put('project', { id: randomUUID(), name: basename(root), goal: '', constraints: '' });
    recoverPendingOperations(root, (op) => this.persistOperation(op));
    for (const usage of this.all<RequestUsage>('usage'))
      if (usage.status === 'running') this.put('usage', { ...usage, status: 'error' });
    for (const feedback of this.all<RejectionFeedback>('feedback'))
      if (feedback.status === 'running') this.put('feedback', { ...feedback, status: 'failed' });
    for (const analysis of this.all<AnalysisSummary>('analysis'))
      if (analysis.status === 'running') this.put('analysis', { ...analysis, status: 'paused' });
  }
  static async open(root: string) {
    mkdirSync(root, { recursive: true });
    return new ProjectStore(realpathSync(root));
  }
  all<T>(kind: string): T[] {
    return (
      this.db.prepare('SELECT value FROM records WHERE kind=? ORDER BY rowid').all(kind) as {
        value: string;
      }[]
    ).map((row) => JSON.parse(row.value));
  }
  get<T>(kind: string, id: string): T | undefined {
    const row = this.db.prepare('SELECT value FROM records WHERE kind=? AND id=?').get(kind, id) as
      { value: string } | undefined;
    return row ? JSON.parse(row.value) : undefined;
  }
  put<T extends { id: string }>(kind: string, record: T) {
    this.db
      .prepare(
        'INSERT INTO records(kind,id,value) VALUES (?,?,?) ON CONFLICT(kind,id) DO UPDATE SET value=excluded.value',
      )
      .run(kind, record.id, JSON.stringify(record));
  }
  remove(kind: string, id: string) {
    this.db.prepare('DELETE FROM records WHERE kind=? AND id=?').run(kind, id);
  }
  transaction<T>(write: () => T): T {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const result = write();
      this.db.exec('COMMIT');
      return result;
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }
  private record(doc: Document): DocumentRecord {
    const { markdown: _markdown, sections, ...rest } = doc;
    return { ...rest, sections: sections.map((s) => ({ id: s.id })) };
  }
  private checkSize(doc: Document) {
    if (Buffer.byteLength(doc.markdown, 'utf8') > 2_000_000)
      throw new Error('문서 식별자를 포함한 저장 크기는 2MB 이하여야 합니다.');
  }
  private persistOperation(op: RecoveryOperation) {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      this.put('document', op.record as DocumentRecord);
      if (op.proposalId) {
        const proposal = this.get<Proposal>('proposal', op.proposalId);
        if (proposal)
          this.put('proposal', {
            ...proposal,
            status: 'accepted',
            resultDocumentId: (op.record as DocumentRecord).id,
          });
      }
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }
  listDocuments(): Document[] {
    this.documentIssues = [];
    return this.all<DocumentRecord>('document').flatMap((record) => {
      try {
        const raw = readDocumentFile(this.root, record.relativePath);
        const parsed =
          record.source === 'linked'
            ? parseLinkedDocument(raw, record as Document)
            : parseDocument(raw, record as Document);
        return [
          {
            ...parsed,
            type: record.type,
            relativePath: record.relativePath,
            markdown: raw,
            revision: revisionOf(raw),
            needsReconnect: parsed.needsReconnect,
          },
        ];
      } catch {
        this.documentIssues.push(
          `${record.title}: 파일을 읽을 수 없습니다. 삭제·이동·권한을 확인해 주세요. 메타데이터는 보존됩니다.`,
        );
        return [];
      }
    });
  }
  document(id: string): Document {
    const doc = this.listDocuments().find((d) => d.id === id);
    if (!doc) throw new Error('문서를 찾을 수 없습니다.');
    return doc;
  }
  discoverDocuments(paths?: string[]) {
    return discoverDocuments(
      this.root,
      new Set(this.all<DocumentRecord>('document').map((record) => record.relativePath)),
      paths,
    );
  }
  linkDocuments(files: Array<{ path: string; revision?: string }>) {
    if (!files.length || files.length > 30) throw new Error('한 번에 1~30개 문서를 선택해 주세요.');
    const paths = new Set(
      this.all<DocumentRecord>('document').map((record) =>
        fileIdentity(this.root, record.relativePath),
      ),
    );
    let bytes = 0;
    const validated = files.map((file) => {
      checkDocumentPath(file.path);
      if (!/\.(md|markdown)$/i.test(file.path))
        throw new Error('Markdown 파일만 등록할 수 있습니다.');
      const path = relative(this.root, safePath(this.root, file.path)).replace(/\\/g, '/');
      const key = fileIdentity(this.root, path);
      if (paths.has(key)) throw new Error('이미 등록된 문서입니다.');
      paths.add(key);
      const text = readDocumentFile(this.root, path);
      bytes += Buffer.byteLength(text, 'utf8');
      if (bytes > 10_000_000) throw new Error('선택한 문서의 전체 크기는 10MB 이하여야 합니다.');
      if (text.includes('\0')) throw new Error('텍스트 Markdown 파일만 지원합니다.');
      if (revisionOf(text) !== file.revision)
        throw new Error('선택한 파일이 외부에서 변경되었습니다. 다시 탐색해 주세요.');
      return { path, text };
    });
    const docs = validated.map(({ path, text }) =>
      parseLinkedDocument(text, {
        id: randomUUID(),
        type: 'note',
        relativePath: path,
        title: basename(path),
      }),
    );
    this.transaction(() => docs.forEach((doc) => this.put('document', this.record(doc))));
    return docs;
  }
  async createDocument(
    title: string,
    type: DocumentType,
    content = `# ${title}\n\n`,
  ): Promise<Document> {
    let doc = parseDocument(content);
    const existing = this.all<DocumentRecord>('document');
    const sectionIds = new Set([
      ...existing.flatMap((d) => d.sections.map((s) => s.id)),
      ...this.listDocuments().flatMap((d) => d.sections.map((s) => s.id)),
    ]);
    if (existing.some((d) => d.id === doc.id) || doc.sections.some((s) => sectionIds.has(s.id)))
      doc = parseDocument(content, undefined, true);
    doc.type = type;
    doc.relativePath = `documents/${doc.id}.md`;
    this.checkSize(doc);
    if (existsSync(safePath(this.root, doc.relativePath)))
      throw new Error('문서 경로가 이미 존재합니다.');
    commitFile(
      this.root,
      { path: doc.relativePath, before: null, after: doc.markdown, record: this.record(doc) },
      (op) => this.persistOperation(op),
    );
    return doc;
  }
  async saveDocument(
    id: string,
    markdown: string,
    expectedRevision: string,
    proposalId?: string,
    failAt?: 'prepared' | 'replaced',
  ) {
    const previous = this.document(id);
    if (previous.revision !== expectedRevision)
      throw new Error('문서가 외부에서 변경되었습니다. 최신 내용을 다시 확인해 주세요.');
    const doc =
      previous.source === 'linked'
        ? parseLinkedDocument(markdown, previous)
        : parseDocument(markdown, previous);
    this.checkSize(doc);
    commitFile(
      this.root,
      {
        path: doc.relativePath,
        before: previous.markdown,
        after: doc.markdown,
        record: this.record(doc),
        proposalId,
      },
      (op) => this.persistOperation(op),
      failAt,
    );
    return doc;
  }
  async createFromProposal(proposal: Proposal): Promise<Document> {
    const doc = parseDocument(proposal.replacement, undefined, true);
    doc.type = proposal.documentType;
    this.checkSize(doc);
    if (this.get('document', doc.id))
      throw new Error('새 문서 ID가 기존 문서와 겹칩니다. 다시 생성해 주세요.');
    doc.relativePath = `documents/${doc.id}.md`;
    commitFile(
      this.root,
      {
        path: doc.relativePath,
        before: null,
        after: doc.markdown,
        record: this.record(doc),
        proposalId: proposal.id,
      },
      (op) => this.persistOperation(op),
    );
    return doc;
  }
  async importFile(relativePath: string) {
    return this.createDocument(
      basename(relativePath, '.md'),
      'note',
      readDocumentFile(this.root, relativePath),
    );
  }
  addRelation(
    fromId: string,
    toId: string,
    type: string,
    origin: 'manual' | 'ai' = 'manual',
  ): Relation {
    const docs = this.listDocuments();
    const allowed = new Set(docs.flatMap((d) => [d.id, ...d.sections.map((s) => s.id)]));
    if (fromId === toId || !allowed.has(fromId) || !allowed.has(toId))
      throw new Error('연결할 두 문서를 확인해 주세요.');
    const existing = this.all<Relation>('relation').find(
      (r) => r.fromId === fromId && r.toId === toId && r.type === type,
    );
    // Accepting an AI proposal for an existing link is idempotent; a manual duplicate is a user error.
    if (existing && origin === 'manual') throw new Error('같은 유형의 연결이 이미 있습니다.');
    if (existing) return existing;
    const relation = { id: randomUUID(), fromId, toId, type, confirmed: true, origin };
    this.put('relation', relation);
    return relation;
  }
  updateProject(name: string, goal: string, constraints: string) {
    const project = this.all<Project>('project')[0];
    this.put('project', { ...project, name, goal, constraints });
  }
  updateRelation(id: string, type: string) {
    if (id.startsWith('markdown-')) throw new Error('원문 링크는 문서 본문에서 수정해 주세요.');
    const relation = this.get<Relation>('relation', id);
    if (!relation) throw new Error('수정할 연결을 찾을 수 없습니다.');
    if (
      this.all<Relation>('relation').some(
        (r) =>
          r.id !== id &&
          r.fromId === relation.fromId &&
          r.toId === relation.toId &&
          r.type === type,
      )
    )
      throw new Error('같은 유형의 연결이 이미 있습니다.');
    this.put('relation', { ...relation, type });
  }
  removeRelation(id: string) {
    if (id.startsWith('markdown-')) throw new Error('원문 링크는 문서 본문에서 제거해 주세요.');
    this.remove('relation', id);
  }
  acceptRelationProposal(id: string) {
    const proposal = this.get<Proposal>('proposal', id);
    if (
      !proposal ||
      proposal.status !== 'pending' ||
      proposal.kind !== 'relation' ||
      !proposal.relation
    )
      throw new Error('검토 대기 중인 관계 제안을 확인해 주세요.');
    const relation = proposal.relation;
    if (
      this.document(relation.fromId).revision !== relation.fromRevision ||
      this.document(relation.toId).revision !== relation.toRevision
    )
      throw new Error('문서가 변경되어 관계를 다시 검토해야 합니다.');
    this.db.exec('BEGIN IMMEDIATE');
    try {
      this.addRelation(relation.fromId, relation.toId, relation.relationType, 'ai');
      this.put('proposal', { ...proposal, status: 'accepted' });
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }
  saveDraft(draft: EditorDraft) {
    this.document(draft.documentId);
    this.put('draft', { ...draft, id: draft.documentId });
  }
  discardDraft(documentId: string) {
    this.remove('draft', documentId);
  }
  saveSession(session: ProjectSession) {
    this.put('session', { ...session, id: 'current' });
  }
  saveUsage(record: RequestUsage) {
    this.put('usage', record);
  }
  usageSummary(): UsageSummary {
    const requests = this.all<RequestUsage>('usage');
    const known = new Set(requests.map((r) => r.id));
    for (const message of this.all<Message>('message').filter((m) => m.role === 'user')) {
      if (known.has(message.requestId)) continue;
      known.add(message.requestId);
      requests.push({
        id: message.requestId,
        provider: null,
        model: null,
        createdAt: message.createdAt,
        status: 'unknown',
        usage: {
          inputTokens: null,
          outputTokens: null,
          cachedInputTokens: null,
          cacheWriteInputTokens: null,
          totalTokens: null,
          reason: 'no_history',
        },
      });
    }
    const totals = (['codex', 'claude'] as AiProviderId[]).map((provider) => {
      const rows = requests.filter((r) => r.provider === provider);
      return {
        provider,
        totalTokens: rows.reduce((sum, r) => sum + (r.usage.totalTokens ?? 0), 0),
        knownRequests: rows.filter((r) => r.usage.totalTokens !== null).length,
        unknownRequests: rows.filter((r) => r.usage.totalTokens === null).length,
      };
    });
    return { requests: requests.sort((a, b) => b.createdAt.localeCompare(a.createdAt)), totals };
  }
  addDecision(text: string, sourceIds: string[], proposalId?: string): Decision {
    const decision = {
      id: proposalId || randomUUID(),
      text,
      sourceIds,
      status: 'accepted' as const,
    };
    this.db.exec('BEGIN IMMEDIATE');
    try {
      this.put('decision', decision);
      if (proposalId) {
        const p = this.get<Proposal>('proposal', proposalId);
        if (p) this.put('proposal', { ...p, status: 'accepted' });
      }
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
    return decision;
  }
  workspace(): Workspace {
    const documents = this.listDocuments();
    const indexed = indexDocumentLinks(this.root, documents);
    const flowIndex = indexProjectFlows(this.root, documents);
    const userFlowIndex = new UserFlowStore(
      this.root,
      this.all<Project>('project')[0].id,
      documents,
    ).list();
    const proposals = this.all<Proposal>('proposal');
    const staleDiagramIds = proposals
      .filter((p) => p.kind === 'diagram' && p.status === 'accepted' && p.resultDocumentId)
      .filter((p) => {
        const context = this.get<ContextSnapshot>('context', p.snapshotId);
        return context?.sources.some(
          (s) =>
            p.sourceIds.includes(s.id) &&
            documents.find((d) => d.id === s.documentId)?.revision !== s.revision,
        );
      })
      .map((p) => p.resultDocumentId!);
    return {
      root: this.root,
      mapView: this.get<MapView>('map-view', this.all<Project>('project')[0].id),
      project: this.all<Project>('project')[0],
      documents,
      relations: [...this.all<Relation>('relation'), ...indexed.relations],
      documentLinks: indexed.links,
      documentAnchors: indexed.anchors,
      flows: flowIndex.flows,
      userFlows: userFlowIndex.flows,
      userFlowIssues: userFlowIndex.issues,
      flowIssues: flowIndex.issues,
      decisions: this.all<Decision>('decision'),
      proposals,
      messages: this.all<Message>('message'),
      staleDiagramIds,
      documentIssues: this.documentIssues,
      drafts: this.all<EditorDraft & { id: string }>('draft').map(({ id: _id, ...draft }) => draft),
      session: this.get<ProjectSession>('session', 'current'),
      feedbacks: this.all<RejectionFeedback>('feedback'),
    };
  }
  saveExcerpt(source: ContextSource, replacement: string, proposalId: string) {
    const doc = this.document(source.documentId);
    if (
      doc.revision !== source.revision ||
      !source.range ||
      doc.markdown.slice(source.range.start, source.range.end) !== source.content
    )
      throw new Error('발췌 원문이 변경되었습니다. 다시 검토해 주세요.');
    if (this.all<EditorDraft>('draft').some((d) => d.documentId === doc.id))
      throw new Error('초안을 저장하거나 취소한 뒤 제안을 수락해 주세요.');
    const markdown =
      doc.markdown.slice(0, source.range.start) +
      replacement +
      doc.markdown.slice(source.range.end);
    const parsed =
      doc.source === 'linked' ? parseLinkedDocument(markdown, doc) : parseDocument(markdown, doc);
    if (
      parsed.markdown.replace(/\r\n/g, '\n') !== markdown.replace(/\r\n/g, '\n') ||
      (doc.source !== 'linked' &&
        doc.sections.some((s) => !parsed.sections.some((next) => next.id === s.id)))
    )
      throw new Error('발췌 수정에서 문서 식별자가 변경되었습니다. 원문 ID를 보존해 주세요.');
    const saved = { ...parsed, markdown, revision: revisionOf(markdown) };
    this.checkSize(saved);
    commitFile(
      this.root,
      {
        path: saved.relativePath,
        before: doc.markdown,
        after: markdown,
        record: this.record(saved),
        proposalId,
      },
      (op) => this.persistOperation(op),
    );
  }
  async saveFlow(id: string, sourceRevision: string, code: string): Promise<Workspace> {
    const flow = this.workspace().flows.find((flow) => flow.id === id);
    if (!flow || flow.sourceRevision !== sourceRevision)
      throw new Error('흐름 원문이 변경되었습니다. 최신 내용을 확인해 주세요.');
    if (
      !flow.editable ||
      flow.contentStart === undefined ||
      flow.contentEnd === undefined ||
      !parseSimpleFlow(code)
    )
      throw new Error('기본 흐름도의 편집 가능한 부분집합만 저장할 수 있습니다.');
    if (this.all<EditorDraft>('draft').some((draft) => draft.documentId === flow.documentId))
      throw new Error('원본 문서의 초안을 저장하거나 취소한 뒤 흐름을 편집해 주세요.');
    const doc = this.document(flow.documentId);
    if (doc.revision !== sourceRevision)
      throw new Error('흐름 원문이 변경되었습니다. 최신 내용을 확인해 주세요.');
    const newline = doc.markdown.includes('\r\n') ? '\r\n' : '\n';
    const body = code.trimEnd().replace(/\r?\n/g, newline) + newline;
    const markdown =
      doc.markdown.slice(0, flow.contentStart) + body + doc.markdown.slice(flow.contentEnd);
    const parsed =
      doc.source === 'linked' ? parseLinkedDocument(markdown, doc) : parseDocument(markdown, doc);
    if (parsed.markdown.replace(/\r\n/g, '\n') !== markdown.replace(/\r\n/g, '\n'))
      throw new Error(
        '문서 식별자 구조가 변경되었습니다. 문서 편집에서 원본을 먼저 확인해 주세요.',
      );
    const saved = { ...parsed, markdown, revision: revisionOf(markdown) };
    this.checkSize(saved);
    commitFile(
      this.root,
      {
        path: saved.relativePath,
        before: doc.markdown,
        after: markdown,
        record: this.record(saved),
      },
      (op) => this.persistOperation(op),
    );
    return this.workspace();
  }
  resolveDocumentLink(documentId: string, linkId: string, revision: string) {
    const workspace = this.workspace();
    if (workspace.documents.find((doc) => doc.id === documentId)?.revision !== revision)
      throw new Error('문서가 변경되었습니다. 링크를 새로고침해 주세요.');
    const link = workspace.documentLinks.find(
      (link) => link.documentId === documentId && link.id === linkId,
    );
    if (!link) throw new Error('원문 링크를 찾을 수 없습니다.');
    return link;
  }
  saveSnapshot(snapshot: ContextSnapshot) {
    this.put('context', snapshot);
  }
  close() {
    this.db.close();
  }
}
