import { useMemo } from 'react';
import { ReactFlow, Background, Controls, MarkerType, Handle, Position } from '@xyflow/react';
import { layoutDocuments } from './layout';
import '@xyflow/react/dist/style.css';
import { ArrowUpRight, Link2, Unlink } from 'lucide-react';
import type { Workspace } from '../../../shared/contracts';
const labels = { overview: '개요', prd: 'PRD', feature: '기능 명세', flow: '사용자 흐름', design: '기술 설계', note: '일반 문서' };
function DocumentNode({ data }: { data: { title: string; type: keyof typeof labels; sections: number } }) {
  return <><Handle type="target" position={Position.Top} /><div className={'graph-node-content graph-type-' + data.type}><span className={'type-label type-' + data.type}>{labels[data.type]}</span><strong>{data.title}</strong><span>{data.sections}개 섹션<ArrowUpRight size={14} /></span></div><Handle type="source" position={Position.Bottom} /></>;
}
const nodeTypes = { document: DocumentNode };
export function ProjectGraph({ workspace, onSelect, onConnect, onRemove }: { workspace: Workspace; onSelect: (id: string) => void; onConnect: () => void; onRemove: (id: string) => void }) {
  const owner = (id: string) => workspace.documents.find(d => d.id === id || d.sections.some(s => s.id === id));
  const nodes = useMemo(() => {
    const positions = layoutDocuments(workspace.documents.map(d => d.id), workspace.relations.flatMap(r => { const from = owner(r.fromId); const to = owner(r.toId); return from && to ? [{ from: from.id, to: to.id }] : []; }));
    return workspace.documents.map(doc => ({ id: doc.id, type: 'document', position: positions[doc.id], data: { title: doc.title, type: doc.type, sections: doc.sections.length }, className: 'doc-node', ariaLabel: `${labels[doc.type]}: ${doc.title}` }));
  }, [workspace.documents, workspace.relations]);
  const edges = workspace.relations.flatMap(r => { const from = owner(r.fromId); const to = owner(r.toId); return from && to ? [{ id: r.id, source: from.id, target: to.id, type: 'smoothstep', label: r.type, markerEnd: { type: MarkerType.ArrowClosed, color: '#526581' }, style: { stroke: '#526581', strokeWidth: 1.7 }, labelStyle: { fill: '#344054', fontSize: 12, fontWeight: 600 }, labelBgPadding: [8, 5] as [number, number], labelBgStyle: { fill: '#ffffff' } }] : []; });
  return <div className="graph-view"><div className="view-heading"><div><h1>문서 관계 지도</h1><span>{workspace.documents.length}개 문서 · {workspace.relations.length}개 연결</span></div><button className="button compact" onClick={onConnect}><Link2 size={14} />연결 추가</button></div>
    <div className="graph-canvas"><ReactFlow nodeTypes={nodeTypes} nodes={nodes} edges={edges} fitView fitViewOptions={{ padding: 0.18, maxZoom: 1 }} nodesDraggable={false} nodesConnectable={false} onNodeClick={(_e, node) => onSelect(node.id)} minZoom={0.2} maxZoom={2}><Background color="#cad3df" gap={24} size={1} /><Controls showInteractive={false} /></ReactFlow></div>
    <div className="relations-list"><h3>문서 연결</h3>{workspace.relations.length ? workspace.relations.map(r => <div className="relation-row" key={r.id}><button onClick={() => onSelect(owner(r.fromId)?.id || '')}>{owner(r.fromId)?.title || '연결 확인 필요'}</button><span>{r.type}</span><button onClick={() => onSelect(owner(r.toId)?.id || '')}>{owner(r.toId)?.title || '연결 확인 필요'}</button><button className="icon-button" title="연결 해제" aria-label="연결 해제" onClick={() => onRemove(r.id)}><Unlink size={13} /></button></div>) : <p className="muted">등록된 연결이 없습니다.</p>}</div>
  </div>;
}
