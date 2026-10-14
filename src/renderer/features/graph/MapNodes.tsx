import { Handle, Position, type Node, type NodeProps } from '@xyflow/react';
import type { MapNode } from '../../../shared/project-map';
export type MapFlowNode = Node<{ node: MapNode; collapsed: boolean; onToggle: () => void }, 'map'>;
export function MapNodeCard({ data }: NodeProps<MapFlowNode>) {
  const n = data.node;
  return (
    <div className={`map-card map-${n.kind}`}>
      <small>
        {n.kind === 'root'
          ? '프로젝트'
          : n.kind === 'document'
            ? '문서'
            : n.kind === 'topic'
              ? 'AI 요약 주제'
              : `H${n.level || 1} · 소제목`}
      </small>
      <strong title={n.title}>{n.title}</strong>
      {n.kind === 'document' && (
        <button
          className="nodrag nopan text-button"
          aria-label={data.collapsed ? '소제목 펼치기' : '소제목 접기'}
          onClick={(e) => {
            e.stopPropagation();
            data.onToggle();
          }}
        >
          {data.collapsed ? '소제목 펼치기' : '소제목 접기'}
        </button>
      )}
      <Handle type="target" position={Position.Left} id="left" isConnectable={n.kind !== 'root'} />
      <Handle
        type="source"
        position={Position.Right}
        id="right"
        isConnectable={n.kind !== 'root'}
      />
    </div>
  );
}
