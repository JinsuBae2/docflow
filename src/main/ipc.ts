import { assertDocumentEvidence } from '../shared/context-payload';
import { assertReviewedContext } from './project/context';
import { app, BrowserWindow, dialog, ipcMain, safeStorage, shell } from 'electron';
import { readFileSync, writeFileSync, existsSync, mkdirSync, lstatSync } from 'node:fs';
import { join, basename } from 'node:path';
import { projectRelativePath } from './project/files';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { ProjectStore } from './project/store';
import { ProjectMapStore } from './project/map-store';
import { UserFlowStore } from './project/user-flows';
import { userFlowSchema } from '../shared/user-flow';
import { ProjectRegistry } from './project/registry';
import { ProposalService } from './project/proposals';
import { FeedbackService } from './project/feedback';
import { buildContext } from './project/context';
import { AnalysisService } from './project/analysis';
import { exampleDocuments } from './project/examples';
import { prepareImports } from './project/imports';
import { CodexProvider } from './ai/codex-provider';
import { ClaudeProvider } from './ai/claude-provider';
import { CredentialStore } from './ai/credential-store';
import { normalizePreferences, updatePreferences } from './ai/settings';
import type { AiProvider } from './ai/provider';
import type {
  ContextInput,
  ContextSnapshot,
  AiEvent,
  Message,
  Preferences,
  ImportInput,
  AiProviderId,
  RequestUsage,
  RequestEvent,
  UsageLimits,
} from '../shared/contracts';
import { normalizeCodexUsage } from './ai/usage';
import { documentTypeSchema } from '../shared/proposal-schema';
import { planningModeSchema, planningPatchSchema } from '../shared/planning';
import { PlanningSessionStore } from './project/planning';
const str = z
  .string()
  .max(2_000_000)
  .refine(
    (text) => Buffer.byteLength(text, 'utf8') <= 2_000_000,
    '2MB 이하의 Markdown만 저장할 수 있습니다.',
  );
const id = z.string().min(1).max(250);
const contextSchema = z
  .object({
    flowId: id.nullable().optional(),
    planningSessionId: id.optional(),
    planningAction: z.enum(['discuss', 'draft']).optional(),
    mode: z.enum(['documents', 'idea']).optional(),
    reviewedContextId: id.optional(),
    instruction: z.string().min(1).max(10000),
    selectedIds: z.array(id).max(300),
    excludedIds: z.array(id).max(300),
    maxCharacters: z.number().int().min(1000).max(60000).optional(),
  })
  .strict();
