import { useState } from 'react';
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
  const [selected, setSelected] = useState<string[]>([]);
  const [selectedDocument, setSelectedDocument] = useState('');
  const [detailsOpen, setDetailsOpen] = useState(false);
  const owner = (id: string) =>
    workspace.documents.find((d) => d.id === id || d.sections.some((s) => s.id === id));
  const pending = workspace.proposals.filter(
    (p) => p.kind === 'relation' && p.status === 'pending',
  );
  return (
    <div className="graph-view">
      <MapCanvas
        key={workspace.project.id}
        workspace={workspace}
        busy={busy}
        onSelect={onSelect}
        onConnect={onConnect}
        toolbarActions={
          <div className="action-row">
            <button
              className="button compact"
              data-tooltip="검토할 문서와 전송 맥락을 확인합니다. AI 연결 제안은 수락하기 전까지 반영하지 않습니다."
              disabled={busy || workspace.documents.length < 2}
              onClick={onReview}
            >
              <Sparkles size={14} />
              AI로 연결 검토
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
        }
        onEdgeSelect={(ids) => {
          setSelected(ids);
          setSelectedDocument('');
          if (ids.length) setDetailsOpen(true);
        }}
        selectedEdge={selected}
        selectedDocument={selectedDocument}
        onDocumentSelect={(id) => {
          setSelectedDocument(id);
          setSelected([]);
          setDetailsOpen(!!id);
        }}
      />
      <details
        className="relations-list"
        open={detailsOpen}
        onToggle={(event) => setDetailsOpen(event.currentTarget.open)}
      >
        <summary>
          문서 연결 · {workspace.relations.length}개
          {pending.length > 0 && (
            <small>파란 점선은 AI 제안입니다. 오른쪽 제안에서 검토하세요.</small>
          )}
        </summary>
        {(selected.length > 0 || selectedDocument) && (
          <button
            className="text-button"
            onClick={() => {
              setSelected([]);
              setSelectedDocument('');
            }}
          >
            모든 연결 보기
          </button>
        )}
        {workspace.relations.length ? (
          workspace.relations
            .filter((r) =>
              selected.length
                ? selected.includes(r.id)
                : selectedDocument
                  ? owner(r.fromId)?.id === selectedDocument ||
                    owner(r.toId)?.id === selectedDocument
                  : true,
            )
            .map((r) => (
              <div
                className={'relation-row' + (selected.includes(r.id) ? ' selected' : '')}
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
                <small>
                  {
                    workspace.documents.flatMap((d) => d.sections).find((s) => s.id === r.fromId)
                      ?.title
                  }
                </small>
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
                  <span>→ {r.type} →</span>
                )}
                <button onClick={() => onSelect(r.toId)}>
                  {owner(r.toId)?.title || '연결 확인 필요'}
                </button>
                <small>
                  {
                    workspace.documents.flatMap((d) => d.sections).find((s) => s.id === r.toId)
                      ?.title
                  }
                </small>
                {r.linkId && (
                  <small className="relation-evidence">
                    {workspace.documentLinks.find((link) => link.id === r.linkId)?.href}
                  </small>
                )}
                {r.origin === 'ai' && (
                  <small className="relation-evidence">
                    {
                      workspace.proposals.find(
                        (p) =>
                          p.status === 'accepted' &&
                          p.relation?.fromId === r.fromId &&
                          p.relation?.toId === r.toId &&
                          p.relation?.relationType === r.type,
                      )?.reason
                    }
                  </small>
                )}
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
        {pending
          .filter((p) =>
            selected.length
              ? selected.includes(`proposal-${p.id}`)
              : selectedDocument
                ? owner(p.relation?.fromId || '')?.id === selectedDocument ||
                  owner(p.relation?.toId || '')?.id === selectedDocument
                : true,
          )
          .map((p) => {
            const relation = p.relation!;
            const endpointTitle = (id: string) => {
              const doc = owner(id);
              const section = doc?.sections.find((s) => s.id === id);
              return `${doc?.title || '연결 확인 필요'}${section ? ` / ${section.title}` : ''}`;
            };
            return (
              <div className="pending-relation-detail" key={p.id}>
                <span className="map-pending-badge">AI 제안</span>{' '}
                <button onClick={() => onSelect(relation.fromId)}>
                  {endpointTitle(relation.fromId)}
                </button>
                <span> → {relation.relationType} → </span>
                <button onClick={() => onSelect(relation.toId)}>
                  {endpointTitle(relation.toId)}
                </button>
                <p>{p.reason}</p>
                {p.sourceIds.map((id) => {
                  const range = p.sourceRanges?.find((r) => r.id === id);
                  const doc = owner(range?.documentId || id);
                  return (
                    doc && (
                      <button
                        className="text-button"
                        key={id}
                        onClick={() => onSelect(range?.documentId || id)}
                      >
                        근거 원문: {doc.title}
                        {range ? ` (${range.start}–${range.end})` : ''}
                      </button>
                    )
                  );
                })}
              </div>
            );
          })}
      </details>
    </div>
  );
}
