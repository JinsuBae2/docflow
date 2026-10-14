import { useEffect, useRef, useState } from 'react';
import type { Workspace } from '../../../shared/contracts';
import { parseSimpleFlow } from '../../../shared/flows';
import { parseUserFlow, type UserFlow, type FlowEvidence } from '../../../shared/user-flow';
import { UserFlowCanvas } from './UserFlowCanvas';
import type { FlowLayout } from './layout';
import { layoutUserFlow } from './layout';
import ELK from 'elkjs/lib/elk-api.js';

export function UserFlowWorkspace({
  workspace,
  onRefresh,
  onEvidence,
  onDirty,
  onEditingChange,
  focus,
}: {
  workspace: Workspace;
  onRefresh: () => Promise<void>;
  onEvidence: (evidence: FlowEvidence) => void;
  onDirty: (dirty: boolean) => void;
  onEditingChange: (editing: boolean) => void;
  focus?: { flowId: string; nodeId: string };
}) {
  const [chosen, setChosen] = useState(focus?.flowId || '');
  const [draft, setDraft] = useState<UserFlow | null>(null);
  const [error, setError] = useState('');
  const [importing, setImporting] = useState(false);
  const [dirty, setDirty] = useState(false);
  useEffect(() => {
    if (focus) setChosen(focus.flowId);
  }, [focus]);
  const flows = workspace.userFlows || [];
  const selected =
    flows.find((flow) => flow.id === chosen) ||
    (draft?.id === chosen ? draft : undefined) ||
    flows[0];
  const canLeave = () => !dirty || confirm('저장하지 않은 유저플로우 변경을 버릴까요?');
  const reportDirty = (dirty: boolean) => {
    setDirty(dirty);
    onDirty(dirty);
  };
  return (
    <div className="user-flow-workspace">
      <div className="view-heading">
        <div>
          <h1>유저플로우</h1>
          <span>화면 이동과 사용자 행동, 조건 분기를 문서 근거와 함께 탐색합니다.</span>
        </div>
        <button
          className="button compact"
          disabled={importing}
          onClick={() => {
            if (!canLeave()) return;
            const flow = parseUserFlow({
              schemaVersion: 1,
              id: crypto.randomUUID(),
              projectId: workspace.project.id,
              title: '새 유저플로우',
              revision: '',
              nodes: [],
              edges: [],
            });
            setDraft(flow);
            setChosen(flow.id);
          }}
        >
          새 유저플로우
        </button>
      </div>
      <div className="project-flows-body">
        <aside className="flow-inventory" aria-label="유저플로우 목록">
          {flows.map((flow) => (
            <button
              key={flow.id}
              className={`flow-inventory-item ${selected?.id === flow.id ? 'active' : ''}`}
              onClick={() => {
                if (canLeave()) {
                  setDraft(null);
                  setChosen(flow.id);
                }
              }}
            >
              <strong>{flow.title}</strong>
              <small>{flow.nodes.filter((node) => node.type !== 'group').length}개 단계</small>
            </button>
          ))}
          <label className="user-flow-import">
            Mermaid 가져오기
            <select
              aria-label="가져올 Mermaid 흐름"
              disabled={importing}
              value=""
              onChange={async (event) => {
                const source = workspace.flows.find((flow) => flow.id === event.target.value);
                if (!source || !canLeave()) return;
                setImporting(true);
                setError('');
                try {
                  const imported = await window.workspace.importUserFlow(
                    source.id,
                    source.sourceRevision,
                    workspace.root,
                  );
                  setDraft(imported);
                  setChosen(imported.id);
                  await onRefresh();
                } catch (error) {
                  setError((error as Error).message);
                } finally {
                  setImporting(false);
                }
              }}
            >
              <option value="">단순 flowchart 선택</option>
              {workspace.flows
                .filter((flow) => flow.sourceKind === 'markdown' && parseSimpleFlow(flow.code))
                .map((flow) => (
                  <option key={flow.id} value={flow.id}>
                    {flow.title}
                  </option>
                ))}
            </select>
          </label>
          <p className="flow-readonly-hint">
            가져오기는 별도 JSON을 생성합니다. 기존 Mermaid 원문은 유지됩니다.
          </p>
          {(workspace.userFlowIssues || []).map((issue) => (
            <p className="flow-issue" key={issue}>
              {issue}
            </p>
          ))}
          {error && <p role="alert">{error}</p>}
        </aside>
        <section className="flow-detail">
          {selected ? (
            <UserFlowEditor
              key={workspace.root + selected.id}
              initial={selected}
              workspace={workspace}
              focusId={focus?.flowId === selected.id ? focus.nodeId : undefined}
              onRefresh={onRefresh}
              onEvidence={onEvidence}
              onDirty={reportDirty}
              onEditingChange={onEditingChange}
            />
          ) : (
            <p className="empty-description">
              새 유저플로우를 작성하거나 문서의 단순 Mermaid 흐름을 가져오세요.
            </p>
          )}
        </section>
      </div>
    </div>
  );
}

