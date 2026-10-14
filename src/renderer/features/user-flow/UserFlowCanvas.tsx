import { useEffect, useMemo, useState } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MarkerType,
  BaseEdge,
  getSmoothStepPath,
  type EdgeProps,
  type NodeChange,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import type { Document } from '../../../shared/contracts';
import { projectUserFlow, type UserFlow, type FlowEvidence } from '../../../shared/user-flow';
import { UserFlowNodeCard, type SemanticFlowNode } from './UserFlowNodes';
import type { FlowLayout } from './layout';

const nodeTypes = { semantic: UserFlowNodeCard };
function FlowEdge(props: EdgeProps) {
  const points = props.data?.points as Array<{ x: number; y: number }> | undefined;
  const [fallback, labelX, labelY] = getSmoothStepPath(props);
  const path = points?.length
    ? points.map((point, index) => `${index ? 'L' : 'M'} ${point.x} ${point.y}`).join(' ')
    : fallback;
  const longest = points
    ?.slice(1)
    .map((point, index) => ({
      x: (point.x + points[index].x) / 2,
      y: (point.y + points[index].y) / 2,
      length: Math.abs(point.x - points[index].x) + Math.abs(point.y - points[index].y),
    }))
    .sort((a, b) => b.length - a.length)[0];
  return (
    <BaseEdge
      id={props.id}
      path={path}
      markerEnd={props.markerEnd}
      label={props.label}
      labelX={longest?.x ?? labelX}
      labelY={longest?.y ?? labelY}
      labelBgPadding={[7, 4]}
      style={props.style}
    />
  );
}
const edgeTypes = { flow: FlowEdge };
export function UserFlowCanvas({
  flow,
  documents,
  paths,
  focusId,
  disabled,
  onChange,
  onEvidence,
}: {
  flow: UserFlow;
  documents: Document[];
  paths: FlowLayout['paths'];
  focusId?: string;
  disabled: boolean;
  onChange: (flow: UserFlow) => void;
  onEvidence: (evidence: FlowEvidence) => void;
}) {
  const [focus, setFocus] = useState(focusId || '');
  useEffect(() => setFocus(focusId || ''), [focusId]);
  const projected = useMemo(() => {
    const ancestors = new Set<string>();
    let node = flow.nodes.find((node) => node.id === focus);
    while (node?.parentId) {
      ancestors.add(node.parentId);
      node = flow.nodes.find((candidate) => candidate.id === node!.parentId);
    }
    return projectUserFlow({
      ...flow,
      nodes: flow.nodes.map((node) =>
        ancestors.has(node.id) ? { ...node, collapsed: false } : node,
      ),
    });
  }, [flow, focus]);
  const [moving, setMoving] = useState<Record<string, { x: number; y: number }>>({});
  const nodes: SemanticFlowNode[] = projected.nodes.map((node) => {
    const inputs =
      node.type === 'group' && node.collapsed
        ? [
            ...new Set(
              projected.edges
                .filter((edge) => edge.target === node.id)
                .map((edge) => edge.targetHandle),
            ),
          ]
        : ['in'];
    const outputs =
      node.type === 'group' && node.collapsed
        ? [
            ...new Map(
              projected.edges
                .filter((edge) => edge.source === node.id)
                .map((edge) => [edge.sourceHandle, { id: edge.sourceHandle, label: edge.label }]),
            ).values(),
          ]
        : node.type === 'condition'
          ? node.data.outputs || []
          : [{ id: 'out' }];
    return {
      id: node.id,
      type: 'semantic',
      parentId: node.parentId,
      extent: node.extent,
      position: moving[node.id] || node.position || { x: 0, y: 0 },
      style: {
        width: node.collapsed ? 250 : node.width || 250,
        height: node.collapsed ? 110 : node.height || 140,
      },
      selected: focus === node.id,
      draggable: !disabled,
      data: {
        node,
        documents,
        inputs,
        outputs,
        onEvidence,
        onToggle: () => {
          if (disabled) return;
          setFocus('');
          onChange({
            ...flow,
            nodes: flow.nodes.map((item) =>
              item.id === node.id ? { ...item, collapsed: !item.collapsed } : item,
            ),
          });
        },
      },
    };
  });
  const changes = (changes: NodeChange<SemanticFlowNode>[]) => {
    if (disabled) return;
    const selected = changes.find((change) => change.type === 'select' && change.selected);
    if (selected?.type === 'select') setFocus(selected.id);
    else if (
      changes.some((change) => change.type === 'select' && change.id === focus && !change.selected)
    )
      setFocus('');
    const positions = changes.filter((change) => change.type === 'position' && change.position);
    if (!positions.length) return;
    const next = { ...moving };
    for (const change of positions)
      if (change.type === 'position' && change.position) next[change.id] = change.position;
    setMoving(next);
    if (positions.some((change) => change.type === 'position' && change.dragging !== true)) {
      onChange({
        ...flow,
        nodes: flow.nodes.map((node) =>
          next[node.id] ? { ...node, position: next[node.id] } : node,
        ),
      });
      setMoving({});
    }
  };
  return (
    <div className="user-flow-canvas" aria-label="유저플로우 캔버스">
      <ReactFlow
        nodes={nodes}
        edges={projected.edges.map((edge) => {
          const original = flow.edges.find((original) => original.id === edge.id)!;
          const label =
            edge.label ||
            flow.nodes
              .find((node) => node.id === original.source)
              ?.data.outputs?.find((port) => port.id === original.sourceHandle)?.label;
          const intact =
            !Object.keys(moving).length &&
            !flow.nodes.some((node) => node.collapsed) &&
            edge.source === original.source &&
            edge.target === original.target;
          return {
            id: edge.id,
            source: edge.source,
            target: edge.target,
            sourceHandle: edge.sourceHandle,
            targetHandle: edge.targetHandle,
            label,
            type: 'flow',
            data: { points: intact ? paths[edge.id] : undefined },
            markerEnd: { type: MarkerType.ArrowClosed },
            style: { stroke: 'var(--muted)', strokeWidth: 1.6 },
          };
        })}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={changes}
        onNodeClick={(_event, node) => setFocus(node.id)}
        nodesConnectable={false}
        deleteKeyCode={null}
        fitView
        fitViewOptions={{ maxZoom: 1, padding: 0.16 }}
        minZoom={0.15}
        maxZoom={2}
      >
        <Background gap={24} color="#d9e1ec" />
        <Controls showInteractive={false} />
      </ReactFlow>
      {!flow.nodes.length && (
        <p className="user-flow-empty">
          JSON 편집에서 단계를 추가하거나 기존 Mermaid 흐름을 가져오세요.
        </p>
      )}
    </div>
  );
}
