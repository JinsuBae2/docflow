export type Id = string;
export type Revision = string;
export interface ProjectEntry {
  id: Id;
  name: string;
  root: string;
  lastOpenedAt: string;
  error?: string;
  collapsed?: boolean;
}
export interface EditorDraft {
  documentId: Id;
  markdown: string;
  baseRevision: Revision;
}
export interface ProjectSession {
  selectedId: Id;
  view: 'document' | 'graph' | 'diagram';
  prompt: string;
  collapsed: boolean;
}
export interface AiModel {
  model: string;
  displayName: string;
  isDefault: boolean;
}
export type AiProviderId = 'codex' | 'claude';
export type UsageReason =
  | 'no_history'
  | 'unsupported'
  | 'auth_mode'
  | 'auth_required'
  | 'network'
  | 'missing_response'
  | 'invalid_response';
export interface UsageReport {
  inputTokens: number | null;
  outputTokens: number | null;
  cachedInputTokens: number | null;
  cacheWriteInputTokens: number | null;
  totalTokens: number | null;
  reason?: UsageReason;
}
export interface UsageWindow {
  id: string;
  label: string;
  unit: 'percent' | 'tokens' | 'requests';
  windowMinutes: number | null;
  limit: number | null;
  remaining: number | null;
  remainingPercent: number | null;
  resetsAt: string | null;
  reason?: UsageReason;
}
export interface UsageLimits {
  provider: AiProviderId;
  checkedAt: string | null;
  source: 'account' | 'response';
  windows: UsageWindow[];
  reason?: UsageReason;
}
export interface RequestUsage {
  id: Id;
  provider: AiProviderId | null;
  model: string | null;
  createdAt: string;
  status: 'running' | 'completed' | 'error' | 'cancelled' | 'unknown';
  usage: UsageReport;
}
export interface UsageSummary {
  requests: RequestUsage[];
  totals: Array<{
    provider: AiProviderId;
    totalTokens: number;
    knownRequests: number;
    unknownRequests: number;
  }>;
}
export interface Preferences {
  provider: AiProviderId;
  model: string;
  models: Record<AiProviderId, string>;
  onboardingDone: boolean;
}
export type PreferencesPatch = Partial<Pick<Preferences, 'provider' | 'model' | 'onboardingDone'>>;
export interface ImportInput {
  name: string;
  text: string;
}
export interface ImportFilePreview {
  name: string;
  title: string;
  characters: number;
  headings: number;
  diagrams: number;
  excerpt: string;
}
export interface ImportPreview {
  id: string;
  files: ImportFilePreview[];
}
export interface DocumentCandidate {
  path: string;
  bytes: number;
  revision?: Revision;
  reason?: string;
}
export interface DocumentDiscovery {
  files: DocumentCandidate[];
  warnings: string[];
}
export interface DocumentRegistrationPreview extends DocumentDiscovery {
  id: Id;
  root: string;
}
export type DocumentType = 'overview' | 'prd' | 'feature' | 'flow' | 'design' | 'note';
export interface Section {
  id: Id;
  documentId: Id;
  parentId: Id | null;
  title: string;
  level: number;
  order: number;
  content: string;
  line: number;
}
export interface Document {
  id: Id;
  type: DocumentType;
  title: string;
  relativePath: string;
  revision: Revision;
  markdown: string;
  sections: Section[];
  needsReconnect: boolean;
  source?: 'linked';
}
export interface Project {
  id: Id;
  name: string;
  goal: string;
  constraints: string;
}
export interface Relation {
  id: Id;
  fromId: Id;
  toId: Id;
  type: string;
  confirmed: boolean;
}
export interface Decision {
  id: Id;
  text: string;
  sourceIds: Id[];
  status: 'accepted';
}
export type ProposalStatus = 'pending' | 'accepted' | 'rejected' | 'superseded' | 'stale';
export interface RelationDraft {
  fromId: Id;
  toId: Id;
  relationType: string;
  fromRevision: Revision;
  toRevision: Revision;
}
export interface ProposalDraft {
  kind: 'create' | 'update' | 'diagram' | 'decision' | 'relation';
  title: string;
  documentType: DocumentType;
  targetId: Id | null;
  baseRevision: Revision | null;
  replacement: string;
  sourceIds: Id[];
  reason: string;
  dependencyIds: Id[];
  relation?: RelationDraft;
}
export interface Proposal extends ProposalDraft {
  id: Id;
  requestId: Id;
  snapshotId: Id;
  status: ProposalStatus;
  createdAt: string;
  rejectionReason?: string;
  replacesId?: Id;
  resultDocumentId?: Id;
}
export interface RejectionFeedback {
  id: Id;
  proposalId: Id;
  reason: string;
  messageId?: Id;
  status: 'ready' | 'running' | 'failed' | 'completed';
  requestId?: Id;
}
export interface ContextSource {
  id: Id;
  documentId: Id;
  title: string;
  revision: Revision;
  content: string;
}
export interface ContextSnapshot {
  id: Id;
  requestId: Id;
  instruction: string;
  project: Omit<Project, 'id'>;
  sources: ContextSource[];
  decisions: Decision[];
  proposalHistory: Array<{
    id: Id;
    title: string;
    status: ProposalStatus;
    reason: string;
    rejectionReason?: string;
  }>;
  omittedIds: Id[];
  revisionProposal?: Proposal;
  rejectedProposal?: Pick<Proposal, 'id' | 'title' | 'kind' | 'rejectionReason'>;
  relations?: Array<Pick<Relation, 'fromId' | 'toId' | 'type'>>;
  omittedRelationCount?: number;
}
export interface AiResponse {
  message: string;
  proposals: ProposalDraft[];
}
export type AiEvent =
  | { type: 'progress'; text: string }
  | { type: 'usage'; usage: UsageReport; model?: string; limits?: UsageLimits }
  | { type: 'result'; response: AiResponse }
  | { type: 'cancelled' }
  | { type: 'error'; message: string };
