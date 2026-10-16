import { useEffect, useRef, useState } from 'react';
import mermaid from 'mermaid';
import { AlertCircle, GitBranch, ZoomIn, ZoomOut, RotateCcw } from 'lucide-react';
import type { ProjectFlow } from '../../../shared/contracts';
import { flowSafetyError, parseSimpleFlow } from '../../../shared/flows';
import { SimpleFlowEditor } from './SimpleFlowEditor';
mermaid.initialize({
  startOnLoad: false,
  securityLevel: 'strict',
  maxTextSize: 50_000,
  maxEdges: 500,
  theme: 'base',
  themeVariables: {
    fontFamily: 'Apple SD Gothic Neo, Aptos, Malgun Gothic, sans-serif',
    fontSize: '16px',
    primaryColor: '#eaf1ff',
    primaryTextColor: '#1d2939',
    primaryBorderColor: '#155eef',
    lineColor: '#526581',
    secondaryColor: '#eef2f8',
    tertiaryColor: '#fff2d6',
  },
  flowchart: { htmlLabels: false, curve: 'linear', nodeSpacing: 42, rankSpacing: 64, padding: 18 },
});
const kinds = {
  flowchart: '흐름도',
  sequence: '시퀀스',
  state: '상태',
  er: 'ERD',
  unsupported: '원문 보기',
};
export function Diagram({
  flows,
  issues,
  staleIds,
  onSource,
  onGenerate,
  onRefresh,
  onSave,
  onDirty,
  onEditingChange,
}: {
  flows: ProjectFlow[];
  issues: string[];
  staleIds: string[];
  onSource: (flow: ProjectFlow) => void;
  onGenerate: () => void;
  onRefresh: () => Promise<void>;
  onSave: (flow: ProjectFlow, code: string) => Promise<ProjectFlow | undefined>;
  onDirty: (dirty: boolean) => void;
  onEditingChange: (editing: boolean) => void;
}) {
  const [chosen, setChosen] = useState('');
  const [search, setSearch] = useState('');
  const [svg, setSvg] = useState('');
  const [error, setError] = useState('');
  const [zoom, setZoom] = useState(1);
  const [editing, setEditing] = useState<ProjectFlow | null>(null);
  const [sourceOpen, setSourceOpen] = useState(false);
  const revisions = useRef(new Map<string, string>());
  const [sourceChanged, setSourceChanged] = useState(false);
  const candidates = flows.filter((flow) =>
    `${flow.documentTitle} ${flow.sectionTitle} ${flow.title} ${flow.path} ${kinds[flow.kind]}`
      .toLowerCase()
      .includes(search.toLowerCase()),
  );
  const block = candidates.find((flow) => flow.id === chosen) || candidates[0];
  const missingSelection = !!chosen && !flows.some((flow) => flow.id === chosen);
  useEffect(() => {
    if (!block) return;
    const previous = revisions.current.get(block.id);
    setSourceChanged(!!previous && previous !== block.sourceRevision);
    revisions.current.set(block.id, block.sourceRevision);
  }, [block?.id, block?.sourceRevision]);
  useEffect(() => {
    onEditingChange(!!editing);
  }, [editing, onEditingChange]);
  useEffect(
    () => () => {
      onEditingChange(false);
      onDirty(false);
    },
    [onEditingChange, onDirty],
  );
  useEffect(() => {
    let active = true;
    setError('');
    setSvg('');
    setZoom(1);
    if (!block) return;
    const unsafe = block.safetyError || flowSafetyError(block.code);
    if (unsafe) {
      setError(unsafe);
      return;
    }
    void mermaid
      .render('diagram-' + crypto.randomUUID(), block.code)
      .then((result) => {
        if (active) setSvg(result.svg);
      })
      .catch(() => {
        if (active)
          setError('다이어그램 문법 또는 렌더 한도를 확인해 주세요. 원문은 보존되어 있습니다.');
      });
    return () => {
      active = false;
    };
  }, [block?.id, block?.code, block?.safetyError]);
  return (
    <div className="diagram-view">
      <div className="view-heading">
        <div>
          <h1>문서 다이어그램</h1>
          <span>
            문서 안의 흐름도·시퀀스·상태·ERD를 탐색합니다. 사용자 시나리오는 유저플로우에서
            설계하세요.
          </span>
        </div>
        <button className="button compact" disabled={!!editing} onClick={onGenerate}>
          <GitBranch size={14} />
          AI로 생성
        </button>
      </div>
      <div className="project-flows-body">
        <aside className="flow-inventory" aria-label="문서 다이어그램 목록">
          <input
            aria-label="흐름 검색"
            placeholder="문서·섹션·형식 검색"
            disabled={!!editing}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <button
            className="text-button"
            disabled={!!editing}
            onClick={() => void onRefresh().catch((error) => setError((error as Error).message))}
          >
            흐름 새로고침
          </button>
          <small>
            {candidates.length}개 흐름 · {flows.length}개 전체
          </small>
          {candidates.map((flow) => (
            <button
              key={flow.id}
              className={'flow-inventory-item ' + (flow.id === block?.id ? 'active' : '')}
              aria-label={`흐름 선택: ${flow.title} · ${flow.path}:${flow.line}`}
              aria-pressed={flow.id === block?.id}
              disabled={!!editing}
              onClick={() => {
                setChosen(flow.id);
                setSourceOpen(false);
              }}
            >
              <strong>{flow.title}</strong>
              <span>
                {flow.documentTitle} / {flow.sectionTitle}
              </span>
              <small>
                {kinds[flow.kind]} · {flow.path}:{flow.line}
              </small>
            </button>
          ))}
          {issues.map((issue, index) => (
            <p className="flow-issue" key={index}>
              {issue}
            </p>
          ))}
        </aside>
        <section className="flow-detail">
          {editing ? (
            <SimpleFlowEditor
              key={editing.id}
              initial={parseSimpleFlow(editing.code)!}
              onDirty={onDirty}
              onCancel={() => setEditing(null)}
              onSave={async (code) => {
                const saved = await onSave(editing, code);
                setEditing(null);
                if (saved) setChosen(saved.id);
              }}
            />
          ) : block ? (
            <>
              <div className="diagram-toolbar">
                <div>
                  <strong>{block.title}</strong>
                  <small>
                    {kinds[block.kind]} · {block.path}:
                    {block.sourceKind === 'definition' ? 1 : block.line}
                  </small>
                </div>
                <div className="action-row">
                  <button
                    className="button compact"
                    disabled={!block.editable}
                    title={block.editReason}
                    onClick={() => setEditing(block)}
                  >
                    기본 흐름 편집
                  </button>
                  <button
                    className="icon-button"
                    title="축소"
                    onClick={() => setZoom((zoom) => Math.max(0.5, zoom - 0.2))}
                  >
                    <ZoomOut size={16} />
                  </button>
                  <button
                    className="icon-button"
                    title="확대"
                    onClick={() => setZoom((zoom) => Math.min(2, zoom + 0.2))}
                  >
                    <ZoomIn size={16} />
                  </button>
                  <button className="icon-button" title="배율 초기화" onClick={() => setZoom(1)}>
                    <RotateCcw size={14} />
                  </button>
                </div>
              </div>
              {missingSelection && (
                <p className="inline-warning">
                  선택한 흐름이 변경·삭제되어 현재 목록의 첫 흐름을 표시합니다.
                </p>
              )}
              {staleIds.includes(block.documentId) && (
                <p className="inline-warning">
                  근거 문서가 변경되었습니다. 흐름 갱신을 검토해 주세요.
                </p>
              )}
              {!block.editable && <p className="flow-readonly-hint">{block.editReason}</p>}
              {error ? (
                <div className="empty-state">
                  <AlertCircle size={28} />
                  <p>{error}</p>
                </div>
              ) : (
                <div className="diagram-scroll">
                  <div
                    className="diagram-canvas"
                    style={{
                      width: `${zoom * 100}%`,
                      height: `${zoom * 100}%`,
                      minWidth: zoom > 1 ? `${zoom * 100}%` : undefined,
                    }}
                    dangerouslySetInnerHTML={{ __html: svg }}
                  />
                </div>
              )}
              <div className="diagram-source">
                <span>
                  {block.path} ·{' '}
                  {block.sourceKind === 'definition' ? '정의 파일 원문' : `${block.line}행`}
                </span>
                <button
                  onClick={() =>
                    block.sourceKind === 'definition' ? setSourceOpen(true) : onSource(block)
                  }
                >
                  {block.sourceKind === 'definition' ? '정의 파일 원문 보기' : '원문 위치로 이동'}
                </button>
                {block.sourceKind === 'definition' && (
                  <button onClick={() => onSource(block)}>참조 문서로 이동</button>
                )}
              </div>
              <details
                className="flow-source-code"
                open={sourceOpen}
                onToggle={(event) => setSourceOpen(event.currentTarget.open)}
              >
                <summary>
                  원문 코드 · {block.sourceKind === 'definition' ? '읽기 전용' : '코드 블록'}
                </summary>
                <pre>{block.code}</pre>
              </details>
            </>
          ) : (
            <div className="empty-state">
              <GitBranch size={32} />
              <h3>{search ? '검색 결과가 없습니다' : '아직 문서 다이어그램이 없습니다'}</h3>
              <p>문서의 Mermaid 코드 또는 프로젝트 내부 정의 파일 링크를 추가하세요.</p>
              <button className="button" onClick={onGenerate}>
                사용자 흐름 생성
              </button>
            </div>
          )}
          {sourceChanged && (
            <p className="inline-warning">
              원문 문서가 변경되어 최신 버전을 표시합니다. 편집 전 내용을 확인해 주세요.
            </p>
          )}
        </section>
      </div>
    </div>
  );
}
