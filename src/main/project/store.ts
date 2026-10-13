import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, realpathSync } from 'node:fs';
import { basename } from 'node:path';
import type { Document, DocumentType, Project, Workspace, Relation, Decision, Proposal, ContextSnapshot, Message, EditorDraft, ProjectSession } from '../../shared/contracts';
import { parseDocument, revisionOf } from './markdown';
import { ensureProjectDirectory, safePath, readDocumentFile } from './files';
import { commitFile, recoverPendingOperations, type RecoveryOperation } from './recovery';
type DocumentRecord = Omit<Document, 'markdown' | 'sections'> & { sections: Array<{ id: string }> };
export class ProjectStore {
  private db: DatabaseSync;
  private documentIssues: string[] = [];
  private constructor(readonly root: string) {
    ensureProjectDirectory(root, 'documents'); ensureProjectDirectory(root, '.workspace');
    this.db = new DatabaseSync(safePath(root, '.workspace/project.db'));
    this.db.exec('PRAGMA journal_mode=WAL; PRAGMA user_version=1; CREATE TABLE IF NOT EXISTS records (kind TEXT NOT NULL, id TEXT NOT NULL, value TEXT NOT NULL, PRIMARY KEY(kind,id));');
    if (!this.all<Project>('project').length) this.put('project', { id: randomUUID(), name: basename(root), goal: '', constraints: '' });
    recoverPendingOperations(root, op => this.persistOperation(op));
  }
  static async open(root: string) { mkdirSync(root, { recursive: true }); return new ProjectStore(realpathSync(root)); }
  all<T>(kind: string): T[] { return (this.db.prepare('SELECT value FROM records WHERE kind=? ORDER BY rowid').all(kind) as { value: string }[]).map(row => JSON.parse(row.value)); }
  get<T>(kind: string, id: string): T | undefined { const row = this.db.prepare('SELECT value FROM records WHERE kind=? AND id=?').get(kind, id) as { value: string } | undefined; return row ? JSON.parse(row.value) : undefined; }
  put<T extends { id: string }>(kind: string, record: T) { this.db.prepare('INSERT INTO records(kind,id,value) VALUES (?,?,?) ON CONFLICT(kind,id) DO UPDATE SET value=excluded.value').run(kind, record.id, JSON.stringify(record)); }
  remove(kind: string, id: string) { this.db.prepare('DELETE FROM records WHERE kind=? AND id=?').run(kind, id); }
  private record(doc: Document): DocumentRecord { const { markdown: _markdown, sections, ...rest } = doc; return { ...rest, sections: sections.map(s => ({ id: s.id })) }; }
  private checkSize(doc: Document) { if (Buffer.byteLength(doc.markdown, 'utf8') > 2_000_000) throw new Error('문서 식별자를 포함한 저장 크기는 2MB 이하여야 합니다.'); }
  private persistOperation(op: RecoveryOperation) {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      this.put('document', op.record as DocumentRecord);
      if (op.proposalId) { const proposal = this.get<Proposal>('proposal', op.proposalId); if (proposal) this.put('proposal', { ...proposal, status: 'accepted', resultDocumentId: (op.record as DocumentRecord).id }); }
      this.db.exec('COMMIT');
    } catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
  listDocuments(): Document[] {
    this.documentIssues = [];
    return this.all<DocumentRecord>('document').flatMap(record => {
      try {
      const raw = readDocumentFile(this.root, record.relativePath);
      const parsed = parseDocument(raw, record as Document);
      return [{ ...parsed, type: record.type, relativePath: record.relativePath, markdown: raw, revision: revisionOf(raw), needsReconnect: parsed.needsReconnect }];
      } catch {
        this.documentIssues.push(`${record.title}: 파일을 읽을 수 없습니다. 삭제·이동·권한을 확인해 주세요. 메타데이터는 보존됩니다.`);
        return [];
      }
    });
  }
  document(id: string): Document { const doc = this.listDocuments().find(d => d.id === id); if (!doc) throw new Error('문서를 찾을 수 없습니다.'); return doc; }
  async createDocument(title: string, type: DocumentType, content = `# ${title}\n\n`): Promise<Document> {
    let doc = parseDocument(content);
    const existing = this.all<DocumentRecord>('document'); const sectionIds = new Set([...existing.flatMap(d => d.sections.map(s => s.id)), ...this.listDocuments().flatMap(d => d.sections.map(s => s.id))]);
    if (existing.some(d => d.id === doc.id) || doc.sections.some(s => sectionIds.has(s.id))) doc = parseDocument(content, undefined, true);
    doc.type = type; doc.relativePath = `documents/${doc.id}.md`;
    this.checkSize(doc);
    if (existsSync(safePath(this.root, doc.relativePath))) throw new Error('문서 경로가 이미 존재합니다.');
    commitFile(this.root, { path: doc.relativePath, before: null, after: doc.markdown, record: this.record(doc) }, op => this.persistOperation(op));
    return doc;
  }
  async saveDocument(id: string, markdown: string, expectedRevision: string, proposalId?: string, failAt?: 'prepared' | 'replaced') {
    const previous = this.document(id);
    if (previous.revision !== expectedRevision) throw new Error('문서가 외부에서 변경되었습니다. 최신 내용을 다시 확인해 주세요.');
    const doc = parseDocument(markdown, previous);
    this.checkSize(doc);
    commitFile(this.root, { path: doc.relativePath, before: previous.markdown, after: doc.markdown, record: this.record(doc), proposalId }, op => this.persistOperation(op), failAt);
    return doc;
  }
  async createFromProposal(proposal: Proposal): Promise<Document> {
    const doc = parseDocument(proposal.replacement, undefined, true); doc.type = proposal.documentType;
    this.checkSize(doc);
    if (this.get('document', doc.id)) throw new Error('새 문서 ID가 기존 문서와 겹칩니다. 다시 생성해 주세요.');
    doc.relativePath = `documents/${doc.id}.md`;
    commitFile(this.root, { path: doc.relativePath, before: null, after: doc.markdown, record: this.record(doc), proposalId: proposal.id }, op => this.persistOperation(op));
    return doc;
  }
  async importFile(relativePath: string) { return this.createDocument(basename(relativePath, '.md'), 'note', readDocumentFile(this.root, relativePath)); }
  addRelation(fromId: string, toId: string, type: string): Relation {
    const docs = this.listDocuments(); const allowed = new Set(docs.flatMap(d => [d.id, ...d.sections.map(s => s.id)]));
    if (fromId === toId || !allowed.has(fromId) || !allowed.has(toId)) throw new Error('연결할 두 문서를 확인해 주세요.');
    const existing = this.all<Relation>('relation').find(r => r.fromId === fromId && r.toId === toId && r.type === type);
    if (existing) return existing;
    const relation = { id: randomUUID(), fromId, toId, type, confirmed: true }; this.put('relation', relation); return relation;
  }
  updateProject(name: string, goal: string, constraints: string) { const project = this.all<Project>('project')[0]; this.put('project', { ...project, name, goal, constraints }); }
  saveDraft(draft: EditorDraft) { this.document(draft.documentId); this.put('draft', { ...draft, id: draft.documentId }); }
  discardDraft(documentId: string) { this.remove('draft', documentId); }
  saveSession(session: ProjectSession) { this.put('session', { ...session, id: 'current' }); }
  addDecision(text: string, sourceIds: string[], proposalId?: string): Decision {
    const decision = { id: proposalId || randomUUID(), text, sourceIds, status: 'accepted' as const };
    this.db.exec('BEGIN IMMEDIATE');
    try { this.put('decision', decision); if (proposalId) { const p = this.get<Proposal>('proposal', proposalId); if (p) this.put('proposal', { ...p, status: 'accepted' }); } this.db.exec('COMMIT'); }
    catch (error) { this.db.exec('ROLLBACK'); throw error; }
    return decision;
  }
  workspace(): Workspace {
    const documents = this.listDocuments(); const proposals = this.all<Proposal>('proposal');
    const staleDiagramIds = proposals.filter(p => p.kind === 'diagram' && p.status === 'accepted' && p.resultDocumentId).filter(p => {
      const context = this.get<ContextSnapshot>('context', p.snapshotId);
      return context?.sources.some(s => p.sourceIds.includes(s.id) && documents.find(d => d.id === s.documentId)?.revision !== s.revision);
    }).map(p => p.resultDocumentId!);
    return { root: this.root, project: this.all<Project>('project')[0], documents, relations: this.all<Relation>('relation'), decisions: this.all<Decision>('decision'), proposals, messages: this.all<Message>('message'), staleDiagramIds, documentIssues: this.documentIssues, drafts: this.all<EditorDraft & { id: string }>('draft').map(({ id: _id, ...draft }) => draft), session: this.get<ProjectSession>('session', 'current') };
  }
  saveSnapshot(snapshot: ContextSnapshot) { this.put('context', snapshot); }
  close() { this.db.close(); }
}