function UserFlowEditor({
  initial,
  workspace,
  focusId,
  onRefresh,
  onEvidence,
  onDirty,
  onEditingChange,
}: {
  initial: UserFlow;
  workspace: Workspace;
  focusId?: string;
  onRefresh: () => Promise<void>;
  onEvidence: (evidence: FlowEvidence) => void;
  onDirty: (dirty: boolean) => void;
  onEditingChange: (editing: boolean) => void;
}) {
  const [flow, setFlow] = useState(initial);
  const [paths, setPaths] = useState<FlowLayout['paths']>({});
  const [saving, setSaving] = useState(false);
  const [arranging, setArranging] = useState(false);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(!initial.revision);
  const [text, setText] = useState(JSON.stringify(initial, null, 2));
  const dirty = useRef(!initial.revision);
  const canonical = useRef(initial);
  const sequence = useRef(0);
  const queue = useRef(Promise.resolve());
  const worker = useRef<Worker | null>(null);
  const callbacks = useRef({ onDirty, onEditingChange });
  callbacks.current = { onDirty, onEditingChange };
  useEffect(() => {
    callbacks.current.onEditingChange(editing);
  }, [editing]);
  useEffect(
    () => () => {
      worker.current?.terminate();
      callbacks.current.onDirty(false);
      callbacks.current.onEditingChange(false);
    },
    [],
  );
  useEffect(() => {
    if (!dirty.current && !editing && initial.revision !== canonical.current.revision) {
      canonical.current = initial;
      setFlow(initial);
      setPaths({});
    }
  }, [initial, editing]);
  const markDirty = () => {
    dirty.current = true;
    callbacks.current.onDirty(true);
  };
  const persist = (next: UserFlow) => {
    markDirty();
    setFlow(next);
    setSaving(true);
    const request = ++sequence.current;
    const operation = queue.current
      .catch(() => {})
      .then(async () => {
        const saved = await window.workspace.saveUserFlow(
          { ...next, revision: canonical.current.revision },
          canonical.current.revision || null,
          workspace.root,
        );
        canonical.current = saved;
        if (request === sequence.current) {
          setFlow(saved);
          dirty.current = false;
          callbacks.current.onDirty(false);
          setError('');
          await onRefresh();
        }
      });
    queue.current = operation;
    return operation
      .catch((error) => {
        if (request === sequence.current) setError((error as Error).message);
      })
      .finally(() => {
        if (request === sequence.current) setSaving(false);
      });
  };
  const layout = async (next: UserFlow, preservePositions: boolean): Promise<FlowLayout> => {
    const instance = new Worker(new URL('./layout.worker.ts', import.meta.url), {
      type: 'module',
    });
    worker.current = instance;
    const engine = new ELK({ workerFactory: () => instance });
    try {
      return await Promise.race([
        layoutUserFlow(next, engine, preservePositions),
        new Promise<never>((_resolve, reject) => {
          instance.onerror = () => reject(new Error('자동 정렬 Worker를 실행하지 못했습니다.'));
        }),
      ]);
    } finally {
      engine.terminateWorker();
      worker.current = null;
    }
  };
  const arrange = async (next: UserFlow, preservePositions = false) => {
    markDirty();
    setFlow(next);
    setArranging(true);
    setError('');
    try {
      const result = await layout(next, preservePositions);
      setPaths(result.paths);
      await persist(result.flow);
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setArranging(false);
    }
  };
  useEffect(() => {
    if (initial.nodes.some((node) => !node.position)) void arrange(initial, true);
    if (!initial.revision) callbacks.current.onDirty(true);
    // Initial layout is deliberately performed only once per opened flow.
  }, []);
  return (
    <>
      <div className="diagram-toolbar">
        <strong>{flow.title}</strong>
        <button
          className="button compact"
          disabled={saving || arranging || editing || !flow.nodes.length}
          onClick={() => {
            if (confirm('사용자 배치를 자동 정렬할까요?')) void arrange(flow);
          }}
        >
          자동 정렬
        </button>
        <button
          className="button compact"
          disabled={saving || arranging || editing}
          onClick={() => {
            setText(JSON.stringify(flow, null, 2));
            setEditing(true);
          }}
        >
          JSON 편집
        </button>
        <span role="status">
          {arranging ? '자동 정렬 중' : saving ? '저장 중' : dirty.current ? '저장 필요' : '저장됨'}
        </span>
      </div>
      {error && (
        <div role="alert" className="inline-warning">
          {error}
          <button
            className="text-button"
            disabled={saving || arranging || editing}
            onClick={() => void persist(flow)}
          >
            저장 재시도
          </button>
          <button
            className="text-button"
            disabled={saving || arranging}
            onClick={async () => {
              if (!confirm('저장하지 않은 변경을 버리고 최신 플로우를 불러올까요?')) return;
              dirty.current = false;
              setFlow(canonical.current);
              setPaths({});
              callbacks.current.onDirty(false);
              setEditing(false);
              setError('');
              await onRefresh();
            }}
          >
            최신 JSON 불러오기
          </button>
        </div>
      )}
      {editing ? (
        <div className="user-flow-json-editor">
          <label>
            플로우 JSON
            <textarea
              aria-label="유저플로우 JSON"
              spellCheck={false}
              value={text}
              onChange={(event) => {
                setText(event.target.value);
                markDirty();
              }}
            />
          </label>
          <p>
            노드 유형: group, startEnd, page, action, condition, system. 좌표가 없는 새 단계는 최초
            저장 시 자동 배치합니다.
          </p>
          <div className="action-row">
            <button
              className="button"
              disabled={saving || arranging}
              onClick={() => {
                setEditing(false);
                dirty.current =
                  JSON.stringify(flow) !== JSON.stringify(canonical.current) || !flow.revision;
                callbacks.current.onDirty(dirty.current);
              }}
            >
              JSON 편집 취소
            </button>
            <button
              className="button primary"
              disabled={saving || arranging}
              onClick={async () => {
                try {
                  const next = parseUserFlow(JSON.parse(text));
                  if (
                    next.id !== flow.id ||
                    next.projectId !== flow.projectId ||
                    next.revision !== flow.revision
                  )
                    throw new Error('플로우 ID·프로젝트·revision은 변경할 수 없습니다.');
                  setEditing(false);
                  if (next.nodes.some((node) => !node.position)) await arrange(next, true);
                  else {
                    setPaths({});
                    await persist(next);
                  }
                } catch (error) {
                  setError((error as Error).message);
                }
              }}
            >
              JSON 저장
            </button>
          </div>
        </div>
      ) : arranging ? (
        <div className="user-flow-canvas user-flow-layout-pending" role="status">
          최초 배치를 계산하고 있습니다…
        </div>
      ) : (
        <UserFlowCanvas
          flow={flow}
          documents={workspace.documents}
          paths={paths}
          focusId={focusId}
          disabled={saving || arranging}
          onEvidence={onEvidence}
          onChange={(next) => {
            setPaths({});
            void persist(next);
          }}
        />
      )}
    </>
  );
}
