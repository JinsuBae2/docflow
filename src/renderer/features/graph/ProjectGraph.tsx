import { useEffect, useState } from 'react';
import { MapCanvas } from './MapCanvas';
import { Link2, Unlink, Pencil, Sparkles } from 'lucide-react';
import type { Relation, Workspace } from '../../../shared/contracts';
const origins = {
  markdown: { label: '원문 링크', color: '#087f8c', dash: '3 3' },
  ai: { label: 'AI 수락', color: '#1763ef', dash: undefined },
  manual: { label: '직접 연결', color: '#526581', dash: undefined },
  stored: { label: '저장된 관계', color: '#526581', dash: undefined },
};
const originOf = (r: Relation) => origins[r.origin || 'stored'];
export function ProjectGraph({
  workspace,
  onSelect,
  onConnect,
  onRemove,
  onReview,
  onEdit,
  busy,
}: {
  workspace: Workspace;
  onSelect: (id: string) => void;
  onConnect: (fromId?: string, toId?: string) => void;
  onRemove: (id: string) => void;
  onReview: () => void;
  onEdit: (id: string, type: string) => Promise<void>;
  busy: boolean;
}) {
  const [editing, setEditing] = useState('');
  const [relationType, setRelationType] = useState('');
  const [selected, setSelected] = useState('');
  useEffect(() => {
    if (!selected) return;
    document
      .querySelector(`[data-relation-id="${CSS.escape(selected)}"]`)
      ?.scrollIntoView({ block: 'nearest' });
  }, [selected]);
  const owner = (id: string) =>
    workspace.documents.find((d) => d.id === id || d.sections.some((s) => s.id === id));
  const pending = workspace.proposals.filter(
    (p) => p.kind === 'relation' && p.status === 'pending',
  );
  return (
    <div className="graph-view">
      <div className="view-heading">
        <div>
          <h1>문서 관계 지도</h1>
          <span>
            {workspace.documents.length}개 문서 · {workspace.relations.length}개 연결
            {pending.length > 0 && ` · AI 검토 대기 ${pending.length}개`}
          </span>
          <span className="graph-hint">
            카드를 옮겨 배치하고 오른쪽 연결점을 다른 문서·소제목으로 끌어 연결하세요.
          </span>
        </div>
        <div className="action-row">
          <button
            className="button compact"
            data-tooltip="검토할 문서와 전송 맥락을 확인합니다. AI 연결 제안은 수락하기 전까지 반영하지 않습니다."
            disabled={busy || workspace.documents.length < 2}
            onClick={onReview}
          >
            <Sparkles size={14} />
            AI로 관계 검토
          </button>
          <button
            className="button compact"
            disabled={busy || workspace.documents.length < 2}
            onClick={() => onConnect()}
          >
            <Link2 size={14} />
            연결 추가
          </button>
        </div>
      </div>
      <MapCanvas
        key={workspace.project.id}
        workspace={workspace}
        busy={busy}
        onSelect={onSelect}
        onConnect={onConnect}
        onEdgeSelect={setSelected}
        selectedEdge={selected}
      />
      <div className="relations-list">
        <h3>
          문서 연결
          {pending.length > 0 && (
            <small>파란 점선은 AI 제안입니다. 오른쪽 제안에서 검토하세요.</small>
          )}
        </h3>
        {workspace.relations.length ? (
          workspace.relations.map((r) => (
            <div
              className={'relation-row' + (r.id === selected ? ' selected' : '')}
              data-relation-id={r.id}
              data-origin={r.origin || 'stored'}
              key={r.id}
            >
              <small className={'relation-origin origin-' + (r.origin || 'stored')}>
                {originOf(r).label}
              </small>
              <button onClick={() => onSelect(r.fromId)}>
                {owner(r.fromId)?.title || '연결 확인 필요'}
              </button>
              {editing === r.id ? (
                <div className="relation-type-editor">
                  <input
                    aria-label="관계 유형"
                    maxLength={80}
                    value={relationType}
                    onChange={(e) => setRelationType(e.target.value)}
                  />
                  <button
                    className="button compact"
                    disabled={!relationType.trim()}
                    onClick={() =>
                      void onEdit(r.id, relationType.trim())
                        .then(() => setEditing(''))
                        .catch(() => {})
                    }
                  >
                    유형 저장
                  </button>
                  <button className="text-button" onClick={() => setEditing('')}>
                    취소
                  </button>
                </div>
              ) : (
                <span>{r.type}</span>
              )}
              <button onClick={() => onSelect(r.toId)}>
                {owner(r.toId)?.title || '연결 확인 필요'}
              </button>
              {r.origin === 'markdown' ? (
                <button
                  className="text-button relation-source-link"
                  data-tooltip="원문 링크는 문서 본문에서 수정·제거합니다. 여기서는 해제할 수 없습니다."
                  onClick={() => onSelect(r.fromId)}
                >
                  원문 열기
                </button>
              ) : (
                <>
                  <button
                    className="icon-button"
                    aria-label="관계 유형 수정"
                    data-tooltip="이 연결의 유형을 직접 수정합니다. 연결된 문서와 방향은 유지됩니다."
                    onClick={() => {
                      setEditing(r.id);
                      setRelationType(r.type);
                    }}
                  >
                    <Pencil size={13} />
                  </button>
                  <button
                    className="icon-button"
                    title="연결 해제"
                    aria-label="연결 해제"
                    onClick={() => onRemove(r.id)}
                  >
                    <Unlink size={13} />
                  </button>
                </>
              )}
            </div>
          ))
        ) : (
          <p className="muted">등록된 연결이 없습니다.</p>
        )}
      </div>
    </div>
  );
}
