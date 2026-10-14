import { contextBridge, ipcRenderer, webUtils } from 'electron';
import type { WorkspaceApi, RequestEvent } from '../shared/contracts';
const call = (method: string, ...args: unknown[]) =>
  ipcRenderer.invoke('workspace:call', method, args);
const api: WorkspaceApi = {
  saveUserFlow: (...args) => call('saveUserFlow', ...args),
  importUserFlow: (...args) => call('importUserFlow', ...args),
  projectMap: () => call('projectMap'),
  saveMapLayout: (id, positions) => call('saveMapLayout', id, positions),
  saveMapView: (id, view) => call('saveMapView', id, view),
  listProjects: () => call('listProjects'),
  projectDocuments: (id) => call('projectDocuments', id),
  activateProject: (id) => call('activateProject', id),
  forgetProject: (id) => call('forgetProject', id),
  setProjectCollapsed: (id, collapsed) => call('setProjectCollapsed', id, collapsed),
  usageSummary: () => call('usageSummary'),
  usageLimits: (provider) => call('usageLimits', provider),
  saveSession: (session, root) => call('saveSession', session, root),
  saveDraft: (draft, root) => call('saveDraft', draft, root),
  discardDraft: (id, root) => call('discardDraft', id, root),
  openProject: () => call('openProject'),
  openDroppedProject: (files) =>
    call('openDroppedProject', files.map((file) => webUtils.getPathForFile(file)).filter(Boolean)),
  previewProjectDocuments: () => call('previewProjectDocuments'),
  previewDocumentPaths: (kind) => call('previewDocumentPaths', kind),
  confirmDocumentRegistration: (id, paths) => call('confirmDocumentRegistration', id, paths),
  cancelDocumentRegistration: (id) => call('cancelDocumentRegistration', id),
  resolveDocumentLink: (...args) => call('resolveDocumentLink', ...args),
  previewLinkedDocument: (...args) => call('previewLinkedDocument', ...args),
  openExternalDocumentLink: (...args) => call('openExternalDocumentLink', ...args),
  createProject: () => call('createProject'),
  openExample: () => call('openExample'),
  current: () => call('current'),
  createDocument: (title, type) => call('createDocument', title, type),
  saveDocument: (id, markdown, revision) => call('saveDocument', id, markdown, revision),
  saveFlow: (...args) => call('saveFlow', ...args),
  previewImport: () => call('previewImport'),
  previewDroppedDocuments: (files) => call('previewDroppedDocuments', files),
  confirmImport: (id) => call('confirmImport', id),
  cancelImport: () => call('cancelImport'),
  listModels: (provider) => call('listModels', provider),
  preferences: () => call('preferences'),
  savePreferences: (patch) => call('savePreferences', patch),
  saveClaudeKey: (key) => call('saveClaudeKey', key),
  exportDocuments: () => call('exportDocuments'),
  saveProject: (name, goal, constraints) => call('saveProject', name, goal, constraints),
  connectDocuments: (from, to, type) => call('connectDocuments', from, to, type),
  removeRelation: (id) => call('removeRelation', id),
  updateRelation: (id, type) => call('updateRelation', id, type),
  previewContext: (input) => call('previewContext', input),
  prepareAnalysis: (input) => call('prepareAnalysis', input),
  listAnalyses: () => call('listAnalyses'),
  startAnalysis: (id) => call('startAnalysis', id),
  startRequest: (input, replacesId) => call('startRequest', input, replacesId),
  cancelRequest: () => call('cancelRequest'),
  acceptProposal: (id) => call('acceptProposal', id),
  rejectProposal: (id, reason) => call('rejectProposal', id, reason),
  providerStatus: (provider) => call('providerStatus', provider),
  sendRejection: (id, reason, feedbackId, input, root) =>
    call('sendRejection', id, reason, feedbackId, input, root),
  retryRejection: (id, input, root) => call('retryRejection', id, input, root),
  onRequestEvent: (listener) => {
    const handler = (_event: Electron.IpcRendererEvent, value: RequestEvent) => listener(value);
    ipcRenderer.on('workspace:event', handler);
    return () => ipcRenderer.removeListener('workspace:event', handler);
  },
};
contextBridge.exposeInMainWorld('workspace', api);