const schemas: Record<string, z.ZodType> = {
  startPlanning: z.tuple([planningModeSchema, z.string().max(4000)]),
  savePlanning: z.tuple([id, id, planningPatchSchema, z.string().max(4000)]),
  saveUserFlow: z.tuple([userFlowSchema, id.nullable(), z.string().max(4000)]),
  importUserFlow: z.tuple([id, id, z.string().max(4000)]),
  projectMap: z.tuple([]),
  saveMapLayout: z.tuple([
    id,
    z
      .array(
        z
          .object({
            nodeId: id,
            x: z.number().min(-1000000).max(1000000),
            y: z.number().min(-1000000).max(1000000),
          })
          .strict(),
      )
      .max(20000),
  ]),
  saveMapView: z.tuple([
    id,
    z
      .object({ collapsedDocumentIds: z.array(id).max(20000), legendCollapsed: z.boolean() })
      .strict(),
  ]),
  prepareAnalysis: z.tuple([
    contextSchema.extend({
      contextTokens: z.number().int().min(20000).max(200000).optional(),
      outputTokens: z.number().int().min(1024).max(8192).optional(),
    }),
  ]),
  listAnalyses: z.tuple([]),
  startAnalysis: z.tuple([id]),
  usageSummary: z.tuple([]),
  usageLimits: z.tuple([z.enum(['codex', 'claude']).optional()]),
  updateRelation: z.tuple([id, z.string().trim().min(1).max(80)]),
  listProjects: z.tuple([]),
  projectDocuments: z.tuple([id]),
  activateProject: z.tuple([id]),
  forgetProject: z.tuple([id]),
  setProjectCollapsed: z.tuple([id, z.boolean()]),
  saveSession: z.tuple([
    z
      .object({
        selectedId: z.string().max(250),
        view: z.enum(['document', 'graph', 'diagram', 'planning']),
        planningSessionId: id.optional(),
        prompt: z.string().max(10000),
        collapsed: z.boolean(),
      })
      .strict(),
    z.string().max(4000),
  ]),
  saveDraft: z.tuple([
    z.object({ documentId: id, markdown: str, baseRevision: id }).strict(),
    z.string().max(4000),
  ]),
  discardDraft: z.tuple([id, z.string().max(4000)]),
  current: z.tuple([]),
  openProject: z.tuple([]),
  resolveDocumentLink: z.tuple([id, id, id, z.string().max(4000)]),
  previewLinkedDocument: z.tuple([id, id, id, z.string().max(4000)]),
  openExternalDocumentLink: z.tuple([id, id, id, z.string().max(4000)]),
  openDroppedProject: z.tuple([z.array(z.string().min(1).max(4000)).max(30)]),
  previewProjectDocuments: z.tuple([]),
  previewDocumentPaths: z.tuple([z.enum(['files', 'folder'])]),
  confirmDocumentRegistration: z.tuple([id, z.array(z.string().min(1).max(4000)).min(1).max(30)]),
  cancelDocumentRegistration: z.tuple([id]),
  createProject: z.tuple([]),
  openExample: z.tuple([]),
  exportDocuments: z.tuple([]),
  previewImport: z.tuple([]),
  previewDroppedDocuments: z.tuple([
    z
      .array(z.object({ name: z.string().max(500), text: z.string().max(2_000_000) }).strict())
      .min(1)
      .max(30),
  ]),
  confirmImport: z.tuple([id]),
  cancelImport: z.tuple([]),
  listModels: z.tuple([z.enum(['codex', 'claude']).optional()]),
  saveClaudeKey: z.tuple([
    z
      .string()
      .max(500)
      .refine((key) => !key || /^[!-~]+$/.test(key), 'API 키 형식을 확인해 주세요.'),
  ]),
  preferences: z.tuple([]),
  savePreferences: z.tuple([
    z
      .object({
        provider: z.enum(['codex', 'claude']).optional(),
        model: z.string().max(150).optional(),
        onboardingDone: z.boolean().optional(),
      })
      .strict(),
  ]),
  createDocument: z.tuple([z.string().trim().min(1).max(200), documentTypeSchema]),
  saveDocument: z.tuple([id, str, id]),
  saveFlow: z.tuple([id, id, z.string().min(1).max(50_000), z.string().max(4000)]),
  saveProject: z.tuple([
    z.string().trim().min(1).max(200),
    z.string().max(10000),
    z.string().max(10000),
  ]),
  connectDocuments: z.tuple([id, id, z.string().trim().min(1).max(100)]),
  removeRelation: z.tuple([id]),
  previewContext: z.tuple([contextSchema, id.optional()]),
  startRequest: z.tuple([contextSchema, id.optional()]),
  cancelRequest: z.tuple([]),
  acceptProposal: z.tuple([id, userFlowSchema.optional(), z.string().max(4000).optional()]),
  rejectProposal: z.tuple([id, z.string().max(3000).optional()]),
  providerStatus: z.tuple([z.enum(['codex', 'claude']).optional()]),
  sendRejection: z.tuple([id, z.string().max(3000), id, contextSchema, z.string().max(4000)]),
  retryRejection: z.tuple([id, contextSchema, z.string().max(4000)]),
};
export function registerWorkspace(window: BrowserWindow) {
  const dataRoot = process.env.DOCFLOW_DATA_DIR || app.getPath('userData');
  mkdirSync(dataRoot, { recursive: true });
  const settingsFile = join(dataRoot, 'settings.json');
  const registry = new ProjectRegistry(settingsFile);
  const readSettings = (): { root?: string } & Preferences => {
    const saved = registry.read();
    return { root: saved.root, ...normalizePreferences(saved) };
  };
  const credentials = new CredentialStore(join(dataRoot, 'claude-key.enc'), safeStorage);
  const lastLimits: Partial<Record<AiProviderId, UsageLimits>> = {};
  const saveSettings = (patch: object) => registry.patch(patch);
  let staged: { id: string; root: string; files: ReturnType<typeof prepareImports> } | undefined;
  let registration:
    (ReturnType<ProjectStore['discoverDocuments']> & { id: string; root: string }) | undefined;
  const stageRegistration = (paths?: string[]) => {
    const current = requireStore();
    registration = { ...current.discoverDocuments(paths), id: randomUUID(), root: current.root };
    return registration;
  };
  const stage = (files: ImportInput[]) => {
    const s = requireStore();
    staged = { id: randomUUID(), root: s.root, files: prepareImports(files) };
    return { id: staged.id, files: staged.files.map(({ text: _text, ...preview }) => preview) };
  };
  let store: ProjectStore | undefined;
  let controller: AbortController | undefined;
  let provider: AiProvider | undefined;
  const requireStore = () => {
    if (!store) throw new Error('프로젝트를 먼저 열어 주세요.');
    return store;
  };
  const makeProvider = (selected: AiProviderId = readSettings().provider): AiProvider =>
    selected === 'claude'
      ? new ClaudeProvider(() => credentials.get() || process.env.ANTHROPIC_API_KEY || '')
      : !app.isPackaged && process.env.NODE_ENV === 'test' && process.env.DOCFLOW_TEST_FIXTURE
        ? new CodexProvider(process.env.DOCFLOW_TEST_NODE, [process.env.DOCFLOW_TEST_FIXTURE])
        : new CodexProvider();
  const switchProject = async (root: string) => {
    if (controller) throw new Error('AI 요청을 취소하거나 완료한 뒤 프로젝트를 바꿔 주세요.');
    const next = await ProjectStore.open(root);
    store?.close();
    store = next;
    staged = undefined;
    registration = undefined;
    const ws = store.workspace();
    registry.register(ws.root, ws.project.name);
    return ws;
  };
  const ready = (async () => {
    try {
      if (existsSync(settingsFile)) {
        const { root } = JSON.parse(readFileSync(settingsFile, 'utf8'));
        if (typeof root === 'string' && existsSync(root)) await switchProject(root);
      }
    } catch {
      /* A missing last project must not prevent the app from opening. */
    }
  })();
  const notify = (requestId: string, event: RequestEvent['event']) => {
    if (!window.isDestroyed()) window.webContents.send('workspace:event', { requestId, event });
  };
  ipcMain.handle('workspace:call', async (event, method: string, rawArgs: unknown[]) => {
    if (event.sender.id !== window.webContents.id || !schemas[method])
      throw new Error('허용되지 않은 앱 요청입니다.');
    const args = schemas[method].parse(rawArgs) as any[];
    await ready;
    if (
      ['saveSession', 'saveDraft', 'discardDraft'].includes(method) &&
      args[1] !== requireStore().root
    )
      throw new Error('프로젝트가 바뀌어 저장 요청을 적용하지 않았습니다.');
    switch (method) {
      case 'listProjects':
        return registry.list();
      case 'setProjectCollapsed':
        registry.setCollapsed(args[0], args[1]);
        return;
      case 'activateProject':
        return switchProject(registry.resolve(args[0]));
      case 'projectDocuments': {
        const root = registry.resolve(args[0]);
        const temporary = root === store?.root ? store : await ProjectStore.open(root);
        try {
          return temporary!
            .workspace()
            .documents.map(({ id, title, type }) => ({ id, title, type }));
        } finally {
          if (temporary !== store) temporary!.close();
        }
      }
      case 'forgetProject': {
        if (controller) throw new Error('AI 요청이 끝난 뒤 프로젝트 목록을 변경해 주세요.');
        const entry = registry.list().find((entry) => entry.id === args[0]);
        if (!entry) throw new Error('등록된 프로젝트를 찾을 수 없습니다.');
        const root = entry.root;
        registry.forget(args[0]);
        if (root === store?.root) {
          store.close();
          store = undefined;
          staged = undefined;
          registration = undefined;
          const next = registry.list().find((entry) => !entry.error);
          if (next) return switchProject(next.root);
        }
        return store?.workspace() || null;
      }
      case 'saveSession':
        requireStore().saveSession(args[0]);
        return;
      case 'saveDraft':
        requireStore().saveDraft(args[0]);
        return;
      case 'discardDraft':
        requireStore().discardDraft(args[0]);
        return;
      case 'current':
        return store?.workspace() || null;
      case 'resolveDocumentLink':
      case 'previewLinkedDocument':
      case 'openExternalDocumentLink': {
        const current = requireStore();
        if (current.root !== args[3])
          throw new Error('프로젝트가 변경되어 링크 요청을 취소했습니다.');
        const link = current.resolveDocumentLink(args[0], args[1], args[2]);
        if (method === 'resolveDocumentLink') return link;
        if (method === 'previewLinkedDocument') {
          if (link.status !== 'unregistered' || !link.targetPath)
            throw new Error('등록 가능한 원문 링크가 아닙니다.');
          return stageRegistration([link.targetPath]);
        }
        if (link.status !== 'external') throw new Error('외부 HTTP(S) 원문 링크만 열 수 있습니다.');
        await shell.openExternal(new URL(link.href).href);
        return;
      }
      case 'previewProjectDocuments':
        return stageRegistration();
      case 'previewDocumentPaths': {
        const current = requireStore();
        const result = await dialog.showOpenDialog(window, {
          title: '프로젝트 내부 원본 문서 선택',
          defaultPath: current.root,
          properties: args[0] === 'folder' ? ['openDirectory'] : ['openFile', 'multiSelections'],
          ...(args[0] === 'files'
            ? { filters: [{ name: 'Markdown', extensions: ['md', 'markdown'] }] }
            : {}),
        });
        if (store !== current) throw new Error('프로젝트가 변경되었습니다. 다시 선택해 주세요.');
        return result.canceled
          ? null
          : stageRegistration(
              result.filePaths.map((path) => projectRelativePath(current.root, path)),
            );
      }
      case 'cancelDocumentRegistration':
        if (registration?.id === args[0]) registration = undefined;
        return;
      case 'confirmDocumentRegistration': {
        const current = requireStore();
        if (!registration || registration.id !== args[0] || registration.root !== current.root)
          throw new Error('문서 등록 목록이 만료되었습니다. 다시 탐색해 주세요.');
        const files = (args[1] as string[]).map((path) => {
          const file = registration!.files.find((file) => file.path === path && !file.reason);
          if (!file) throw new Error('미리보기에서 등록 가능한 문서를 선택해 주세요.');
          return file;
        });
        current.linkDocuments(files);
        registration = undefined;
        return current.workspace();
      }
      case 'openDroppedProject': {
        const paths = args[0] as string[];
        if (paths.length !== 1 || !lstatSync(paths[0]).isDirectory()) return null;
        if (lstatSync(paths[0]).isSymbolicLink())
          throw new Error('프로젝트 원본 폴더를 선택해 주세요.');
        return switchProject(paths[0]);
      }
      case 'usageSummary':
        return requireStore().usageSummary();
      case 'usageLimits': {
        const selected = args[0] || readSettings().provider;
        const client = makeProvider(selected);
        try {
          const result = await client.getUsageLimits();
          if (result.windows.length) {
            lastLimits[selected as AiProviderId] = result;
            return result;
          }
          if (result.reason === 'auth_required' || result.reason === 'auth_mode') {
            delete lastLimits[selected as AiProviderId];
            return result;
          }
          const previous = lastLimits[selected as AiProviderId];
          return previous ? { ...previous, reason: result.reason } : result;
        } finally {
          await client.close();
        }
      }
      case 'preferences':
        return normalizePreferences(readSettings());
      case 'saveClaudeKey': {
        if (controller) throw new Error('AI 요청이 끝난 뒤 키를 변경해 주세요.');
        credentials.set(args[0]);
        delete lastLimits.claude;
        return;
      }
      case 'savePreferences': {
        if (controller) throw new Error('AI 요청이 끝난 뒤 모델을 변경해 주세요.');
        const next = updatePreferences(readSettings(), args[0]);
        if (next.model && (args[0].model !== undefined || args[0].provider !== undefined)) {
          const client = makeProvider(next.provider);
          try {
            if (!(await client.listModels()).some((m) => m.model === next.model))
              throw new Error('사용할 수 없는 모델입니다.');
          } finally {
            await client.close();
          }
        }
        saveSettings(next);
        return next;
      }
      case 'listModels': {
        const client = makeProvider(args[0]);
        try {
          return await client.listModels();
        } finally {
          await client.close();
        }
      }
      case 'cancelImport':
        staged = undefined;
        return;
      case 'previewDroppedDocuments':
        return stage(args[0]);
      case 'previewImport': {
        requireStore();
        const result = await dialog.showOpenDialog(window, {
          title: 'Markdown 문서 가져오기',
          properties: ['openFile', 'multiSelections'],
          filters: [{ name: 'Markdown', extensions: ['md', 'markdown'] }],
        });
        if (result.canceled) return null;
        if (result.filePaths.length > 30)
          throw new Error('한 번에 1~30개의 Markdown 파일을 선택해 주세요.');
        const stats = result.filePaths.map((path) => lstatSync(path));
        if (stats.some((stat) => !stat.isFile() || stat.size > 2_000_000))
          throw new Error('2MB 이하의 일반 Markdown 파일을 선택해 주세요.');
        if (stats.reduce((total, stat) => total + stat.size, 0) > 10_000_000)
          throw new Error('전체 파일 크기는 10MB 이하여야 합니다.');
        return stage(
          result.filePaths.map((path) => {
            const stat = lstatSync(path);
            if (!stat.isFile() || stat.size > 2_000_000)
              throw new Error('2MB 이하의 일반 Markdown 파일을 선택해 주세요.');
            return { name: basename(path), text: readFileSync(path, 'utf8') };
          }),
        );
      }
      case 'confirmImport': {
        const s = requireStore();
        if (!staged || staged.id !== args[0] || staged.root !== s.root)
          throw new Error('가져오기 목록이 만료되었습니다. 파일을 다시 선택해 주세요.');
        while (staged.files.length) {
          const file = staged.files[0];
          await s.createDocument(file.title, 'note', file.text);
          staged.files.shift();
        }
        staged = undefined;
        return s.workspace();
      }
      case 'openProject':
      case 'createProject': {
        const result = await dialog.showOpenDialog(window, {
          title: method === 'createProject' ? '프로젝트를 저장할 폴더' : '프로젝트 폴더 열기',
          properties: ['openDirectory', 'createDirectory'],
        });
        return result.canceled ? null : switchProject(result.filePaths[0]);
      }
      case 'openExample': {
        const ws = await switchProject(join(dataRoot, 'workspaces', 'example'));
        if (!ws.documents.length) {
          const s = requireStore();
          s.updateProject(
            '나의 문서 워크스페이스',
            '프로젝트 맥락을 유지하며 기획하고 개발하기',
            '로컬 저장 · 작성자 검토 후 반영 · 회원가입 없음',
          );
          const docs = [];
          for (const item of exampleDocuments)
            docs.push(await s.createDocument(item.title, item.type, item.content));
          s.addRelation(docs[0].id, docs[1].id, '구체화');
          s.addRelation(docs[1].id, docs[2].id, '사용자 흐름');
          s.addDecision('회원가입 없이 로컬에서 사용한다.', [docs[0].id]);
        }
        const current = requireStore().workspace();
        registry.register(current.root, current.project.name);
        return current;
      }
      case 'createDocument':
        await requireStore().createDocument(args[0], args[1]);
        return requireStore().workspace();
      case 'saveDocument':
        await requireStore().saveDocument(args[0], args[1], args[2]);
        return requireStore().workspace();
      case 'saveFlow':
        if (requireStore().root !== args[3])
          throw new Error('프로젝트가 바뀌어 흐름 편집을 적용하지 않았습니다.');
        return requireStore().saveFlow(args[0], args[1], args[2]);
      case 'saveProject': {
        const s = requireStore();
        s.updateProject(args[0], args[1], args[2]);
        registry.register(s.root, args[0]);
        return s.workspace();
      }
      case 'connectDocuments':
        requireStore().addRelation(args[0], args[1], args[2]);
        return requireStore().workspace();
      case 'removeRelation':
        requireStore().removeRelation(args[0]);
        return requireStore().workspace();
      case 'updateRelation':
        requireStore().updateRelation(args[0], args[1]);
        return requireStore().workspace();
      case 'exportDocuments': {
        const docs = requireStore().workspace().documents;
        const result = await dialog.showOpenDialog(window, {
          title: '내보낼 폴더',
          properties: ['openDirectory', 'createDirectory'],
        });
        if (result.canceled) return false;
        const folder = join(result.filePaths[0], 'docflow-export-' + Date.now());
        mkdirSync(folder);
        for (const doc of docs) {
          // eslint-disable-next-line no-control-regex -- Export filenames must exclude control characters.
          const name = doc.title.replace(/[<>:"/\\|?*\x00-\x1F]/g, '_').slice(0, 80);
          writeFileSync(
            join(folder, name + '-' + doc.id.slice(0, 8) + '.md'),
            doc.markdown,
            'utf8',
          );
        }
        return true;
      }
      case 'previewContext':
        return buildContext(args[0], requireStore(), args[1]);
      case 'startPlanning':
      case 'savePlanning': {
        const current = requireStore();
        if (current.root !== args[method === 'startPlanning' ? 1 : 3])
          throw new Error('프로젝트가 변경되었습니다.');
        const planning = new PlanningSessionStore(current);
        if (method === 'startPlanning') planning.start(args[0]);
        else planning.save(args[0], args[1], args[2]);
        return current.workspace();
      }
      case 'projectMap':
        return new ProjectMapStore(requireStore()).read();
      case 'saveUserFlow': {
        const current = requireStore();
        if (current.root !== args[2]) throw new Error('프로젝트가 변경되었습니다.');
        const workspace = current.workspace();
        return new UserFlowStore(current.root, workspace.project.id, workspace.documents).save(
          args[0],
          args[1],
        );
      }
      case 'importUserFlow': {
        const current = requireStore();
        if (current.root !== args[2]) throw new Error('프로젝트가 변경되었습니다.');
        const workspace = current.workspace();
        const source = workspace.flows.find(
          (flow) => flow.id === args[0] && flow.sourceRevision === args[1],
        );
        if (!source) throw new Error('원본 흐름이 변경되었습니다.');
        return new UserFlowStore(
          current.root,
          workspace.project.id,
          workspace.documents,
        ).importMermaid(source);
      }
      case 'saveMapLayout':
        return new ProjectMapStore(requireStore()).saveLayout(args[0], args[1]);
      case 'saveMapView':
        return new ProjectMapStore(requireStore()).saveView(args[0], args[1]);
      case 'listAnalyses':
        return new AnalysisService(requireStore()).list();
      case 'prepareAnalysis': {
        if (controller) throw new Error('진행 중인 AI 요청이 끝난 뒤 분석을 계획해 주세요.');
        const current = requireStore();
        const preferences = readSettings();
        let model = preferences.model;
        if (!model) {
          const client = makeProvider(preferences.provider);
          try {
            model = (await client.listModels()).find((item) => item.isDefault)?.model || '';
          } finally {
            await client.close();
          }
        }
        if (current !== store || controller)
          throw new Error('프로젝트 또는 요청 상태가 바뀌었습니다. 다시 계획해 주세요.');
        return new AnalysisService(current).prepare(args[0], {
          provider: preferences.provider,
          model,
        });
      }
      case 'startAnalysis': {
        if (controller) throw new Error('이전 AI 요청이 진행 중입니다.');
        const service = new AnalysisService(requireStore());
        const record = service.get(args[0]);
        const preferences = readSettings();
        if (
          record.provider !== preferences.provider ||
          (preferences.model && record.model !== preferences.model)
        )
          throw new Error('제공자 또는 모델이 변경되었습니다. 분석 계획을 다시 만들어 주세요.');
        controller = new AbortController();
        const currentController = controller;
        setTimeout(async () => {
          let terminal: AiEvent = {
            type: 'error',
            message: '분석이 중단되었습니다. 재개해 주세요.',
          };
          try {
            for await (const event of service.run(
              record.id,
              () => {
                provider = makeProvider(record.provider);
                return provider;
              },
              currentController.signal,
            )) {
              if (event.type === 'result' || event.type === 'error' || event.type === 'cancelled')
                terminal = event;
              else notify(record.id, event);
            }
          } catch (error) {
            terminal = { type: 'error', message: (error as Error).message };
          } finally {
            controller = undefined;
            provider = undefined;
            notify(record.id, terminal);
          }
        }, 25);
        return record.id;
      }
      case 'providerStatus': {
        const client = makeProvider(args[0]);
        try {
          const status = await client.getStatus();
          if (
            status.label === 'Codex' &&
            process.env.NODE_ENV === 'test' &&
            process.env.DOCFLOW_TEST_FIXTURE
          )
            status.detail = '테스트 연결';
          return status;
        } finally {
          await client.close();
        }
      }
      case 'cancelRequest':
        controller?.abort();
        return;
      case 'acceptProposal': {
        const s = requireStore();
        if (args[1] && args[2] !== s.root) throw new Error('프로젝트가 변경되었습니다.');
        return new ProposalService(s).accept(args[0], args[1]);
      }
      case 'rejectProposal': {
        if (controller) throw new Error('AI 요청이 끝난 뒤 제안을 거절해 주세요.');
        return new ProposalService(requireStore()).reject(args[0], args[1]);
      }
      case 'sendRejection':
      case 'retryRejection':
      case 'startRequest': {
        if (controller) throw new Error('이전 AI 요청이 진행 중입니다.');
        const s = requireStore();
        const feedbackService = new FeedbackService(s);
        const isFeedback = method !== 'startRequest';
        if (isFeedback && args[method === 'sendRejection' ? 4 : 2] !== s.root)
          throw new Error('프로젝트가 바뀌어 거절 요청을 적용하지 않았습니다.');
        const feedback =
          method === 'sendRejection'
            ? feedbackService.prepare(args[0], args[1], args[2])
            : method === 'retryRejection'
              ? feedbackService.get(args[0])
              : undefined;
        if (feedback?.status === 'completed') return null;
        if (feedback && !['ready', 'failed'].includes(feedback.status))
          throw new Error('이미 진행 중인 피드백입니다.');
        const input = (
          method === 'startRequest' ? args[0] : method === 'sendRejection' ? args[3] : args[1]
        ) as ContextInput;
        const replacesId = isFeedback ? undefined : args[1];
        const preferences = readSettings();
        controller = new AbortController();
        const currentController = controller;
        let snapshot: ContextSnapshot;
        try {
          snapshot = await buildContext(
            feedback
              ? {
                  ...input,
                  instruction: `거절 이유를 검토하고 답변하거나 보완안을 제안해 주세요: ${feedback.reason}`,
                }
              : input,
            s,
            replacesId,
            feedback?.id,
          );
          assertDocumentEvidence(snapshot);
          if (input.reviewedContextId) {
            assertReviewedContext(
              snapshot,
              s.get<ContextSnapshot>('context', input.reviewedContextId),
            );
            s.saveSnapshot(snapshot);
          }
          if (
            s
              .workspace()
              .drafts?.some((draft) =>
                snapshot.sources.some((source) => source.documentId === draft.documentId),
              )
          )
            throw new Error(
              '요청 맥락에 미저장 초안이 있습니다. 초안을 저장하거나 해당 문서를 제외해 주세요.',
            );
          if (snapshot.planningContext) {
            s.transaction(() => {
              s.put('message', {
                id: randomUUID(),
                role: 'user',
                text: input.instruction,
                requestId: snapshot.requestId,
                createdAt: new Date().toISOString(),
              });
              new PlanningSessionStore(s).attachRequest(
                snapshot.planningContext!.sessionId,
                snapshot.requestId,
              );
            });
          }
          if (feedback) feedbackService.setStatus(feedback.id, 'running', snapshot.requestId);
          provider = makeProvider(preferences.provider);
        } catch (error) {
          controller = undefined;
          if (feedback) feedbackService.setStatus(feedback.id, 'failed');
          throw error;
        }
        const requestId = snapshot.requestId;
        const client = provider;
        let usageRecord: RequestUsage = {
          id: requestId,
          provider: preferences.provider,
          model: preferences.model || null,
          createdAt: new Date().toISOString(),
          status: 'running',
          usage: normalizeCodexUsage(undefined),
        };
        if (!feedback && !snapshot.planningContext) {
          const userMessage: Message = {
            id: randomUUID(),
            role: 'user',
            text: input.instruction,
            requestId,
            createdAt: new Date().toISOString(),
          };
          try {
            s.put('message', userMessage);
          } catch (error) {
            await client.close();
            controller = undefined;
            provider = undefined;
            throw error;
          }
        }
        setTimeout(async () => {
          let terminal: AiEvent = {
            type: 'error',
            message: 'AI 응답이 완료되지 않았습니다. 다시 요청해 주세요.',
          };
          try {
            s.saveUsage(usageRecord);
            notify(requestId, { type: 'context', context: snapshot });
            for await (const aiEvent of client.run(
              snapshot,
              currentController.signal,
              preferences.model || undefined,
            )) {
              if (aiEvent.type === 'usage') {
                usageRecord = {
                  ...usageRecord,
                  usage: aiEvent.usage,
                  model: aiEvent.model || usageRecord.model,
                };
                s.saveUsage(usageRecord);
                if (aiEvent.limits?.windows.length)
                  lastLimits[preferences.provider] = aiEvent.limits;
              }
              if (aiEvent.type === 'result') {
                if (currentController.signal.aborted) {
                  terminal = { type: 'cancelled' };
                  break;
                }
                if (snapshot.planningContext) {
                  const planning = new PlanningSessionStore(s);
                  const current = planning.read(snapshot.planningContext.sessionId);
                  if (current.revision !== snapshot.planningContext.revision)
                    throw new Error('기획이 변경되었습니다. 다시 요청해 주세요.');
                  if (
                    aiEvent.response.proposals.some((proposal) => proposal.kind !== 'create') ||
                    (snapshot.planningContext.action === 'discuss' &&
                      aiEvent.response.proposals.length)
                  )
                    throw new Error('기획 대화에는 요청한 새 문서 초안만 제안할 수 있습니다.');
                  if (aiEvent.response.planningSuggestion)
                    planning.suggest(
                      current.id,
                      current.revision,
                      requestId,
                      aiEvent.response.planningSuggestion,
                    );
                }
                await new ProposalService(s).register(snapshot.id, aiEvent.response, replacesId);
                s.put('message', {
                  id: randomUUID(),
                  role: 'assistant',
                  text: aiEvent.response.message,
                  requestId,
                  createdAt: new Date().toISOString(),
                });
              }
              if (
                aiEvent.type === 'result' ||
                aiEvent.type === 'error' ||
                aiEvent.type === 'cancelled'
              ) {
                terminal = aiEvent;
                break;
              }
              notify(requestId, aiEvent);
            }
          } catch (error) {
            terminal = { type: 'error', message: (error as Error).message };
          } finally {
            if (currentController.signal.aborted && terminal.type !== 'result')
              terminal = { type: 'cancelled' };
            try {
              s.saveUsage({
                ...usageRecord,
                status:
                  terminal.type === 'result'
                    ? 'completed'
                    : terminal.type === 'cancelled'
                      ? 'cancelled'
                      : 'error',
              });
              if (feedback)
                feedbackService.setStatus(
                  feedback.id,
                  terminal.type === 'result' ? 'completed' : 'failed',
                );
            } catch (error) {
              terminal = { type: 'error', message: (error as Error).message };
            }
            try {
              await client.close();
            } finally {
              controller = undefined;
              provider = undefined;
              notify(requestId, terminal);
            }
          }
        }, 25);
        return requestId;
      }
    }
  });
  return async () => {
    ipcMain.removeHandler('workspace:call');
    controller?.abort();
    await provider?.close();
    store?.close();
  };
}
