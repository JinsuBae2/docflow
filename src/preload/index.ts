import { contextBridge, ipcRenderer } from 'electron';
import type { WorkspaceApi, RequestEvent } from '../shared/contracts';
const call = (method: string, ...args: unknown[]) => ipcRenderer.invoke('workspace:call', method, args);
const api: WorkspaceApi = {
  listProjects: () => call('listProjects'), projectDocuments: id => call('projectDocuments', id), activateProject: id => call('activateProject', id), forgetProject: id => call('forgetProject', id),
  setProjectCollapsed: (id, collapsed) => call('setProjectCollapsed', id, collapsed),
  saveSession: (session, root) => call('saveSession', session, root), saveDraft: (draft, root) => call('saveDraft', draft, root), discardDraft: (id, root) => call('discardDraft', id, root),
  openProject: () => call('openProject'), createProject: () => call('createProject'), openExample: () => call('openExample'), current: () => call('current'),
  createDocument: (title, type) => call('createDocument', title, type), saveDocument: (id, markdown, revision) => call('saveDocument', id, markdown, revision),
  previewImport: () => call('previewImport'), previewDroppedDocuments: files => call('previewDroppedDocuments', files), confirmImport: id => call('confirmImport', id), cancelImport: () => call('cancelImport'),
  listModels: provider => call('listModels', provider), preferences: () => call('preferences'), savePreferences: patch => call('savePreferences', patch), saveClaudeKey: key => call('saveClaudeKey', key),
  exportDocuments: () => call('exportDocuments'), saveProject: (name, goal, constraints) => call('saveProject', name, goal, constraints),
  connectDocuments: (from, to, type) => call('connectDocuments', from, to, type), removeRelation: id => call('removeRelation', id),
  previewContext: input => call('previewContext', input), startRequest: (input, replacesId) => call('startRequest', input, replacesId), cancelRequest: () => call('cancelRequest'),
  acceptProposal: id => call('acceptProposal', id), rejectProposal: (id, reason) => call('rejectProposal', id, reason), providerStatus: provider => call('providerStatus', provider),
  onRequestEvent: listener => { const handler = (_event: Electron.IpcRendererEvent, value: RequestEvent) => listener(value); ipcRenderer.on('workspace:event', handler); return () => ipcRenderer.removeListener('workspace:event', handler); }
};
contextBridge.exposeInMainWorld('workspace', api);
