import { ProjectBriefing } from './features/briefing/ProjectBriefing';
import { ContextSelection } from './features/context/ContextSelection';
import { compareDocuments, displayDocumentType } from '../shared/document-presentation';
import { useEffect, useRef, useState } from 'react';
import {
  Workflow,
  PanelLeft,
  PanelRight,
  FolderOpen,
  FolderPlus,
  Plus,
  FileText,
  FilePlus2,
  Upload,
  Download,
  Search,
  ChevronRight,
  ChevronDown,
  Settings2,
  MoreHorizontal,
  Network,
  GitBranch,
  MessageSquare,
  ListChecks,
  ArrowUp,
  Square,
  X,
  Check,
  Link2,
  Sparkles,
  BookOpen,
  Hash,
  RefreshCw,
  AlertCircle,
  ArrowUpRight,
  Layers,
} from 'lucide-react';
import type {
  ContextInput,
  ContextSnapshot,
  DocumentType,
  ProviderStatus,
  Workspace,
  Preferences,
  ImportPreview,
  ProjectEntry,
  EditorDraft,
  DocumentRegistrationPreview,
  DocumentLink,
} from '../shared/contracts';
import { ConnectionSetup } from './components/ConnectionSetup';
import { ImportDialog } from './components/ImportDialog';
import { DocumentRegistrationDialog } from './components/DocumentRegistrationDialog';
import { DocumentLinksPanel } from './components/DocumentLinksPanel';
import { Dialog } from './components/Dialog';
import { UsagePanel } from './components/UsagePanel';
import { ProjectSections } from './components/ProjectSections';
import { Tooltip } from './components/Tooltip';
import { DocumentView, Markdown } from './features/documents/DocumentView';
import { ProjectGraph } from './features/graph/ProjectGraph';
import { ProjectDiagrams as Diagram } from './features/user-flow/ProjectDiagrams';
import { ProposalList } from './features/proposals/ProposalList';
import { AnalysisDialog } from './features/analysis/AnalysisDialog';
import './styles.css';
const typeLabels: Record<DocumentType, string> = {
  overview: '개요',
  prd: 'PRD',
  feature: '기능 명세',
  flow: '사용자 흐름',
  design: '기술 설계',
  note: '일반 문서',
};
export default function App() {
  const [preferences, setPreferences] = useState<Preferences>({
    provider: 'codex',
    model: '',
    models: { codex: '', claude: '' },
    onboardingDone: false,
  });
  const [connectionSetup, setConnectionSetup] = useState(false);
  const [importPreview, setImportPreview] = useState<ImportPreview | null>(null);
  const [registration, setRegistration] = useState<DocumentRegistrationPreview | null>(null);
  const [externalLink, setExternalLink] = useState<{ link: DocumentLink; root: string } | null>(
    null,
  );
  const [dragging, setDragging] = useState(false);
  const importing = useRef(false);
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [selectedId, setSelectedId] = useState('');
  const [sectionId, setSectionId] = useState('');
  const [userFlowFocus, setUserFlowFocus] = useState<{ flowId: string; nodeId: string }>();
  const [view, setView] = useState<'document' | 'graph' | 'diagram' | 'planning'>('document');
  const [briefing, setBriefing] = useState(false);
  const [diagramMode, setDiagramMode] = useState<'mermaid' | 'userflow'>();
  const [ideaMode, setIdeaMode] = useState(false);
  const [pendingContextRequest, setPendingContextRequest] = useState<{ replacesId?: string }>();
  const [flowEditing, setFlowEditing] = useState(false);
  const [flowSourceLine, setFlowSourceLine] = useState(0);
  const [panelTab, setPanelTab] = useState<'chat' | 'proposals'>('chat');
  const [sidebar, setSidebar] = useState(true);
  const [assistant, setAssistant] = useState(true);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<ProviderStatus>({
    connected: false,
    label: 'Codex',
    detail: '연결 확인 중',
  });
  const [prompt, setPrompt] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState('');
  const [dirty, setDirty] = useState(false);
  const [modal, setModal] = useState<'none' | 'new' | 'settings' | 'context' | 'relation'>('none');
  const [analysisOpen, setAnalysisOpen] = useState(false);
  const [analysisInstruction, setAnalysisInstruction] = useState('');
  const [sentContext, setSentContext] = useState<ContextSnapshot | null>(null);
  const [context, setContext] = useState<ContextSnapshot | null>(null);
  const [excluded, setExcluded] = useState<string[]>([]);
  const [included, setIncluded] = useState<string[]>([]);
  const [title, setTitle] = useState('');
  const [docType, setDocType] = useState<DocumentType>('note');
  const [projectName, setProjectName] = useState('');
  const [goal, setGoal] = useState('');
  const [constraints, setConstraints] = useState('');
  const [relationSource, setRelationSource] = useState('');
  const [relationTarget, setRelationTarget] = useState('');
  const [relationType, setRelationType] = useState('참고');
  const feedbackRequest = useRef(false);
  const promptRef = useRef<HTMLTextAreaElement>(null);
  const chatEnd = useRef<HTMLDivElement>(null);
  const requestIdRef = useRef('');
  const docs = workspace?.documents || [];
  const doc = docs.find((d) => d.id === selectedId) || docs[0];
  const section = doc?.sections.find((s) => s.id === sectionId);
  const pending =
    workspace?.proposals.filter((p) => p.status === 'pending' || p.status === 'stale').length || 0;
  const [flowRequestId, setFlowRequestId] = useState<string | null | undefined>();
  const [usageOpen, setUsageOpen] = useState(false);
  const [projects, setProjects] = useState<ProjectEntry[]>([]);
  const activeRootRef = useRef('');
  const writes = useRef<Promise<void>>(Promise.resolve());
  const queueWrite = (save: () => Promise<void>) => {
    const pending = writes.current.catch(() => {}).then(save);
    writes.current = pending;
    void pending.catch((e) => setError((e as Error).message));
  };
  const update = (next: Workspace | null) => {
    if ((next?.root || '') !== activeRootRef.current) {
      activeRootRef.current = next?.root || '';
      setSelectedId(next?.session?.selectedId || '');
      setView(next?.session?.view || 'document');
      setBriefing(!!next && !next.session);
      setIdeaMode(false);
      setDiagramMode(undefined);
      setPendingContextRequest(undefined);
      setPrompt(next?.session?.prompt || '');
      setDirty(false);
      setSearch('');
      setContext(null);
      setSentContext(null);
      setFlowRequestId(undefined);
      setUsageOpen(false);
      setRegistration(null);
      setExternalLink(null);
    }
    setWorkspace(next);
    void window.workspace
      .listProjects()
      .then(setProjects)
      .catch((e) => setError(e.message));
  };
  const changeProject = async (
    open: () => Promise<Workspace | null>,
    selected?: string,
    discover = false,
  ) => {
    if (flowEditing) throw new Error('흐름 편집을 저장하거나 취소한 뒤 프로젝트를 바꿔 주세요.');
    await writes.current;
    const next = await open();
    if (next) {
      update(next);
      if (discover) {
        const preview = await window.workspace.previewProjectDocuments();
        if (preview.files.length || preview.warnings.length) setRegistration(preview);
      }
      setBriefing(!selected && !next.session);
      if (selected) {
        setSelectedId(selected);
        setView('document');
      }
    }
  };
  const draftChanged = (draft: EditorDraft | null) => {
    if (!workspace || !doc) return;
    const root = workspace.root;
    const documentId = doc.id;
    setWorkspace((old) =>
      old && old.root === root
        ? {
            ...old,
            drafts: [
              ...(old.drafts || []).filter((item) => item.documentId !== documentId),
              ...(draft ? [draft] : []),
            ],
          }
        : old,
    );
    queueWrite(() =>
      draft
        ? window.workspace.saveDraft(draft, root)
        : window.workspace.discardDraft(documentId, root),
    );
  };
  const act = async (fn: () => Promise<unknown>) => {
    setError('');
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message.replace(/^Error invoking remote method '[^']+': Error: /, ''));
      try {
        update(await window.workspace.current());
      } catch {
        /* Preserve the current view when the project cannot be refreshed. */
      }
    } finally {
      setBusy(false);
    }
  };
  const mayLeave = () =>
    !dirty || confirm('저장하지 않은 변경이 있습니다. 변경을 버리고 이동할까요?');
  const switchView = (next: typeof view) => {
    if ((next !== view || briefing) && !mayLeave()) return;
    if (next !== view) setDirty(false);
    setView(next);
    setBriefing(false);
  };
  const select = (id: string, next = workspace) => {
    const target = next?.documents.find((d) => d.id === id || d.sections.some((s) => s.id === id));
    if (!target) return;
    if ((target.id !== doc?.id || flowEditing) && !mayLeave()) return;
    setSelectedId(target.id);
    setSectionId(id === target.id ? '' : id);
    setView('document');
    setBriefing(false);
    setFlowSourceLine(0);
    if (target.id !== doc?.id) setDirty(false);
    if (id !== target.id)
      setTimeout(
        () => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
        80,
      );
  };
  const followLink = (item: DocumentLink) =>
    void act(async () => {
      if (!workspace) return;
      const link = await window.workspace.resolveDocumentLink(
        item.documentId,
        item.id,
        item.revision,
        workspace.root,
      );
      const fresh = await window.workspace.current();
      if (fresh?.root !== workspace.root) throw new Error('프로젝트가 변경되었습니다.');
      update(fresh);
      if (link.status === 'resolved' && link.targetId)
        select(link.targetSectionId || link.targetId, fresh);
      else if (link.status === 'unregistered')
        setRegistration(
          await window.workspace.previewLinkedDocument(
            link.documentId,
            link.id,
            link.revision,
            workspace.root,
          ),
        );
      else if (link.status === 'external') setExternalLink({ link, root: workspace.root });
      else setError(link.reason || '링크를 열 수 없습니다.');
    });
  const contextInput = (instruction = prompt): ContextInput => ({
    ...(flowRequestId !== undefined ? { flowId: flowRequestId } : {}),
    mode: ideaMode && flowRequestId === undefined ? 'idea' : 'documents',
    instruction: instruction.trim() || '프로젝트 맥락 확인',
    selectedIds:
      ideaMode && flowRequestId === undefined
        ? []
        : [...new Set([...(doc ? [doc.id] : []), ...included])],
    excludedIds: excluded,
  });
  const request = async (instruction = prompt, replacesId?: string, reviewedId?: string) => {
    if (!instruction.trim() || running) return;
    if (dirty) {
      setError('작성 중인 문서를 저장한 뒤 AI에 요청해 주세요.');
      return;
    }
    feedbackRequest.current = false;
    setError('');
    setRunning(true);
    setProgress('요청 맥락을 준비하고 있습니다.');
    setPanelTab('chat');
    setAssistant(true);
    try {
      const input = contextInput(
        section ? instruction + '\n현재 집중 섹션: ' + section.title : instruction,
      );
      const preview = reviewedId
        ? context
        : await window.workspace.previewContext(input, replacesId);
      if (!preview) throw new Error('요청 맥락을 다시 확인해 주세요.');
      if (
        !reviewedId &&
        (preview.selection?.mode === 'excerpts' ||
          (preview.requiresEvidence && !preview.sources.length))
      ) {
        setContext(preview);
        setPendingContextRequest({ replacesId });
        setModal('context');
        setRunning(false);
        return;
      }
      requestIdRef.current = await window.workspace.startRequest(
        { ...input, reviewedContextId: reviewedId || preview.id },
        replacesId,
      );
      setModal('none');
      setPendingContextRequest(undefined);
      setPrompt('');
      update(await window.workspace.current());
    } catch (e) {
      setError((e as Error).message);
      setRunning(false);
    }
  };
  const rejection = async (
    proposalId: string,
    reason: string,
    feedbackId: string,
    retry = false,
  ): Promise<boolean> => {
    if (!workspace || running || busy) return false;
    if (reason.trim() && dirty) {
      setError('작성 중인 문서를 저장한 뒤 AI에 요청해 주세요.');
      return false;
    }
    setError('');
    setBusy(true);
    setRunning(true);
    feedbackRequest.current = true;
    try {
      const input = contextInput('거절 이유 검토');
      const requestId = retry
        ? await window.workspace.retryRejection(feedbackId, input, workspace.root)
        : await window.workspace.sendRejection(
            proposalId,
            reason,
            feedbackId,
            input,
            workspace.root,
          );
      requestIdRef.current = requestId || '';
      if (requestId) {
        setPanelTab('chat');
        setAssistant(true);
        setProgress('거절 이유를 검토하고 있습니다.');
      } else {
        setRunning(false);
        feedbackRequest.current = false;
      }
      update(await window.workspace.current());
      return true;
    } catch (e) {
      setError((e as Error).message);
      setRunning(false);
      feedbackRequest.current = false;
      update(await window.workspace.current());
      return false;
    } finally {
      setBusy(false);
    }
  };
  const preparePrompt = (text: string) => {
    setPrompt(text);
    setPanelTab('chat');
    setAssistant(true);
    setTimeout(() => promptRef.current?.focus(), 50);
  };
  const reviewDiagramRequest = async (instruction: string, flowId?: string | null) => {
    if (dirty || running)
      throw new Error('작성 중인 내용을 저장하고 AI 요청을 마친 뒤 진행해 주세요.');
    const preview = await window.workspace.previewContext({
      instruction,
      mode: 'documents',
      selectedIds: [...new Set([...(doc ? [doc.id] : []), ...included])],
      excludedIds: excluded,
      ...(flowId !== undefined ? { flowId } : {}),
    });
    setIdeaMode(false);
    setFlowRequestId(flowId);
    setPendingContextRequest({});
    preparePrompt(instruction);
    setContext(preview);
    setModal('context');
  };
  useEffect(() => {
    if (!window.workspace) {
      setError('Docflow 데스크톱 앱에서 열어 주세요.');
      return;
    }
    void window.workspace
      .current()
      .then(update)
      .catch((e) => setError(e.message));
    void window.workspace.providerStatus().then(setStatus);
    void window.workspace
      .preferences()
      .then((p) => {
        setPreferences(p);
        setConnectionSetup(!p.onboardingDone);
      })
      .catch((e) => setError(e.message));
    return window.workspace.onRequestEvent(({ requestId, event }) => {
      if (requestIdRef.current && requestIdRef.current !== requestId) return;
      if (event.type === 'context') {
        setSentContext(event.context);
        return;
      }
      if (event.type === 'progress') setProgress(event.text);
      else if (event.type === 'usage') return;
      else {
        setRunning(false);
        setProgress('');
        requestIdRef.current = '';
        if (event.type === 'error') setError(event.message);
        if (event.type === 'cancelled')
          setNotice('요청을 취소했습니다. 문서는 변경하지 않았습니다.');
        if (event.type === 'result' && event.response.proposals.length && !feedbackRequest.current)
          setPanelTab('proposals');
        feedbackRequest.current = false;
        void window.workspace
          .current()
          .then(update)
          .catch((e) => setError(e.message));
      }
    });
  }, []);
  useEffect(() => {
    setExcluded([]);
    setAnalysisOpen(false);
    setIncluded([]);
    setSectionId('');
  }, [workspace?.root]);
  useEffect(() => {
    if (!workspace) return;
    const root = workspace.root;
    queueWrite(() =>
      window.workspace.saveSession({ selectedId, view, prompt, collapsed: false }, root),
    );
  }, [workspace?.root, selectedId, view, prompt]);
  useEffect(() => {
    chatEnd.current?.scrollIntoView({ behavior: 'smooth' });
  }, [workspace?.messages.length, progress]);
  useEffect(() => {
    if (!workspace) return;
    const refresh = () => {
      void window.workspace
        .current()
        .then((next) => {
          if (next && !dirty)
            setWorkspace((current) =>
              JSON.stringify(current) === JSON.stringify(next) ? current : next,
            );
        })
        .catch((e) => setError(e.message));
    };
    const timer = setInterval(refresh, 2500);
    window.addEventListener('focus', refresh);
    return () => {
      clearInterval(timer);
      window.removeEventListener('focus', refresh);
    };
  }, [workspace?.root, dirty]);
  useEffect(() => {
    const handler = (event: BeforeUnloadEvent) => {
      if (dirty) {
        event.preventDefault();
        event.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirty]);
  const openContext = () =>
    void act(async () => {
      setPendingContextRequest(undefined);
      setContext(await window.workspace.previewContext(contextInput()));
      setModal('context');
    });
  const reviewRelations = () =>
    void act(async () => {
      if (dirty) throw new Error('작성 중인 문서를 저장한 뒤 관계를 검토해 주세요.');
      const instruction =
        '선택한 문서의 관계 검토를 해줘. 근거가 있는 문서 연결을 relation 제안으로 설명해줘. 기존 연결을 삭제하거나 문서를 수정하지 마.';
      const selected = docs.filter((d) => !excluded.includes(d.id)).map((d) => d.id);
      if (selected.length < 2)
        throw new Error('관계 검토에는 저장된 문서가 두 개 이상 필요합니다.');
      if (workspace?.drafts?.some((draft) => selected.includes(draft.documentId)))
        throw new Error('관계 검토 대상에 미저장 초안이 있습니다. 초안을 저장한 뒤 검토해 주세요.');
      try {
        const preview = await window.workspace.previewContext({
          instruction,
          selectedIds: selected,
          excludedIds: excluded,
        });
        setIncluded(selected);
        setIdeaMode(false);
        setPendingContextRequest({});
        preparePrompt(instruction);
        setContext(preview);
        setModal('context');
      } catch (error) {
        if (!(error as Error).message.includes('맥락이 너무')) throw error;
        setAnalysisInstruction(instruction);
        setAnalysisOpen(true);
      }
    });
  const related =
    workspace?.relations.filter((r) =>
      [r.fromId, r.toId].some(
        (id) => doc && (doc.id === id || doc.sections.some((section) => section.id === id)),
      ),
    ) || [];
  const openSettings = () => {
    if (!workspace) return;
    setProjectName(workspace.project.name);
    setGoal(workspace.project.goal);
    setConstraints(workspace.project.constraints);
    setModal('settings');
  };
  const importFiles = (files?: File[]) => {
    if (
      busy ||
      importing.current ||
      importPreview ||
      registration ||
      flowEditing ||
      externalLink ||
      connectionSetup ||
      modal !== 'none'
    )
      return;
    importing.current = true;
    void act(async () => {
      try {
        if (files) {
          await writes.current;
          const project = await window.workspace.openDroppedProject(files);
          if (project) {
            update(project);
            const preview = await window.workspace.previewProjectDocuments();
            if (preview.files.length || preview.warnings.length) setRegistration(preview);
            return;
          }
        }
        if (
          files &&
          (!files.length ||
            files.length > 30 ||
            files.some((f) => !/\.(md|markdown)$/i.test(f.name) || f.size > 2_000_000) ||
            files.reduce((sum, f) => sum + f.size, 0) > 10_000_000)
        )
          throw new Error(
            'Markdown 파일을 1~30개 선택해 주세요. 파일당 2MB, 전체 10MB까지 가져올 수 있습니다.',
          );
        if (!workspace) {
          const next = await window.workspace.createProject();
          if (!next) return;
          update(next);
        }
        const preview = files
          ? await window.workspace.previewDroppedDocuments(
              await Promise.all(
                files.map(async (file) => ({ name: file.name, text: await file.text() })),
              ),
            )
          : await window.workspace.previewImport();
        setImportPreview(preview);
      } finally {
        importing.current = false;
      }
    });
  };
  const cancelImport = () =>
    void act(async () => {
      await window.workspace.cancelImport();
      setImportPreview(null);
    });
  const chooseDocuments = (kind?: 'files' | 'folder') =>
    void act(async () => {
      const preview = kind
        ? await window.workspace.previewDocumentPaths(kind)
        : await window.workspace.previewProjectDocuments();
      if (preview) setRegistration(preview);
    });
  const closeConnection = () =>
    void act(async () => {
      setPreferences(await window.workspace.savePreferences({ onboardingDone: true }));
      setConnectionSetup(false);
    });

  return (
    <div
      className={'app-shell ' + (/Mac/.test(navigator.platform) ? 'platform-mac' : '')}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes('Files')) {
          e.preventDefault();
          e.dataTransfer.dropEffect = 'copy';
          setDragging(true);
        }
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragging(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        if (e.dataTransfer.files.length) importFiles(Array.from(e.dataTransfer.files));
      }}
    >
      <Tooltip />
      {dragging && (
        <div className="drop-overlay">
          프로젝트 폴더 또는 Markdown 파일을 놓아 문서를 확인하세요
        </div>
      )}
      {connectionSetup && (
        <ConnectionSetup
          preferences={preferences}
          status={status}
          running={running}
          onStatus={setStatus}
          onClose={closeConnection}
          onSave={(p) => {
            setPreferences(p);
            setConnectionSetup(false);
          }}
        />
      )}
      {usageOpen && workspace && (
        <UsagePanel
          provider={preferences.provider}
          projectRoot={workspace.root}
          onClose={() => setUsageOpen(false)}
        />
      )}
      {importPreview && (
        <ImportDialog
          preview={importPreview}
          busy={busy}
          onCancel={cancelImport}
          onConfirm={() =>
            void act(async () => {
              update(await window.workspace.confirmImport(importPreview.id));
              setImportPreview(null);
              setNotice('문서를 가져왔습니다. 현재 편집 내용은 유지됩니다.');
            })
          }
        />
      )}
      {registration && (
        <DocumentRegistrationDialog
          key={registration.id}
          preview={registration}
          busy={busy}
          onChoose={chooseDocuments}
          onCancel={() =>
            void act(async () => {
              await window.workspace.cancelDocumentRegistration(registration.id);
              setRegistration(null);
            })
          }
          onConfirm={(paths) =>
            void act(async () => {
              update(await window.workspace.confirmDocumentRegistration(registration.id, paths));
              setRegistration(null);
              setNotice('원본 문서를 연결했습니다. 등록으로 파일 본문은 변경하지 않았습니다.');
            })
          }
        />
      )}
      {externalLink && (
        <Dialog title="외부 URL 열기" onClose={() => setExternalLink(null)} locked={busy}>
          <p>이 원문 링크를 기본 브라우저에서 열까요?</p>
          <p className="external-link-url">{new URL(externalLink.link.href).href}</p>
          <div className="modal-footer">
            <button className="button" disabled={busy} onClick={() => setExternalLink(null)}>
              외부 URL 취소
            </button>
            <button
              className="button primary"
              disabled={busy}
              onClick={() =>
                void act(async () => {
                  const { link, root } = externalLink;
                  await window.workspace.openExternalDocumentLink(
                    link.documentId,
                    link.id,
                    link.revision,
                    root,
                  );
                  setExternalLink(null);
                })
              }
            >
              브라우저에서 열기
            </button>
          </div>
        </Dialog>
      )}
      <header className="titlebar">
        <div className="brand">
          <Workflow size={20} strokeWidth={2} />
          <strong>Docflow</strong>
          <span className="local-pill">로컬</span>
        </div>
        <div className="titlebar-project">{workspace?.project.name || '새 작업 공간'}</div>
        <div className="titlebar-actions">
          <button
            className="icon-button"
            title="프로젝트 열기"
            aria-label="프로젝트 열기"
            disabled={busy || running}
            onClick={() =>
              void act(() => changeProject(() => window.workspace.openProject(), undefined, true))
            }
          >
            <FolderOpen size={16} />
          </button>
          <button
            className="icon-button"
            title="프로젝트 설정"
            aria-label="프로젝트 설정"
            disabled={!workspace}
            onClick={openSettings}
          >
            <Settings2 size={16} />
          </button>
        </div>
      </header>
      {(error || notice) && (
        <div
          role={error ? 'alert' : 'status'}
          className={'app-banner ' + (error ? 'error-banner' : '')}
        >
          <AlertCircle size={15} />
          <span>{error || notice}</span>
          <button
            className="icon-button"
            title="닫기"
            onClick={() => {
              setError('');
              setNotice('');
            }}
          >
            <X size={14} />
          </button>
        </div>
      )}
      {!!workspace?.documentIssues.length && (
        <div role="alert" className="app-banner error-banner">
          <AlertCircle size={15} />
          <span>{workspace.documentIssues.join(' ')}</span>
        </div>
      )}
      <div
        className={
          'workspace-layout ' + (!sidebar ? 'no-sidebar ' : '') + (!assistant ? 'no-assistant' : '')
        }
      >
        {sidebar && (
          <aside className="sidebar">
            <div className="project-switch">
              <div className="project-avatar">
                <Layers size={18} />
              </div>
              <div>
                <strong>{workspace?.project.name || '작업 공간'}</strong>
                <span>개인 프로젝트</span>
              </div>
              <button
                className="icon-button"
                title="프로젝트 설정"
                disabled={!workspace}
                onClick={openSettings}
              >
                <MoreHorizontal size={16} />
              </button>
            </div>
            <div className="search-field">
              <Search size={14} />
              <input
                aria-label="문서 검색"
                placeholder="문서 검색"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div className="sidebar-label">
              <span>프로젝트 문서</span>
              <div className="action-row">
                <button
                  className="icon-button"
                  title="새 문서"
                  aria-label="새 문서"
                  disabled={!workspace}
                  onClick={() => {
                    setTitle('');
                    setDocType('note');
                    setModal('new');
                  }}
                >
                  <Plus size={15} />
                </button>
              </div>
            </div>
            <button
              className="import-command"
              aria-label="Markdown 가져오기"
              disabled={busy}
              onClick={() => importFiles()}
            >
              <Upload size={16} />
              <span>
                Markdown 가져오기<small>여러 파일 선택 또는 끌어놓기</small>
              </span>
            </button>
            <button
              className="import-command"
              aria-label="프로젝트 원본 문서 추가"
              disabled={busy || !workspace}
              onClick={() => chooseDocuments()}
            >
              <FolderOpen size={16} />
              <span>
                원본 문서 추가<small>docs 탐색 · 파일 또는 폴더 선택</small>
              </span>
            </button>
            <ProjectSections
              entries={projects}
              activeRoot={workspace?.root}
              disabled={busy || running || flowEditing}
              onError={setError}
              onSelect={(entry, id) =>
                void act(() => changeProject(() => window.workspace.activateProject(entry.id), id))
              }
              onForget={(entry) =>
                void act(async () => {
                  await writes.current;
                  update(await window.workspace.forgetProject(entry.id));
                })
              }
            >
              <nav className="document-nav">
                {docs
                  .filter((d) =>
                    (d.title + d.markdown).toLowerCase().includes(search.toLowerCase()),
                  )
                  .sort(compareDocuments)
                  .map((d) => (
                    <div key={d.id}>
                      <button
                        className={'document-nav-item ' + (d.id === doc?.id ? 'active' : '')}
                        onClick={() => select(d.id)}
                      >
                        <FileText size={15} />
                        <span>{d.title}</span>
                        {displayDocumentType(d) && (
                          <span className={'nav-type type-' + d.type}>
                            {displayDocumentType(d)}
                          </span>
                        )}
                      </button>
                      {d.id === doc?.id && !search && (
                        <div className="section-nav">
                          {d.sections
                            .filter((s) => s.level > 1)
                            .map((s) => (
                              <button
                                key={s.id}
                                className={s.id === sectionId ? 'section-active' : ''}
                                style={{ paddingLeft: 17 + Math.min(s.level - 2, 3) * 10 }}
                                onClick={() => select(s.id)}
                              >
                                <Hash size={11} />
                                <span>{s.title}</span>
                              </button>
                            ))}
                        </div>
                      )}
                    </div>
                  ))}
              </nav>
            </ProjectSections>
            <div className="sidebar-bottom">
              <button
                className="sidebar-command"
                disabled={busy || running}
                onClick={() =>
                  void act(() =>
                    changeProject(() => window.workspace.createProject(), undefined, true),
                  )
                }
              >
                <FolderPlus size={15} />새 프로젝트
              </button>
              <button
                className="sidebar-command"
                disabled={!workspace || busy}
                onClick={() =>
                  void act(async () => {
                    if (await window.workspace.exportDocuments())
                      setNotice('Markdown 문서를 새 폴더로 내보냈습니다.');
                  })
                }
              >
                <Download size={15} />
                Markdown 내보내기
              </button>
              <div className="storage-note">
                <span className="status-dot" />내 컴퓨터에 저장
              </div>
            </div>
          </aside>
        )}
        <main className="main-panel">
          <div className="workspace-toolbar">
            <div className="toolbar-start">
              <button
                className="icon-button"
                title="문서 목록 표시 전환"
                onClick={() => setSidebar(!sidebar)}
              >
                <PanelLeft size={17} />
              </button>
              <span className="breadcrumb">
                프로젝트
                <ChevronRight size={12} />
                <span>
                  {briefing
                    ? '브리핑'
                    : view === 'document'
                      ? doc?.title || '문서'
                      : view === 'graph'
                        ? '문서 구조'
                        : '사용자 흐름'}
                </span>
              </span>
            </div>
            <div className="view-tabs">
              <button
                aria-label="프로젝트 브리핑"
                className={briefing ? 'active' : ''}
                onClick={() => {
                  if (mayLeave()) {
                    setBriefing(true);
                    setDirty(false);
                  }
                }}
              >
                <BookOpen size={14} />
                <span>브리핑</span>
              </button>
              <button
                className={!briefing && view === 'document' ? 'active' : ''}
                aria-label="문서"
                onClick={() => switchView('document')}
              >
                <FileText size={14} />
                <span>문서</span>
              </button>
              <button
                className={!briefing && view === 'graph' ? 'active' : ''}
                aria-label="문서 구조"
                onClick={() => switchView('graph')}
              >
                <Network size={14} />
                <span>문서 구조</span>
              </button>
              <button
                className={!briefing && view === 'diagram' ? 'active' : ''}
                aria-label="사용자 흐름"
                onClick={() => switchView('diagram')}
              >
                <GitBranch size={14} />
                <span>사용자 흐름</span>
              </button>
            </div>
            <button
              className={'icon-button ' + (assistant ? 'selected' : '')}
              title="AI 패널 표시 전환"
              onClick={() => setAssistant(!assistant)}
            >
              <PanelRight size={17} />
            </button>
          </div>
          {!workspace ? (
            <div className="start-workspace">
              <div className="empty-workspace-icon">
                <BookOpen size={30} />
              </div>
              <h1>
                문서를 연결하고,
                <br />
                생각을 구체화하세요.
              </h1>
              <p className="start-description">
                문서를 읽고, 관계를 살펴보고, AI 제안을 비교하는 로컬 작업 공간입니다.
              </p>
              <div className="start-actions">
                <button
                  className="button primary"
                  disabled={busy}
                  onClick={() =>
                    void act(() =>
                      changeProject(() => window.workspace.createProject(), undefined, true),
                    )
                  }
                >
                  <FolderPlus size={16} />
                  프로젝트 만들기
                </button>
                <button
                  className="button"
                  disabled={busy}
                  onClick={() =>
                    void act(() =>
                      changeProject(() => window.workspace.openProject(), undefined, true),
                    )
                  }
                >
                  <FolderOpen size={16} />
                  폴더 열기
                </button>
              </div>
              <button className="button start-import" disabled={busy} onClick={() => importFiles()}>
                <Upload size={16} />
                Markdown 파일로 시작
              </button>
              <button
                className="text-button example-button"
                disabled={busy}
                onClick={() => void act(async () => update(await window.workspace.openExample()))}
              >
                예제 프로젝트 열기
                <ArrowUpRight size={14} />
              </button>
            </div>
          ) : briefing ? (
            <ProjectBriefing
              workspace={workspace}
              onDocument={select}
              onMap={() => switchView('graph')}
              onFlows={(mode, flowId) => {
                setDiagramMode(mode);
                setUserFlowFocus(
                  mode === 'userflow' ? { flowId: flowId || '', nodeId: '' } : undefined,
                );
                switchView('diagram');
              }}
              onReview={() => {
                setPanelTab('proposals');
                setAssistant(true);
              }}
            />
          ) : view === 'graph' ? (
            <ProjectGraph
              key={workspace.project.id}
              workspace={workspace}
              busy={busy || running}
              onReview={reviewRelations}
              onEdit={async (id, type) => {
                try {
                  update(await window.workspace.updateRelation(id, type));
                } catch (e) {
                  setError((e as Error).message);
                  throw e;
                }
              }}
              onSelect={select}
              onConnect={(fromId, toId) => {
                const source = fromId || doc?.id || docs[0]?.id || '';
                setRelationSource(source);
                setRelationTarget(toId || docs.find((d) => d.id !== source)?.id || '');
                setModal('relation');
              }}
              onRemove={(id) =>
                void act(async () => update(await window.workspace.removeRelation(id)))
              }
            />
          ) : view === 'diagram' ? (
            <Diagram
              key={workspace.root}
              workspace={workspace}
              initialMode={diagramMode}
              onRequestFlow={(flowId) =>
                void act(() =>
                  reviewDiagramRequest(
                    flowId
                      ? '문서 근거를 바탕으로 이 유저플로우를 보완해줘. 기존 ID와 수동 배치를 유지해줘.'
                      : '선택한 문서에서 사용자 화면 이동·행동·조건 분기·시스템 처리를 유저플로우로 제안해줘.',
                    flowId,
                  ),
                )
              }
              userFlowFocus={
                userFlowFocus &&
                workspace.userFlows?.some((flow) => flow.id === userFlowFocus.flowId)
                  ? userFlowFocus
                  : undefined
              }
              onEvidence={(evidence) => select(evidence.sectionId || evidence.documentId)}
              flows={workspace.flows}
              issues={workspace.flowIssues}
              staleIds={workspace.staleDiagramIds}
              onSource={(flow) => {
                select(flow.sectionId);
                if (flow.sourceKind === 'markdown') {
                  setFlowSourceLine(flow.line);
                  setTimeout(
                    () =>
                      document
                        .getElementById(`flow-source-${flow.documentId}-${flow.line}`)
                        ?.scrollIntoView({ behavior: 'smooth', block: 'center' }),
                    100,
                  );
                }
              }}
              onDirty={setDirty}
              onEditingChange={setFlowEditing}
              onRefresh={async () => update(await window.workspace.current())}
              onSave={async (flow, code) => {
                try {
                  const next = await window.workspace.saveFlow(
                    flow.id,
                    flow.sourceRevision,
                    code,
                    workspace.root,
                  );
                  update(next);
                  return (
                    next.flows.find(
                      (item) =>
                        item.documentId === flow.documentId &&
                        item.line === flow.line &&
                        item.code.trim() === code.trim(),
                    ) ||
                    next.flows.find(
                      (item) =>
                        item.documentId === flow.documentId && item.code.trim() === code.trim(),
                    )
                  );
                } catch (error) {
                  const next = await window.workspace.current();
                  if (next?.root === workspace.root) update(next);
                  throw error;
                }
              }}
              onGenerate={() =>
                void act(() =>
                  reviewDiagramRequest(
                    '현재 프로젝트와 관련 문서의 맥락을 바탕으로 사용자 흐름도를 만들어줘. Mermaid 다이어그램을 포함한 새 flow 문서를 diagram 제안으로 작성해줘.',
                  ),
                )
              }
            />
          ) : doc ? (
            <>
              <div className="document-context-bar">
                <span className={'type-label type-' + doc.type}>{typeLabels[doc.type]}</span>
                <span>{doc.sections.length}개 섹션</span>
                <span className="separator-dot">·</span>
                <span>{related.length}개 연결</span>
                <div className="grow" />
                <button
                  className="text-button"
                  onClick={() =>
                    preparePrompt(
                      '현재 문서에서 누락된 내용이나 기존 결정과 모순되는 내용을 근거와 함께 제안해줘.',
                    )
                  }
                >
                  <Sparkles size={13} />
                  AI 검토
                </button>
              </div>
              <div className="document-scroll">
                <DocumentView
                  key={workspace!.root + doc.id}
                  doc={doc}
                  initialDraft={workspace?.drafts?.find((item) => item.documentId === doc.id)}
                  onDraftChange={draftChanged}
                  onSave={async (text, revision) => {
                    try {
                      update(await window.workspace.saveDocument(doc.id, text, revision));
                    } catch (e) {
                      setError((e as Error).message);
                      throw e;
                    }
                  }}
                  onDirty={setDirty}
                  focusedFlowLine={flowSourceLine}
                  links={workspace!.documentLinks.filter((link) => link.documentId === doc.id)}
                  onLink={followLink}
                />
                <DocumentLinksPanel
                  links={workspace!.documentLinks.filter((link) => link.documentId === doc.id)}
                  busy={busy}
                  onLink={followLink}
                  onRefresh={() => void act(async () => update(await window.workspace.current()))}
                />
                {(workspace!.userFlows || []).some((flow) =>
                  flow.nodes.some((node) =>
                    node.evidence.some((evidence) => evidence.documentId === doc.id),
                  ),
                ) && (
                  <div className="user-flow-document-links" aria-label="문서에 연결된 유저플로우">
                    <h3>연결된 유저플로우 단계</h3>
                    {(workspace!.userFlows || []).flatMap((flow) =>
                      flow.nodes
                        .filter((node) =>
                          node.evidence.some((evidence) => evidence.documentId === doc.id),
                        )
                        .map((node) => (
                          <button
                            key={flow.id + node.id}
                            className="text-button"
                            onClick={() => {
                              if (!mayLeave()) return;
                              setUserFlowFocus({ flowId: flow.id, nodeId: node.id });
                              setView('diagram');
                            }}
                          >
                            {flow.title} · {node.data.label}
                          </button>
                        )),
                    )}
                  </div>
                )}
                {related.length > 0 && (
                  <div className="related-documents">
                    <h3>
                      <Link2 size={14} />
                      연결된 문서
                    </h3>
                    {related.map((r) => {
                      const outgoing =
                        r.fromId === doc.id ||
                        doc.sections.some((section) => section.id === r.fromId);
                      const targetId = outgoing ? r.toId : r.fromId;
                      const target = docs.find(
                        (d) =>
                          d.id === targetId ||
                          d.sections.some((section) => section.id === targetId),
                      );
                      return (
                        <button key={r.id} onClick={() => target && select(targetId)}>
                          <FileText size={14} />
                          <span>{target?.title || '연결 확인 필요'}</span>
                          <small>{r.type}</small>
                          <ArrowUpRight size={14} />
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="empty-state">
              <FilePlus2 size={30} />
              <h2>첫 문서 만들기</h2>
              <div className="action-row">
                <button
                  className="button"
                  onClick={() => {
                    setTitle('');
                    setModal('new');
                  }}
                >
                  <Plus size={14} />
                  직접 작성
                </button>
                <button
                  className="button primary"
                  onClick={() => preparePrompt('만들고 싶은 프로젝트는 ')}
                >
                  <Sparkles size={14} />
                  AI와 시작
                </button>
              </div>
            </div>
          )}
          <footer className="workspace-status">
            <span>
              {workspace
                ? `${docs.length}개 문서 · ${workspace.relations.length}개 연결`
                : 'Docflow 0.1'}
            </span>
            <span>{busy ? '저장 중' : running ? 'AI 작업 중' : '로컬 작업 공간'}</span>
          </footer>
        </main>
        {assistant && (
          <aside className="assistant-panel">
            <div className="assistant-heading">
              <div>
                <Sparkles size={17} />
                <strong>프로젝트 어시스턴트</strong>
              </div>
              <span
                className={'connection-indicator ' + (status.connected ? 'connected' : '')}
                title={status.detail}
              />
            </div>
            {flowRequestId !== undefined && (
              <div className="flow-request-mode">
                유저플로우 {flowRequestId ? '수정' : '생성'} 요청{' '}
                <button className="text-button" onClick={() => setFlowRequestId(undefined)}>
                  일반 대화로 전환
                </button>
              </div>
            )}
            <div className="assistant-tabs">
              <button
                className={panelTab === 'chat' ? 'active' : ''}
                onClick={() => setPanelTab('chat')}
              >
                <MessageSquare size={14} />
                대화
              </button>
              <button
                className={panelTab === 'proposals' ? 'active' : ''}
                onClick={() => setPanelTab('proposals')}
              >
                <ListChecks size={14} />
                제안{pending > 0 && <span className="count-badge">{pending}</span>}
              </button>
            </div>
            {panelTab === 'proposals' && workspace ? (
              <ProposalList
                workspace={workspace}
                onAccept={(id, flow) =>
                  void act(async () => {
                    if (flow && dirty)
                      throw new Error('작성 중인 내용을 저장한 뒤 플로우를 수락해 주세요.');
                    update(await window.workspace.acceptProposal(id, flow, workspace.root));
                  })
                }
                disabled={running || busy}
                onReject={(id, reason, feedbackId) => rejection(id, reason, feedbackId)}
                onRetry={(id) => {
                  const feedback = workspace.feedbacks?.find((f) => f.id === id);
                  if (feedback) void rejection(feedback.proposalId, feedback.reason, id, true);
                }}
                onRevise={(proposal, text) =>
                  void request(
                    `이전 제안 '${proposal.title}'을 수정해줘. 요청: ${text}`,
                    proposal.id,
                  )
                }
                onSource={select}
              />
            ) : (
              <div className="chat-messages">
                {workspace?.messages.length ? (
                  workspace.messages.map((message) => (
                    <div key={message.id} className={'chat-message message-' + message.role}>
                      <div className="message-author">
                        {message.role === 'assistant' ? (
                          <>
                            <Sparkles size={12} />
                            Docflow
                          </>
                        ) : (
                          '나'
                        )}
                      </div>
                      <div className="chat-prose">
                        <Markdown text={message.text} />
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="chat-empty">
                    <div className="assistant-symbol">
                      <Sparkles size={23} />
                    </div>
                    <h3>어떤 기획을 함께할까요?</h3>
                    <div className="suggestion-actions">
                      <button
                        disabled={!workspace}
                        onClick={() =>
                          preparePrompt('현재 프로젝트를 바탕으로 PRD 초안을 새 문서로 작성해줘.')
                        }
                      >
                        <FilePlus2 size={15} />
                        <span>새 기획서 작성</span>
                        <ChevronRight size={13} />
                      </button>
                      <button
                        disabled={!workspace}
                        onClick={() =>
                          preparePrompt('기존 문서에서 누락된 요구사항과 예외 처리를 제안해줘.')
                        }
                      >
                        <ListChecks size={15} />
                        <span>빠진 내용 검토</span>
                        <ChevronRight size={13} />
                      </button>
                      <button
                        disabled={!workspace}
                        onClick={() =>
                          void act(() =>
                            reviewDiagramRequest(
                              '관련 문서를 바탕으로 사용자 흐름을 다이어그램 문서로 만들어줘.',
                            ),
                          )
                        }
                      >
                        <GitBranch size={15} />
                        <span>사용자 흐름 정리</span>
                        <ChevronRight size={13} />
                      </button>
                    </div>
                  </div>
                )}
                {running && (
                  <div className="generation-progress">
                    <span className="spinner" />
                    {progress}
                  </div>
                )}
                <div ref={chatEnd} />
              </div>
            )}
            <div className="composer-area">
              {sentContext && (
                <details className="sent-context">
                  <summary>이번 요청의 원문 근거</summary>
                  <ContextSelection context={sentContext} />
                  {sentContext.sources.map((source) => (
                    <details key={source.id}>
                      <summary>{source.title}</summary>
                      <pre>{source.content}</pre>
                    </details>
                  ))}
                </details>
              )}
              {workspace && (
                <label className="idea-mode">
                  <input
                    type="checkbox"
                    checked={ideaMode}
                    disabled={running || flowRequestId !== undefined}
                    onChange={(e) => setIdeaMode(e.target.checked)}
                  />{' '}
                  문서 없이 아이디어 상담
                </label>
              )}
              {workspace && (
                <button className="context-chip" onClick={openContext}>
                  <Layers size={12} />
                  <span>{section ? section.title : doc?.title || '프로젝트'} · 맥락 확인</span>
                  <ChevronDown size={12} />
                </button>
              )}
              {workspace && (
                <button
                  className="button analysis-chip"
                  disabled={running || busy || flowEditing}
                  onClick={() => {
                    setAnalysisInstruction(prompt);
                    setAnalysisOpen(true);
                  }}
                >
                  프로젝트 전체 분석
                </button>
              )}
              <div className="composer">
                <textarea
                  ref={promptRef}
                  aria-label="AI에게 요청"
                  placeholder={
                    workspace
                      ? '아이디어를 적거나 문서 보완을 요청하세요…'
                      : '프로젝트를 먼저 열어 주세요'
                  }
                  disabled={!workspace || running}
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  onKeyDown={(e) => {
                    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                      e.preventDefault();
                      void request();
                    }
                  }}
                />
                <div className="composer-footer">
                  <button
                    className="provider-name"
                    aria-label="AI 연결 설정"
                    title="AI 연결 설정"
                    disabled={running || busy}
                    onClick={() => setConnectionSetup(true)}
                  >
                    <span className={'status-dot ' + (!status.connected ? 'offline' : '')} />
                    <span>
                      {preferences.model ||
                        (preferences.provider === 'claude'
                          ? 'Claude 모델 선택'
                          : 'Codex 기본 모델')}
                    </span>
                    <ChevronDown size={12} />
                  </button>
                  {running ? (
                    <button
                      className="send-button stopping"
                      title="요청 취소"
                      aria-label="요청 취소"
                      onClick={() => void window.workspace.cancelRequest()}
                    >
                      <Square size={13} fill="currentColor" />
                    </button>
                  ) : (
                    <button
                      className="send-button"
                      title="요청 보내기"
                      aria-label="요청 보내기"
                      disabled={!workspace || !prompt.trim() || busy}
                      onClick={() => void request()}
                    >
                      <ArrowUp size={18} />
                    </button>
                  )}
                </div>
              </div>
              <div className="assistant-footer">
                <span>{status.detail}</span>
                <button
                  className="text-button"
                  aria-label="AI 사용량"
                  data-tooltip="이 프로젝트의 요청별 토큰과 제공자 계정 한도를 확인합니다. 조회 불가 사유와 마지막 확인 시각도 표시합니다."
                  disabled={!workspace}
                  onClick={() => setUsageOpen(true)}
                >
                  사용량
                </button>
                <button
                  className="icon-button"
                  title="AI 연결 확인"
                  aria-label="AI 연결 확인"
                  disabled={running}
                  onClick={() =>
                    void act(async () => setStatus(await window.workspace.providerStatus()))
                  }
                >
                  <RefreshCw size={11} />
                </button>
              </div>
            </div>
          </aside>
        )}
      </div>
      {analysisOpen && workspace && (
        <AnalysisDialog
          workspace={workspace}
          initialInstruction={analysisInstruction}
          initialExcluded={excluded}
          running={running}
          onError={setError}
          onClose={() => setAnalysisOpen(false)}
          onStart={async (id) => {
            if (dirty || flowEditing) throw new Error('작성 중인 내용을 저장한 뒤 분석해 주세요.');
            requestIdRef.current = await window.workspace.startAnalysis(id);
            setRunning(true);
            setProgress('프로젝트 분석 준비 중');
          }}
        />
      )}
      {modal !== 'none' && (
        <div
          className="modal-backdrop"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setModal('none');
          }}
        >
          <section
            className={'modal ' + (modal === 'context' ? 'context-modal' : '')}
            role="dialog"
            aria-modal="true"
            aria-label={
              modal === 'new'
                ? '새 문서'
                : modal === 'settings'
                  ? '프로젝트 설정'
                  : modal === 'relation'
                    ? '문서 연결'
                    : 'AI에 전달할 맥락'
            }
          >
            <div className="modal-heading">
              <h2>
                {modal === 'new'
                  ? '새 문서'
                  : modal === 'settings'
                    ? '프로젝트 설정'
                    : modal === 'relation'
                      ? '문서 연결'
                      : 'AI에 전달할 맥락'}
              </h2>
              <button className="icon-button" title="닫기" onClick={() => setModal('none')}>
                <X size={18} />
              </button>
            </div>
            {modal === 'new' && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!mayLeave()) return;
                  void act(async () => {
                    const next = await window.workspace.createDocument(title, docType);
                    update(next);
                    setDirty(false);
                    setSelectedId(next.documents.at(-1)!.id);
                    setView('document');
                    setBriefing(false);
                    setModal('none');
                  });
                }}
              >
                <label>
                  문서 이름
                  <input
                    autoFocus
                    required
                    maxLength={200}
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                  />
                </label>
                <label>
                  문서 유형
                  <select
                    value={docType}
                    onChange={(e) => setDocType(e.target.value as DocumentType)}
                  >
                    {Object.entries(typeLabels).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="modal-footer">
                  <button type="button" className="button" onClick={() => setModal('none')}>
                    취소
                  </button>
                  <button className="button primary" disabled={busy || !title.trim()}>
                    문서 만들기
                  </button>
                </div>
              </form>
            )}
            {modal === 'settings' && workspace && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void act(async () => {
                    update(await window.workspace.saveProject(projectName, goal, constraints));
                    setModal('none');
                  });
                }}
              >
                <label>
                  프로젝트 이름
                  <input
                    required
                    value={projectName}
                    onChange={(e) => setProjectName(e.target.value)}
                  />
                </label>
                <label>
                  목표
                  <textarea rows={3} value={goal} onChange={(e) => setGoal(e.target.value)} />
                </label>
                <label>
                  범위와 제약
                  <textarea
                    rows={3}
                    value={constraints}
                    onChange={(e) => setConstraints(e.target.value)}
                  />
                </label>
                <div className="decisions-list">
                  <h3>확정된 결정</h3>
                  {workspace.decisions.map((d) => (
                    <p key={d.id}>
                      <Check size={13} />
                      {d.text}
                    </p>
                  ))}
                </div>
                <div className="modal-footer">
                  <button className="button primary" disabled={busy}>
                    저장
                  </button>
                </div>
              </form>
            )}
            {modal === 'relation' && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void act(async () => {
                    update(
                      await window.workspace.connectDocuments(
                        relationSource,
                        relationTarget,
                        relationType,
                      ),
                    );
                    setModal('none');
                  });
                }}
              >
                <label>
                  기준 문서
                  <select
                    value={relationSource}
                    onChange={(e) => {
                      setRelationSource(e.target.value);
                      if (e.target.value === relationTarget)
                        setRelationTarget(docs.find((d) => d.id !== e.target.value)?.id || '');
                    }}
                  >
                    {docs.flatMap((d) => [
                      <option key={d.id} value={d.id}>
                        {d.title}
                      </option>,
                      ...d.sections.map((s) => (
                        <option key={s.id} value={s.id}>
                          {d.title} › {s.title}
                        </option>
                      )),
                    ])}
                  </select>
                </label>
                <label>
                  연결할 문서
                  <select
                    value={relationTarget}
                    onChange={(e) => setRelationTarget(e.target.value)}
                  >
                    {docs
                      .flatMap((d) => [
                        { id: d.id, title: d.title },
                        ...d.sections.map((s) => ({ id: s.id, title: `${d.title} › ${s.title}` })),
                      ])
                      .filter((item) => item.id !== relationSource)
                      .map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.title}
                        </option>
                      ))}
                  </select>
                </label>
                <label>
                  관계
                  <input
                    list="relation-types"
                    maxLength={80}
                    required
                    value={relationType}
                    onChange={(e) => setRelationType(e.target.value)}
                  />
                  <datalist id="relation-types">
                    {['참고', '구체화', '구현', '사용자 흐름', '근거'].map((t) => (
                      <option key={t} value={t} />
                    ))}
                  </datalist>
                </label>
                <div className="modal-footer">
                  <button
                    className="button primary"
                    disabled={
                      busy ||
                      !relationSource ||
                      !relationTarget ||
                      relationSource === relationTarget
                    }
                  >
                    연결 저장
                  </button>
                </div>
              </form>
            )}
            {modal === 'context' && context && (
              <div className="context-content">
                <div className="context-project">
                  <strong>{context.project.name}</strong>
                  <p>{context.project.goal || '프로젝트 목표가 아직 없습니다.'}</p>
                  <span>{context.project.constraints}</span>
                </div>
                {context.flowContext && (
                  <div className="flow-request-budget">
                    <strong>
                      {context.flowContext.baseFlow ? '유저플로우 수정' : '유저플로우 생성'} · 예상
                      입력 {(context.flowEstimate?.inputTokens || 0).toLocaleString()} 토큰 ·{' '}
                      {preferences.provider === 'claude'
                        ? '출력 상한 8,192 토큰'
                        : '출력은 Codex CLI 설정에 따름'}
                    </strong>
                    <p>
                      파일 크기와 모델에 따라 AI 사용량이 증가할 수 있습니다. 표시 값은 추정치이며
                      기존 플로우는 수락 전까지 변경하지 않습니다.
                    </p>
                    <textarea
                      aria-label="플로우 요청 내용"
                      value={prompt}
                      onChange={(event) => setPrompt(event.target.value)}
                    />
                  </div>
                )}
                <ContextSelection
                  context={context}
                  onExclude={(id) => {
                    const nextExcluded = [...new Set([...excluded, id])];
                    setExcluded(nextExcluded);
                    void act(async () =>
                      setContext(
                        await window.workspace.previewContext(
                          { ...contextInput(), excludedIds: nextExcluded },
                          pendingContextRequest?.replacesId,
                        ),
                      ),
                    );
                  }}
                />
                <h3>전달할 문서</h3>
                {docs.map((d) => {
                  const active =
                    !excluded.includes(d.id) && context.sources.some((s) => s.documentId === d.id);
                  return (
                    <label className="context-source" key={d.id}>
                      <input
                        type="checkbox"
                        checked={active}
                        onChange={(e) => {
                          const nextExcluded = e.target.checked
                            ? excluded.filter((id) => id !== d.id)
                            : [...excluded, d.id];
                          const nextIncluded = e.target.checked
                            ? [...included, d.id]
                            : included.filter((id) => id !== d.id);
                          setExcluded(nextExcluded);
                          setIncluded(nextIncluded);
                          void act(async () =>
                            setContext(
                              await window.workspace.previewContext(
                                {
                                  ...contextInput(),
                                  selectedIds: [
                                    ...new Set([...(doc ? [doc.id] : []), ...nextIncluded]),
                                  ],
                                  excludedIds: nextExcluded,
                                  mode: 'documents',
                                },
                                pendingContextRequest?.replacesId,
                              ),
                            ),
                          );
                        }}
                      />
                      <FileText size={14} />
                      <span>{d.title}</span>
                      <small>{d.markdown.length.toLocaleString()}자</small>
                    </label>
                  );
                })}
                <div className="context-summary">
                  <span>확정된 결정 {context.decisions.length}개</span>
                  <span>수락·거절 이력 {context.proposalHistory.length}개</span>
                  <span>제외 {context.omittedIds.length}개</span>
                </div>
                <details className="context-preview">
                  <summary>확정된 결정과 처리 이력·기존 연결</summary>
                  <pre>
                    {JSON.stringify(
                      {
                        decisions: context.decisions,
                        proposalHistory: context.proposalHistory,
                        relations: context.relations,
                        omittedRelationCount: context.omittedRelationCount,
                      },
                      null,
                      2,
                    )}
                  </pre>
                </details>
                {context.sources.map((s) => (
                  <details className="context-preview" key={s.id}>
                    <summary>
                      {s.title}
                      <span>{s.revision.slice(0, 8)}</span>
                    </summary>
                    <pre>{s.content}</pre>
                  </details>
                ))}
                <div className="modal-footer">
                  {(context.flowContext || pendingContextRequest) && (
                    <button
                      className="button primary"
                      disabled={
                        busy ||
                        running ||
                        !prompt.trim() ||
                        (!!context.requiresEvidence && !context.sources.length)
                      }
                      onClick={() => {
                        void request(
                          prompt,
                          pendingContextRequest?.replacesId,
                          context.instruction ===
                            contextInput(
                              section ? prompt + '\n현재 집중 섹션: ' + section.title : prompt,
                            ).instruction
                            ? context.id
                            : undefined,
                        );
                      }}
                    >
                      {context.flowContext ? '검토한 맥락으로 플로우 요청' : '검토한 근거로 요청'}
                    </button>
                  )}
                  <button className="button" onClick={() => setModal('none')}>
                    확인
                  </button>
                </div>
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
