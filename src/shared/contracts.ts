export type Id = string;
export type Revision = string;
export interface ProjectEntry { id: Id; name: string; root: string; lastOpenedAt: string; error?: string }
export interface EditorDraft { documentId: Id; markdown: string; baseRevision: Revision }
export interface ProjectSession { selectedId: Id; view: 'document' | 'graph' | 'diagram'; prompt: string; collapsed: boolean }
export interface AiModel { model: string; displayName: string; isDefault: boolean }
export type AiProviderId = 'codex' | 'claude';
export interface Preferences { provider: AiProviderId; model: string; models: Record<AiProviderId, string>; onboardingDone: boolean }
export type PreferencesPatch = Partial<Pick<Preferences, 'provider' | 'model' | 'onboardingDone'>>;
export interface ImportInput { name: string; text: string }
export interface ImportFilePreview { name: string; title: string; characters: number; headings: number; diagrams: number; excerpt: string }
export interface ImportPreview { id: string; files: ImportFilePreview[] }
export type DocumentType = 'overview' | 'prd' | 'feature' | 'flow' | 'design' | 'note';
export interface Section { id: Id; documentId: Id; parentId: Id | null; title: string; level: number; order: number; content: string; line: number }
export interface Document { id: Id; type: DocumentType; title: string; relativePath: string; revision: Revision; markdown: string; sections: Section[]; needsReconnect: boolean }
export interface Project { id: Id; name: string; goal: string; constraints: string }
export interface Relation { id: Id; fromId: Id; toId: Id; type: string; confirmed: boolean }
export interface Decision { id: Id; text: string; sourceIds: Id[]; status: 'accepted' }
export type ProposalStatus = 'pending' | 'accepted' | 'rejected' | 'superseded' | 'stale';
export interface ProposalDraft { kind: 'create' | 'update' | 'diagram' | 'decision'; title: string; documentType: DocumentType; targetId: Id | null; baseRevision: Revision | null; replacement: string; sourceIds: Id[]; reason: string; dependencyIds: Id[] }
export interface Proposal extends ProposalDraft { id: Id; requestId: Id; snapshotId: Id; status: ProposalStatus; createdAt: string; rejectionReason?: string; replacesId?: Id; resultDocumentId?: Id }
export interface ContextSource { id: Id; documentId: Id; title: string; revision: Revision; content: string }
export interface ContextSnapshot { id: Id; requestId: Id; instruction: string; project: Omit<Project, 'id'>; sources: ContextSource[]; decisions: Decision[]; proposalHistory: Array<{ id: Id; title: string; status: ProposalStatus; reason: string; rejectionReason?: string }>; omittedIds: Id[]; revisionProposal?: Proposal }
export interface AiResponse { message: string; proposals: ProposalDraft[] }
export type AiEvent = { type: 'progress'; text: string } | { type: 'result'; response: AiResponse } | { type: 'cancelled' } | { type: 'error'; message: string };
export interface ProviderStatus { connected: boolean; label: string; detail: string }
export interface Message { id: Id; role: 'user' | 'assistant'; text: string; requestId: Id; createdAt: string }
export interface Workspace { root: string; project: Project; documents: Document[]; relations: Relation[]; decisions: Decision[]; proposals: Proposal[]; messages: Message[]; staleDiagramIds: Id[]; documentIssues: string[]; drafts?: EditorDraft[]; session?: ProjectSession }
export interface ContextInput { instruction: string; selectedIds: Id[]; excludedIds: Id[]; maxCharacters?: number }
export interface RequestEvent { requestId: Id; event: AiEvent }
export interface WorkspaceApi {
  listProjects(): Promise<ProjectEntry[]>;
  projectDocuments(id: Id): Promise<Array<Pick<Document, 'id' | 'title' | 'type'>>>;
  activateProject(id: Id): Promise<Workspace>;
  forgetProject(id: Id): Promise<Workspace | null>;
  saveSession(session: ProjectSession, projectRoot: string): Promise<void>;
  saveDraft(draft: EditorDraft, projectRoot: string): Promise<void>;
  discardDraft(documentId: Id, projectRoot: string): Promise<void>;
  openProject(): Promise<Workspace | null>;
  createProject(): Promise<Workspace | null>;
  openExample(): Promise<Workspace>;
  current(): Promise<Workspace | null>;
  previewImport(): Promise<ImportPreview | null>;
  previewDroppedDocuments(files: ImportInput[]): Promise<ImportPreview>;
  confirmImport(id: string): Promise<Workspace>;
  cancelImport(): Promise<void>;
  listModels(provider?: AiProviderId): Promise<AiModel[]>;
  preferences(): Promise<Preferences>;
  savePreferences(patch: PreferencesPatch): Promise<Preferences>;
  saveClaudeKey(key: string): Promise<void>;
  createDocument(title: string, type: DocumentType): Promise<Workspace>;
  saveDocument(id: Id, markdown: string, expectedRevision: Revision): Promise<Workspace>;
  exportDocuments(): Promise<boolean>;
  saveProject(name: string, goal: string, constraints: string): Promise<Workspace>;
  connectDocuments(fromId: Id, toId: Id, type: string): Promise<Workspace>;
  removeRelation(id: Id): Promise<Workspace>;
  previewContext(input: ContextInput): Promise<ContextSnapshot>;
  startRequest(input: ContextInput, replacesId?: Id): Promise<Id>;
  cancelRequest(): Promise<void>;
  acceptProposal(id: Id): Promise<Workspace>;
  rejectProposal(id: Id, reason?: string): Promise<Workspace>;
  providerStatus(provider?: AiProviderId): Promise<ProviderStatus>;
  onRequestEvent(listener: (event: RequestEvent) => void): () => void;
}
