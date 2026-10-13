import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MarkerType,
  Handle,
  Position,
  BaseEdge,
  type EdgeProps,
} from '@xyflow/react';
import { layoutDocuments } from './layout';
import '@xyflow/react/dist/style.css';
import { ArrowUpRight, Link2, Unlink, Pencil, Sparkles } from 'lucide-react';
import type { Relation, Workspace } from '../../../shared/contracts';
const origins = {
  markdown: { label: '원문 링크', color: '#087f8c', dash: '3 3' },
  ai: { label: 'AI 수락', color: '#1763ef', dash: undefined },
  manual: { label: '직접 연결', color: '#526581', dash: undefined },
  stored: { label: '저장된 관계', color: '#526581', dash: undefined },
};
const originOf = (r: Relation) => origins[r.origin || 'stored'];
const labels = {
  overview: '개요',
  prd: 'PRD',
  feature: '기능 명세',
  flow: '사용자 흐름',
  design: '기술 설계',
  note: '일반 문서',
};
function DocumentNode({
  data,
}: {
  data: { title: string; type: keyof typeof labels; sections: number };
}) {
  return (
    <>
      <Handle type="target" position={Position.Top} aria-label={`${data.title} 연결 받기`} />
      <div className={'graph-node-content graph-type-' + data.type}>
        <span className={'type-label type-' + data.type}>{labels[data.type]}</span>
        <strong>{data.title}</strong>
        <span>
          {data.sections}개 섹션
          <ArrowUpRight size={14} />
        </span>
      </div>
      <Handle
        type="source"
        position={Position.Bottom}
        aria-label={`${data.title}에서 연결 시작`}
        title="다른 문서로 끌어 연결"
      />
    </>
  );
}
const nodeTypes = { document: DocumentNode };
function ProposedEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  label,
  data,
  markerEnd,
}: EdgeProps) {
  const lane = typeof data?.lane === 'number' ? data.lane : 220;
  const path = `M ${sourceX} ${sourceY} C ${sourceX + lane} ${sourceY + 40}, ${targetX + lane} ${targetY - 40}, ${targetX} ${targetY}`;
  const text = String(label || 'AI 제안');
  const short = text.length > 27 ? text.slice(0, 26) + '…' : text;
  const x = (sourceX + targetX) / 2 + lane * 0.75;
  const y = (sourceY + targetY) / 2;
  const width = Math.max(110, short.length * 10 + 18);
  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        markerEnd={markerEnd}
        style={{ stroke: '#1763ef', strokeWidth: 2, strokeDasharray: '7 5' }}
      />
      <g transform={`translate(${x}, ${y})`} pointerEvents="none">
        <title>{text}</title>
        <rect
          x={-width / 2}
          y={-14}
          width={width}
          height={28}
          rx={4}
          fill="#edf4ff"
          stroke="#c2d7ff"
        />
        <text
          textAnchor="middle"
          dominantBaseline="central"
          fill="#1451be"
          fontSize={12}
          fontWeight={650}
        >
          {short}
        </text>
      </g>
    </>
  );
}
const edgeTypes = { proposal: ProposedEdge };
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
  // Releasing a connection drag on a node also fires a click; ignore it so a dropped line does not navigate.
  const connecting = useRef(false);
  useEffect(() => {
    if (!selected) return;
    document
      .querySelector(`[data-relation-id="${CSS.escape(selected)}"]`)
      ?.scrollIntoView({ block: 'nearest' });
  }, [selected]);
  const owner = (id: string) =>
    workspace.documents.find((d) => d.id === id || d.sections.some((s) => s.id === id));
  const nodes = useMemo(() => {
    const positions = layoutDocuments(
      workspace.documents.map((d) => d.id),
      workspace.relations.flatMap((r) => {
        const from = owner(r.fromId);
        const to = owner(r.toId);
        return from && to ? [{ from: from.id, to: to.id }] : [];
      }),
    );
    return workspace.documents.map((doc) => ({
      id: doc.id,
      type: 'document',
      position: positions[doc.id],
      data: { title: doc.title, type: doc.type, sections: doc.sections.length },
      className: 'doc-node',
      ariaLabel: `${labels[doc.type]}: ${doc.title}`,
    }));
  }, [workspace.documents, workspace.relations]);
  const edges = workspace.relations.flatMap((r) => {
    const from = owner(r.fromId);
    const to = owner(r.toId);
    const origin = originOf(r);
    return from && to
      ? [
          {
            id: r.id,
            source: from.id,
            target: to.id,
            type: 'smoothstep',
            selected: r.id === selected,
            className: 'relation-edge origin-' + (r.origin || 'stored'),
            ariaLabel: `${origin.label}: ${from.title} → ${to.title} (${r.type})`,
            label: r.origin === 'markdown' ? '원문 링크' : r.type,
            markerEnd: { type: MarkerType.ArrowClosed, color: origin.color },
            style: {
              stroke: origin.color,
              strokeWidth: r.id === selected ? 3 : 1.7,
              strokeDasharray: origin.dash,
            },
            labelStyle: { fill: '#344054', fontSize: 12, fontWeight: 600 },
            labelBgPadding: [8, 5] as [number, number],
            labelBgStyle: { fill: '#ffffff' },
          },
        ]
      : [];
  });
  const pending = workspace.proposals
    .filter((p) => p.kind === 'relation' && p.status === 'pending' && p.relation)
    .flatMap((p) => {
      const r = p.relation!;
      return owner(r.fromId) && owner(r.toId)
        ? [
            {
              id: 'proposal-' + p.id,
              source: r.fromId,
              target: r.toId,
              type: 'proposal',
              label: 'AI 제안 · ' + r.relationType,
              data: { lane: r.fromId < r.toId ? 220 : -220 },
              markerEnd: { type: MarkerType.ArrowClosed, color: '#1763ef' },
            },
          ]
        : [];
    });
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
            문서 아래 연결점을 다른 문서로 끌어 연결하거나 연결 추가를 사용하세요.
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
      <div className="graph-canvas">
        <ReactFlow
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          nodes={nodes}
          edges={[...edges, ...pending]}
          fitView
          fitViewOptions={{ padding: 0.3, maxZoom: 1 }}
          nodesDraggable={false}
          nodesConnectable={!busy}
          isValidConnection={(c) => !!c.source && !!c.target && c.source !== c.target}
          onConnectStart={() => (connecting.current = true)}
          onConnectEnd={() => setTimeout(() => (connecting.current = false))}
          onConnect={(c) => c.source && c.target && onConnect(c.source, c.target)}
          deleteKeyCode={null}
          onEdgeClick={(_e, edge) => {
            if (workspace.relations.some((r) => r.id === edge.id)) setSelected(edge.id);
          }}
          onPaneClick={() => setSelected('')}
          onNodeClick={(_e, node) => !connecting.current && onSelect(node.id)}
          minZoom={0.2}
          maxZoom={2}
        >
          <Background color="#cad3df" gap={24} size={1} />
          <Controls showInteractive={false} />
        </ReactFlow>
      </div>
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
              <button onClick={() => onSelect(owner(r.fromId)?.id || '')}>
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
                  onClick={() => onSelect(owner(r.fromId)?.id || '')}
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
