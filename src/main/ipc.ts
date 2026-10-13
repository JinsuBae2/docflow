import { app, BrowserWindow, dialog, ipcMain, safeStorage } from 'electron';
import { readFileSync, writeFileSync, existsSync, mkdirSync, lstatSync } from 'node:fs';
import { join, basename } from 'node:path';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { ProjectStore } from './project/store';
import { ProjectRegistry } from './project/registry';
import { ProposalService } from './project/proposals';
import { buildContext } from './project/context';
import { exampleDocuments } from './project/examples';
import { prepareImports } from './project/imports';
import { CodexProvider } from './ai/codex-provider';
import { ClaudeProvider } from './ai/claude-provider';
import { CredentialStore } from './ai/credential-store';
import { normalizePreferences, updatePreferences } from './ai/settings';
import type { AiProvider } from './ai/provider';
import type { ContextInput, AiEvent, Message, Preferences, ImportInput, AiProviderId } from '../shared/contracts';
import { documentTypeSchema } from '../shared/proposal-schema';
const str = z.string().max(2_000_000).refine(text => Buffer.byteLength(text, 'utf8') <= 2_000_000, '2MB 이하의 Markdown만 저장할 수 있습니다.'); const id = z.string().min(1).max(250);
const contextSchema = z.object({ instruction: z.string().min(1).max(10000), selectedIds: z.array(id).max(300), excludedIds: z.array(id).max(300), maxCharacters: z.number().int().min(1000).max(60000).optional() }).strict();
const schemas: Record<string, z.ZodType> = {
  listProjects: z.tuple([]), projectDocuments: z.tuple([id]), activateProject: z.tuple([id]), forgetProject: z.tuple([id]),
  saveSession: z.tuple([z.object({ selectedId: z.string().max(250), view: z.enum(['document', 'graph', 'diagram']), prompt: z.string().max(10000), collapsed: z.boolean() }).strict(), z.string().max(4000)]),
  saveDraft: z.tuple([z.object({ documentId: id, markdown: str, baseRevision: id }).strict(), z.string().max(4000)]), discardDraft: z.tuple([id, z.string().max(4000)]),
  current: z.tuple([]), openProject: z.tuple([]), createProject: z.tuple([]), openExample: z.tuple([]), exportDocuments: z.tuple([]),
  previewImport: z.tuple([]), previewDroppedDocuments: z.tuple([z.array(z.object({ name: z.string().max(500), text: z.string().max(2_000_000) }).strict()).min(1).max(30)]), confirmImport: z.tuple([id]), cancelImport: z.tuple([]),
  listModels: z.tuple([z.enum(['codex', 'claude']).optional()]), saveClaudeKey: z.tuple([z.string().max(500).refine(key => !key || /^[!-~]+$/.test(key), 'API 키 형식을 확인해 주세요.')]), preferences: z.tuple([]), savePreferences: z.tuple([z.object({ provider: z.enum(['codex', 'claude']).optional(), model: z.string().max(150).optional(), onboardingDone: z.boolean().optional() }).strict()]),
  createDocument: z.tuple([z.string().trim().min(1).max(200), documentTypeSchema]), saveDocument: z.tuple([id, str, id]),
  saveProject: z.tuple([z.string().trim().min(1).max(200), z.string().max(10000), z.string().max(10000)]),
  connectDocuments: z.tuple([id, id, z.string().trim().min(1).max(100)]), removeRelation: z.tuple([id]),
  previewContext: z.tuple([contextSchema]), startRequest: z.tuple([contextSchema, id.optional()]), cancelRequest: z.tuple([]),
  acceptProposal: z.tuple([id]), rejectProposal: z.tuple([id, z.string().max(3000).optional()]), providerStatus: z.tuple([z.enum(['codex', 'claude']).optional()])
};
export function registerWorkspace(window: BrowserWindow) {
  const dataRoot = process.env.DOCFLOW_DATA_DIR || app.getPath('userData'); mkdirSync(dataRoot, { recursive: true });
  const settingsFile = join(dataRoot, 'settings.json');
  const registry = new ProjectRegistry(settingsFile);
  const readSettings = (): { root?: string } & Preferences => { const saved = registry.read(); return { root: saved.root, ...normalizePreferences(saved) }; };
  const credentials = new CredentialStore(join(dataRoot, 'claude-key.enc'), safeStorage);
  const saveSettings = (patch: object) => registry.patch(patch);
  let staged: { id: string; root: string; files: ReturnType<typeof prepareImports> } | undefined;
  const stage = (files: ImportInput[]) => { const s = requireStore(); staged = { id: randomUUID(), root: s.root, files: prepareImports(files) }; return { id: staged.id, files: staged.files.map(({ text: _text, ...preview }) => preview) }; };
  let store: ProjectStore | undefined; let controller: AbortController | undefined; let provider: AiProvider | undefined;
  const requireStore = () => { if (!store) throw new Error('프로젝트를 먼저 열어 주세요.'); return store; };
  const makeProvider = (selected: AiProviderId = readSettings().provider): AiProvider => selected === 'claude'
    ? new ClaudeProvider(() => credentials.get() || process.env.ANTHROPIC_API_KEY || '') : !app.isPackaged && process.env.NODE_ENV === 'test' && process.env.DOCFLOW_TEST_FIXTURE
    ? new CodexProvider(process.env.DOCFLOW_TEST_NODE, [process.env.DOCFLOW_TEST_FIXTURE]) : new CodexProvider();
  const switchProject = async (root: string) => {
    if (controller) throw new Error('AI 요청을 취소하거나 완료한 뒤 프로젝트를 바꿔 주세요.');
    const next = await ProjectStore.open(root); store?.close(); store = next;
    staged = undefined; const ws = store.workspace(); registry.register(ws.root, ws.project.name); return ws;
  };
  const ready = (async () => { try { if (existsSync(settingsFile)) { const { root } = JSON.parse(readFileSync(settingsFile, 'utf8')); if (typeof root === 'string' && existsSync(root)) await switchProject(root); } } catch { /* A missing last project must not prevent the app from opening. */ } })();
  const notify = (requestId: string, event: AiEvent) => { if (!window.isDestroyed()) window.webContents.send('workspace:event', { requestId, event }); };
  ipcMain.handle('workspace:call', async (event, method: string, rawArgs: unknown[]) => {
    if (event.sender.id !== window.webContents.id || !schemas[method]) throw new Error('허용되지 않은 앱 요청입니다.');
    const args = schemas[method].parse(rawArgs) as any[]; await ready;
    if (['saveSession', 'saveDraft', 'discardDraft'].includes(method) && args[1] !== requireStore().root) throw new Error('프로젝트가 바뀌어 저장 요청을 적용하지 않았습니다.');
    switch (method) {
      case 'listProjects': return registry.list();
      case 'activateProject': return switchProject(registry.resolve(args[0]));
      case 'projectDocuments': {
        const root = registry.resolve(args[0]); const temporary = root === store?.root ? store : await ProjectStore.open(root);
        try { return temporary!.workspace().documents.map(({ id, title, type }) => ({ id, title, type })); }
        finally { if (temporary !== store) temporary!.close(); }
      }
      case 'forgetProject': {
        if (controller) throw new Error('AI 요청이 끝난 뒤 프로젝트 목록을 변경해 주세요.');
        const entry = registry.list().find(entry => entry.id === args[0]); if (!entry) throw new Error('등록된 프로젝트를 찾을 수 없습니다.'); const root = entry.root; registry.forget(args[0]);
        if (root === store?.root) { store.close(); store = undefined; staged = undefined; const next = registry.list().find(entry => !entry.error); if (next) return switchProject(next.root); }
        return store?.workspace() || null;
      }
      case 'saveSession': requireStore().saveSession(args[0]); return;
      case 'saveDraft': requireStore().saveDraft(args[0]); return;
      case 'discardDraft': requireStore().discardDraft(args[0]); return;
      case 'current': return store?.workspace() || null;
      case 'preferences': return normalizePreferences(readSettings());
      case 'saveClaudeKey': {
        if (controller) throw new Error('AI 요청이 끝난 뒤 키를 변경해 주세요.');
        credentials.set(args[0]); return;
      }
      case 'savePreferences': {
        if (controller) throw new Error('AI 요청이 끝난 뒤 모델을 변경해 주세요.');
        const next = updatePreferences(readSettings(), args[0]);
        if (next.model && (args[0].model !== undefined || args[0].provider !== undefined)) { const client = makeProvider(next.provider); try { if (!(await client.listModels()).some(m => m.model === next.model)) throw new Error('사용할 수 없는 모델입니다.'); } finally { await client.close(); } }
        saveSettings(next); return next;
      }
      case 'listModels': { const client = makeProvider(args[0]); try { return await client.listModels(); } finally { await client.close(); } }
      case 'cancelImport': staged = undefined; return;
      case 'previewDroppedDocuments': return stage(args[0]);
      case 'previewImport': {
        requireStore(); const result = await dialog.showOpenDialog(window, { title: 'Markdown 문서 가져오기', properties: ['openFile', 'multiSelections'], filters: [{ name: 'Markdown', extensions: ['md', 'markdown'] }] });
        if (result.canceled) return null;
        if (result.filePaths.length > 30) throw new Error('한 번에 1~30개의 Markdown 파일을 선택해 주세요.');
        const stats = result.filePaths.map(path => lstatSync(path));
        if (stats.some(stat => !stat.isFile() || stat.size > 2_000_000)) throw new Error('2MB 이하의 일반 Markdown 파일을 선택해 주세요.');
        if (stats.reduce((total, stat) => total + stat.size, 0) > 10_000_000) throw new Error('전체 파일 크기는 10MB 이하여야 합니다.');
        return stage(result.filePaths.map(path => { const stat = lstatSync(path); if (!stat.isFile() || stat.size > 2_000_000) throw new Error('2MB 이하의 일반 Markdown 파일을 선택해 주세요.'); return { name: basename(path), text: readFileSync(path, 'utf8') }; }));
      }
      case 'confirmImport': {
        const s = requireStore(); if (!staged || staged.id !== args[0] || staged.root !== s.root) throw new Error('가져오기 목록이 만료되었습니다. 파일을 다시 선택해 주세요.');
        while (staged.files.length) { const file = staged.files[0]; await s.createDocument(file.title, 'note', file.text); staged.files.shift(); }
        staged = undefined; return s.workspace();
      }
      case 'openProject': case 'createProject': {
        const result = await dialog.showOpenDialog(window, { title: method === 'createProject' ? '프로젝트를 저장할 폴더' : '프로젝트 폴더 열기', properties: ['openDirectory', 'createDirectory'] });
        return result.canceled ? null : switchProject(result.filePaths[0]);
      }
      case 'openExample': {
        const ws = await switchProject(join(dataRoot, 'workspaces', 'example'));
        if (!ws.documents.length) {
          const s = requireStore(); s.updateProject('나의 문서 워크스페이스', '프로젝트 맥락을 유지하며 기획하고 개발하기', '로컬 저장 · 작성자 검토 후 반영 · 회원가입 없음');
          const docs = []; for (const item of exampleDocuments) docs.push(await s.createDocument(item.title, item.type, item.content));
          s.addRelation(docs[0].id, docs[1].id, '구체화'); s.addRelation(docs[1].id, docs[2].id, '사용자 흐름');
          s.addDecision('회원가입 없이 로컬에서 사용한다.', [docs[0].id]);
        }
        const current = requireStore().workspace(); registry.register(current.root, current.project.name); return current;
      }
      case 'createDocument': await requireStore().createDocument(args[0], args[1]); return requireStore().workspace();
      case 'saveDocument': await requireStore().saveDocument(args[0], args[1], args[2]); return requireStore().workspace();
      case 'saveProject': { const s = requireStore(); s.updateProject(args[0], args[1], args[2]); registry.register(s.root, args[0]); return s.workspace(); }
      case 'connectDocuments': requireStore().addRelation(args[0], args[1], args[2]); return requireStore().workspace();
      case 'removeRelation': requireStore().remove('relation', args[0]); return requireStore().workspace();
      case 'exportDocuments': {
        const docs = requireStore().workspace().documents; const result = await dialog.showOpenDialog(window, { title: '내보낼 폴더', properties: ['openDirectory', 'createDirectory'] });
        if (result.canceled) return false;
        const folder = join(result.filePaths[0], 'docflow-export-' + Date.now()); mkdirSync(folder);
        for (const doc of docs) { const name = doc.title.replace(/[<>:"/\\|?*\x00-\x1F]/g, '_').slice(0, 80); writeFileSync(join(folder, name + '-' + doc.id.slice(0, 8) + '.md'), doc.markdown, 'utf8'); }
        return true;
      }
      case 'previewContext': return buildContext(args[0], requireStore());
      case 'providerStatus': {
        const client = makeProvider(args[0]); try { const status = await client.getStatus(); if (status.label === 'Codex' && process.env.NODE_ENV === 'test' && process.env.DOCFLOW_TEST_FIXTURE) status.detail = '테스트 연결'; return status; } finally { await client.close(); }
      }
      case 'cancelRequest': controller?.abort(); return;
      case 'acceptProposal': return new ProposalService(requireStore()).accept(args[0]);
      case 'rejectProposal': return new ProposalService(requireStore()).reject(args[0], args[1]);
      case 'startRequest': {
        if (controller) throw new Error('이전 AI 요청이 진행 중입니다.');
        const s = requireStore(); const input = args[0] as ContextInput;
        const snapshot = await buildContext(input, s, args[1]); const requestId = snapshot.requestId;
        controller = new AbortController(); const currentController = controller; provider = makeProvider(); const client = provider;
        const userMessage: Message = { id: randomUUID(), role: 'user', text: input.instruction, requestId, createdAt: new Date().toISOString() }; s.put('message', userMessage);
        setTimeout(async () => {
          try {
            for await (const aiEvent of client.run(snapshot, currentController.signal, readSettings().model || undefined)) {
              if (aiEvent.type === 'result') {
                if (currentController.signal.aborted) { notify(requestId, { type: 'cancelled' }); break; }
                await new ProposalService(s).register(snapshot.id, aiEvent.response, args[1]);
                s.put('message', { id: randomUUID(), role: 'assistant', text: aiEvent.response.message, requestId, createdAt: new Date().toISOString() });
              }
              notify(requestId, aiEvent);
            }
          } catch (error) { notify(requestId, { type: 'error', message: (error as Error).message }); }
          finally { await client.close(); controller = undefined; provider = undefined; }
        }, 25);
        return requestId;
      }
    }
  });
  return async () => { ipcMain.removeHandler('workspace:call'); controller?.abort(); await provider?.close(); store?.close(); };
}