export interface ProviderStatus {
  connected: boolean;
  label: string;
  detail: string;
}
export interface Message {
  id: Id;
  role: 'user' | 'assistant';
  text: string;
  requestId: Id;
  createdAt: string;
}
export interface Workspace {
  root: string;
  project: Project;
  documents: Document[];
  relations: Relation[];
  decisions: Decision[];
  proposals: Proposal[];
  messages: Message[];
  staleDiagramIds: Id[];
  documentIssues: string[];
  drafts?: EditorDraft[];
  session?: ProjectSession;
  feedbacks?: RejectionFeedback[];
}
export interface ContextInput {
  instruction: string;
  selectedIds: Id[];
  excludedIds: Id[];
  maxCharacters?: number;
}
export interface RequestEvent {
  requestId: Id;
  event: AiEvent;
}
export interface WorkspaceApi {
  listProjects(): Promise<ProjectEntry[]>;
  projectDocuments(id: Id): Promise<Array<Pick<Document, 'id' | 'title' | 'type'>>>;
  activateProject(id: Id): Promise<Workspace>;
  forgetProject(id: Id): Promise<Workspace | null>;
  setProjectCollapsed(id: Id, collapsed: boolean): Promise<void>;
  saveSession(session: ProjectSession, projectRoot: string): Promise<void>;
  saveDraft(draft: EditorDraft, projectRoot: string): Promise<void>;
  discardDraft(documentId: Id, projectRoot: string): Promise<void>;
  usageSummary(): Promise<UsageSummary>;
  usageLimits(provider?: AiProviderId): Promise<UsageLimits>;
  openProject(): Promise<Workspace | null>;
  openDroppedProject(files: File[]): Promise<Workspace | null>;
  previewProjectDocuments(): Promise<DocumentRegistrationPreview>;
  previewDocumentPaths(kind: 'files' | 'folder'): Promise<DocumentRegistrationPreview | null>;
  confirmDocumentRegistration(id: Id, paths: string[]): Promise<Workspace>;
  cancelDocumentRegistration(id: Id): Promise<void>;
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
  updateRelation(id: Id, type: string): Promise<Workspace>;
  previewContext(input: ContextInput): Promise<ContextSnapshot>;
  startRequest(input: ContextInput, replacesId?: Id): Promise<Id>;
  cancelRequest(): Promise<void>;
  acceptProposal(id: Id): Promise<Workspace>;
  rejectProposal(id: Id, reason?: string): Promise<Workspace>;
  sendRejection(
    proposalId: Id,
    reason: string,
    feedbackId: Id,
    input: ContextInput,
    projectRoot: string,
  ): Promise<Id | null>;
  retryRejection(feedbackId: Id, input: ContextInput, projectRoot: string): Promise<Id | null>;
  providerStatus(provider?: AiProviderId): Promise<ProviderStatus>;
  onRequestEvent(listener: (event: RequestEvent) => void): () => void;
}
