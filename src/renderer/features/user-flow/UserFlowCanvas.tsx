import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MarkerType,
  BaseEdge,
  getSmoothStepPath,
  type EdgeProps,
  type NodeChange,
  type Viewport,
  type ReactFlowInstance,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import type { Document } from '../../../shared/contracts';
import { projectUserFlow, type UserFlow, type FlowEvidence } from '../../../shared/user-flow';
import { UserFlowNodeCard, type SemanticFlowNode } from './UserFlowNodes';
import type { FlowLayout } from './layout';
import type { FlowChanges } from '../../../shared/flow-proposal-preview';

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
  changes: diffChanges,
  documents,
  paths,
  focusId,
  disabled,
  onChange,
  onEvidence,
}: {
  flow: UserFlow;
  changes?: FlowChanges;
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
  const [viewport, setViewport] = useState<Viewport>();
  const canvas = useRef<HTMLDivElement>(null);
  const instance = useRef<Pick<ReactFlowInstance, 'getViewport'>>(null);
  const projectionKey = projected.nodes.map((node) => `${node.id}:${!!node.collapsed}`).join('|');
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
        change: diffChanges?.nodes[node.id],
        documents,
        inputs,
        outputs,
        onEvidence,
        onToggle: (button) => {
          if (disabled) return;
          const current = instance.current?.getViewport();
          const bounds = canvas.current?.getBoundingClientRect();
          if (current && bounds) {
            const box = button.getBoundingClientRect();
            const width = node.collapsed ? 250 : node.width || 250;
            const nextWidth = node.collapsed ? node.width || 250 : 250;
            // The header button follows the group's right edge as its width changes.
            const left = box.left + (nextWidth - width) * current.zoom;
            const right = left + box.width;
            const x = Math.max(bounds.left + 12 - left, 0) + Math.min(bounds.right - 12 - right, 0);
            const y =
              Math.max(bounds.top + 12 - box.top, 0) + Math.min(bounds.bottom - 72 - box.bottom, 0);
            if (x || y) setViewport({ ...current, x: current.x + x, y: current.y + y });
          }
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
    <div ref={canvas} className="user-flow-canvas" aria-label="유저플로우 캔버스">
      <ReactFlow
        key={projectionKey}
        onInit={(flowInstance) => {
          instance.current = flowInstance;
        }}
        viewport={viewport}
        onViewportChange={setViewport}
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
          const change = diffChanges?.edges[edge.id];
          const color =
            change?.status === 'added'
              ? '#18864b'
              : change?.status === 'deleted'
                ? '#c43e4b'
                : change?.status === 'modified'
                  ? '#b96a11'
                  : 'var(--muted)';
          return {
            id: edge.id,
            className: change ? `flow-edge-${change.status}` : undefined,
            animated: change?.status === 'added',
            source: edge.source,
            target: edge.target,
            sourceHandle: edge.sourceHandle,
            targetHandle: edge.targetHandle,
            label,
            type: 'flow',
            data: { points: intact ? paths[edge.id] : undefined },
            markerEnd: { type: MarkerType.ArrowClosed },
            style: {
              stroke: color,
              strokeWidth: change && change.status !== 'unchanged' ? 2.5 : 1.6,
              strokeDasharray: change?.status === 'deleted' ? '6 4' : undefined,
              opacity: change?.status === 'deleted' ? 0.5 : 1,
            },
          };
        })}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={changes}
        onNodeClick={(_event, node) => setFocus(node.id)}
        nodesConnectable={false}
        deleteKeyCode={null}
        fitView={!viewport}
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
