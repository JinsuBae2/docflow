import type { MapPosition, MapView, ProjectMap } from './project-map';
import type { UserFlow } from './user-flow';
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
  origin?: 'manual' | 'ai' | 'markdown';
  linkId?: Id;
}
export interface DocumentLink {
  id: Id;
  documentId: Id;
  revision: Revision;
  href: string;
  label: string;
  line: number;
  column: number;
  status: 'resolved' | 'unregistered' | 'missing' | 'missing-anchor' | 'external' | 'blocked';
  targetId?: Id;
  targetDocumentId?: Id;
  targetSectionId?: Id;
  targetPath?: string;
  reason?: string;
}
export interface DocumentAnchor {
  id: Id;
  documentId: Id;
  slug: string;
  line: number;
  sectionId: Id;
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
  kind: 'create' | 'update' | 'diagram' | 'decision' | 'relation' | 'flow';
  title: string;
  documentType: DocumentType;
  targetId: Id | null;
  baseRevision: Revision | null;
  replacement: string;
  sourceIds: Id[];
  reason: string;
  dependencyIds: Id[];
  scopedSourceId?: Id | null;
  relation?: RelationDraft;
  flow?: UserFlow;
}
export interface Proposal extends ProposalDraft {
  baseFlow?: UserFlow | null;
  sourceRanges?: Array<{ id: Id; documentId: Id; start: number; end: number }>;
  id: Id;
  requestId: Id;
  snapshotId: Id;
  status: ProposalStatus;
  createdAt: string;
  rejectionReason?: string;
  replacesId?: Id;
  resultDocumentId?: Id;
  resultFlowId?: Id;
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
  sectionId?: Id;
  complete?: boolean;
  range?: { start: number; end: number };
}
export interface ContextSelection {
  mode: 'full' | 'excerpts';
  limit: number;
  usedCharacters: number;
  estimatedInputTokens: number;
  omitted: Array<{
    documentId: Id;
    sectionId?: Id;
    title: string;
    reason: 'excluded' | 'budget' | 'partial' | 'unrelated' | 'empty';
  }>;
  omittedDecisions: number;
  omittedHistory: number;
}
export interface ContextSnapshot {
  requiresEvidence?: boolean;
  selection?: ContextSelection;
  flowEstimate?: { inputTokens: number };
  flowContext?: { flowId: string; projectId: string; baseFlow: UserFlow | null };
  budget?: AnalysisBudget;
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
  userFlows?: UserFlow[];
  userFlowIssues?: string[];
  mapView?: MapView;
  root: string;
  project: Project;
  documents: Document[];
  relations: Relation[];
  decisions: Decision[];
  proposals: Proposal[];
  messages: Message[];
  staleDiagramIds: Id[];
  documentIssues: string[];
  documentLinks: DocumentLink[];
  documentAnchors: DocumentAnchor[];
  flows: ProjectFlow[];
  flowIssues: string[];
  drafts?: EditorDraft[];
  session?: ProjectSession;
  feedbacks?: RejectionFeedback[];
}
export interface ProjectFlow {
  id: Id;
  documentId: Id;
  documentTitle: string;
  title: string;
  sectionId: Id;
  sectionTitle: string;
  path: string;
  line: number;
  referenceLine?: number;
  sourceKind: 'markdown' | 'definition';
  sourceRevision: Revision;
  language: string;
  kind: 'flowchart' | 'sequence' | 'state' | 'er' | 'unsupported';
  code: string;
  editable: boolean;
  editReason?: string;
  safetyError?: string;
  contentStart?: number;
  contentEnd?: number;
}
export interface ContextInput {
  mode?: 'documents' | 'idea';
  reviewedContextId?: Id;
  flowId?: string | null;
  instruction: string;
  selectedIds: Id[];
  excludedIds: Id[];
  maxCharacters?: number;
}
export interface AnalysisBudget {
  contextTokens: number;
  outputTokens: number;
  reserveTokens: number;
  inputTokens: number;
}
export interface AnalysisInput extends ContextInput {
  contextTokens?: number;
  outputTokens?: number;
}
export interface AnalysisSummary {
  warnings?: string[];
  evidence?: Array<{
    sourceId: Id;
    documentId: Id;
    sectionId?: Id;
    title: string;
    revision: Revision;
    start?: number;
    end?: number;
    phase: 'documents' | 'links';
  }>;
  id: Id;
  instruction: string;
  provider: AiProviderId;
  model: string;
  status: 'ready' | 'running' | 'paused' | 'completed' | 'error';
  budget: AnalysisBudget;
  total: number;
  completed: number;
  cached: number;
  documentIds: Id[];
  excludedIds: Id[];
  error?: string;
}
export interface RequestEvent {
  requestId: Id;
  event: AiEvent | { type: 'context'; context: ContextSnapshot };
}
export interface WorkspaceApi {
  saveUserFlow(
    flow: UserFlow,
    expectedRevision: string | null,
    projectRoot: string,
  ): Promise<UserFlow>;
  importUserFlow(sourceId: string, sourceRevision: string, projectRoot: string): Promise<UserFlow>;
  projectMap(): Promise<ProjectMap>;
  saveMapLayout(projectId: string, positions: MapPosition[]): Promise<ProjectMap>;
  saveMapView(
    projectId: string,
    view: Pick<MapView, 'collapsedDocumentIds' | 'legendCollapsed'>,
  ): Promise<ProjectMap>;
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
  resolveDocumentLink(
    documentId: Id,
    linkId: Id,
    revision: Revision,
    root: string,
  ): Promise<DocumentLink>;
  previewLinkedDocument(
    documentId: Id,
    linkId: Id,
    revision: Revision,
    root: string,
  ): Promise<DocumentRegistrationPreview>;
  openExternalDocumentLink(
    documentId: Id,
    linkId: Id,
    revision: Revision,
    root: string,
  ): Promise<void>;
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
  saveFlow(id: Id, sourceRevision: Revision, code: string, root: string): Promise<Workspace>;
  exportDocuments(): Promise<boolean>;
  saveProject(name: string, goal: string, constraints: string): Promise<Workspace>;
  connectDocuments(fromId: Id, toId: Id, type: string): Promise<Workspace>;
  removeRelation(id: Id): Promise<Workspace>;
  updateRelation(id: Id, type: string): Promise<Workspace>;
  previewContext(input: ContextInput, replacesId?: Id): Promise<ContextSnapshot>;
  prepareAnalysis(input: AnalysisInput): Promise<AnalysisSummary>;
  listAnalyses(): Promise<AnalysisSummary[]>;
  startAnalysis(id: Id): Promise<Id>;
  startRequest(input: ContextInput, replacesId?: Id): Promise<Id>;
  cancelRequest(): Promise<void>;
  acceptProposal(id: Id, laidFlow?: UserFlow, projectRoot?: string): Promise<Workspace>;
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
