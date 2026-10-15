import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MarkerType,
  applyNodeChanges,
  type NodeChange,
  type ReactFlowInstance,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import type { Workspace } from '../../../shared/contracts';
import { buildProjectMap, type MapView, type MapPosition } from '../../../shared/project-map';
import { layoutProjectMap } from './layout';
import { MapNodeCard, cardGeometry, type MapFlowNode } from './MapNodes';
import { MapLegend } from './MapLegend';
import { RoutedEdge } from './RoutedEdge';
import { retargetRoute, type Route, type RoutingInput } from './routing';
import { projectDocumentMap, resolveDocumentEndpoint } from '../../../shared/document-map';
const nodeTypes = { map: MapNodeCard };
const edgeTypes = { routed: RoutedEdge, proposal: RoutedEdge };
// A fresh prop object overwrites the node filter of queued fitView requests.
const fitViewOptions = { padding: 0.2, minZoom: 0.8, maxZoom: 1 };
export function MapCanvas({
  workspace,
  busy,
  onSelect,
  onConnect,
  onEdgeSelect,
  selectedEdge,
  selectedDocument,
  onDocumentSelect,
  toolbarActions,
}: {
  workspace: Workspace;
  busy: boolean;
  onSelect: (id: string) => void;
  onConnect: (a?: string, b?: string) => void;
  onEdgeSelect: (ids: string[]) => void;
  selectedEdge: string[];
  selectedDocument: string;
  onDocumentSelect: (id: string) => void;
  toolbarActions: ReactNode;
}) {
  const key = `docflow-map-unsaved:${workspace.project.id}`;
  const [view, setView] = useState<MapView>(() => {
    try {
      const cached = JSON.parse(localStorage.getItem(key) || 'null');
      if (cached?.positions) return cached;
    } catch {
      /* Retain server view if local recovery is invalid. */
    }
    return workspace.mapView || { positions: [], collapsedDocumentIds: [], legendCollapsed: false };
  });
  const [nodes, setNodes] = useState<MapFlowNode[]>([]);
  const [expandedIds, setExpandedIds] = useState<string[]>([]);
  const [focusId, setFocusId] = useState('');
  const focusOffsets = useRef<Record<string, { x: number; y: number }>>({});
  const flow = useRef<Pick<ReactFlowInstance<MapFlowNode>, 'fitView'> | null>(null);
  const [routes, setRoutes] = useState<Record<string, Route>>({});
  const [routing, setRouting] = useState(false);
  const [routeError, setRouteError] = useState('');
  const routingVersion = useRef(0);
  const latestRouting = useRef('');
  const worker = useRef<Worker | null>(null);
  useEffect(() => {
    const instance = new Worker(new URL('./routing.worker.ts', import.meta.url), {
      type: 'module',
    });
    worker.current = instance;
    instance.onmessage = (
      event: MessageEvent<{ version: number; routes: Route[]; done: boolean; error?: string }>,
    ) => {
      if (event.data.version !== routingVersion.current) return;
      setRoutes((current) => ({
        ...current,
        ...Object.fromEntries(event.data.routes.map((r) => [r.id, r])),
      }));
      if (event.data.done) {
        setRouting(false);
        setRouteError(event.data.error || '');
      }
    };
    instance.onerror = () => {
      setRouting(false);
      setRouteError('경로 계산을 완료하지 못했습니다.');
    };
    return () => {
      instance.terminate();
      worker.current = null;
    };
  }, []);
  const [query, setQuery] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const dirty = useRef(!!localStorage.getItem(key));
  const dragging = useRef(false);
  const lastDrag = useRef(0);
  const connecting = useRef(false);
  const saveSequence = useRef(0);
  const saveQueue = useRef<Promise<void>>(Promise.resolve());
  const map = useMemo(() => buildProjectMap({ ...workspace, mapView: view }), [workspace, view]);
  useEffect(() => {
    if (!dirty.current && !dragging.current && workspace.mapView) {
      setView((current) =>
        (workspace.mapView!.version || 0) >= (current.version || 0) ? workspace.mapView! : current,
      );
    }
  }, [workspace.mapView]);
  useEffect(() => {
    const guard = (event: BeforeUnloadEvent) => {
      if (dirty.current) {
        event.preventDefault();
        event.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', guard);
    return () => window.removeEventListener('beforeunload', guard);
  }, []);
  const persist = (requested: MapView) => {
    const next: MapView =
      requested.layoutVersion === 2
        ? requested
        : {
            ...requested,
            layoutVersion: 2,
            positions: Object.entries(fullPositions).map(([nodeId, position]) => ({
              nodeId,
              ...position,
            })),
          };
    const sequence = ++saveSequence.current;
    dirty.current = true;
    localStorage.setItem(key, JSON.stringify(next));
    setView(next);
    setSaving(true);
    const operation = saveQueue.current
      .catch(() => {})
      .then(async () => {
        await window.workspace.saveMapLayout(
          map.projectId,
          next.positions.filter((position) =>
            map.nodes.some((node) => node.kind === 'document' && node.id === position.nodeId),
          ),
        );
        const saved = await window.workspace.saveMapView(map.projectId, {
          collapsedDocumentIds: next.collapsedDocumentIds.filter((id) =>
            map.nodes.some((node) => node.kind === 'document' && node.id === id),
          ),
          legendCollapsed: next.legendCollapsed,
        });
        if (sequence === saveSequence.current) {
          setView({
            positions: saved.positions,
            collapsedDocumentIds: saved.collapsedDocumentIds,
            legendCollapsed: saved.legendCollapsed,
            version: saved.version,
            layoutVersion: saved.layoutVersion,
          });
          dirty.current = false;
          localStorage.removeItem(key);
          setError('');
        }
      });
    saveQueue.current = operation;
    return operation
      .catch((error) => {
        if (sequence === saveSequence.current) setError((error as Error).message);
      })
      .finally(() => {
        if (sequence === saveSequence.current) setSaving(false);
      });
  };
  const savePositions = (positions: MapPosition[]) =>
    persist({ ...view, layoutVersion: 2, positions });
  const saveView = (patch: Partial<MapView>) => persist({ ...view, ...patch });
  const toggle = (id: string) =>
    void saveView({
      collapsedDocumentIds: view.collapsedDocumentIds.includes(id)
        ? view.collapsedDocumentIds.filter((x) => x !== id)
        : [...view.collapsedDocumentIds, id],
    });
  const projected = useMemo(
    () =>
      projectDocumentMap(map, {
        focusId,
        detailId: selectedDocument,
        detailEdgeIds: selectedEdge,
        expandedIds,
        query,
      }),
    [map, focusId, selectedDocument, selectedEdge, expandedIds, query],
  );
  const sizes = useMemo(
    () => Object.fromEntries(projected.cards.map((c) => [c.node.id, cardGeometry(c)])),
    [projected],
  );
  const fullSizes = useMemo(
    () =>
      Object.fromEntries(
        projectDocumentMap(map, { expandedIds }).cards.map((c) => [c.node.id, cardGeometry(c)]),
      ),
    [map, expandedIds],
  );
  const fullPositions = useMemo(() => layoutProjectMap(map, fullSizes), [map, fullSizes]);
  useEffect(() => {
    const positions = focusId
      ? layoutProjectMap(
          { ...map, nodes: projected.cards.map((c) => c.node), positions: [] },
          sizes,
        )
      : fullPositions;
    setNodes((current) =>
      projected.cards.map((card) => {
        const old = current.find((n) => n.id === card.node.id);
        const geometry = cardGeometry(card);
        let position = positions[card.node.id];
        if (focusId) {
          const full = fullPositions[card.node.id];
          const offset = (focusOffsets.current[card.node.id] ||= {
            x: position.x - full.x,
            y: position.y - full.y,
          });
          position = { x: full.x + offset.x, y: full.y + offset.y };
        }
        return {
          ...old,
          id: card.node.id,
          type: 'map',
          className: 'document-map-node',
          ...geometry,
          style: { width: geometry.width, height: geometry.height },
          position: dragging.current && old ? old.position : position,
          data: {
            card,
            expanded: expandedIds.includes(card.node.id),
            onToggle: () => toggle(card.node.id),
            onExpand: () =>
              setExpandedIds((ids) =>
                ids.includes(card.node.id)
                  ? ids.filter((id) => id !== card.node.id)
                  : [...ids, card.node.id],
              ),
            onOpen: onSelect,
            onFocus: () => {
              onDocumentSelect(card.node.id);
              focusOffsets.current = {};
              setFocusId(card.node.id);
            },
          },
        };
      }),
    );
  }, [map, projected, sizes, fullPositions]); // Rebuild callbacks with the current view; never reflow during dragging.
  useEffect(() => {
    if (!focusId) return;
    const frame = requestAnimationFrame(
      () =>
        void flow.current?.fitView({
          nodes: [{ id: focusId }],
          ...fitViewOptions,
        }),
    );
    return () => cancelAnimationFrame(frame);
  }, [focusId, nodes.length]);
  const geometry = nodes.map((node) => ({
    id: node.id,
    ...node.position,
    width: node.width!,
    height: node.height!,
  }));
  const anchor = (id: string, handleId: string) => {
    const node = nodes.find((n) => n.id === id);
    const handle = node?.handles?.find((h) => h.id === handleId);
    return node && handle
      ? { x: node.position.x + handle.x, y: node.position.y + handle.y }
      : undefined;
  };
  const routingEdges: RoutingInput['edges'] = [];
  const edges = projected.edges.flatMap((e) => {
    const start = anchor(e.source, e.sourceHandle),
      end = anchor(e.target, e.targetHandle);
    if (!start || !end) return [];
    const pending = e.members[0].status === 'pending';
    const color = pending ? '#1763ef' : '#526581';
    const label = pending ? `AI 제안 · ${e.label}` : e.label;
    routingEdges.push({ id: e.id, fromId: e.source, toId: e.target, start, end, label });
    return [
      {
        id: e.id,
        source: e.source,
        target: e.target,
        sourceHandle: e.sourceHandle,
        targetHandle: e.targetHandle,
        type: pending ? 'proposal' : 'routed',
        data: {
          route:
            routes[e.id] &&
            retargetRoute(routes[e.id], e.source, e.target, geometry, { start, end }),
          members: e.members,
        },
        selected: e.members.some((m) => selectedEdge.includes(m.id)),
        label,
        className: pending ? 'map-pending-edge' : '',
        style: { stroke: color, strokeDasharray: pending ? '6 4' : undefined, strokeWidth: 1.8 },
        markerEnd: { type: MarkerType.ArrowClosed, color },
        labelStyle: { fontSize: 12 },
        labelBgStyle: { fill: 'var(--surface, #fff)' },
        ariaLabel: `${pending ? 'AI 제안: ' : ''}${e.label}`,
      },
    ];
  });
  const routingSignature = JSON.stringify({ nodes: geometry, edges: routingEdges });
  latestRouting.current = routingSignature;
  useEffect(() => {
    let sent = '';
    const timer = setInterval(() => {
      if (latestRouting.current === sent) return;
      sent = latestRouting.current;
      const version = ++routingVersion.current;
      setRouting(true);
      setRouteError('');
      worker.current?.postMessage({ ...JSON.parse(sent), version } satisfies RoutingInput);
    }, 100);
    return () => clearInterval(timer);
  }, []);
  const failed = edges.filter((e) => !e.data.route || e.data.route.status !== 'ready').length;
  const missingLabels = edges.filter(
    (e) => e.label && routes[e.id]?.status === 'ready' && !routes[e.id]?.labelPosition,
  ).length;
  const persistedPosition = (id: string, position: { x: number; y: number }) => {
    const offset = focusId ? focusOffsets.current[id] : undefined;
    return { nodeId: id, x: position.x - (offset?.x || 0), y: position.y - (offset?.y || 0) };
  };
  const changes = (changes: NodeChange<MapFlowNode>[]) => {
    setNodes((current) => applyNodeChanges(changes, current));
    const keyboardPositions = changes.filter(
      (change) => change.type === 'position' && change.position && !dragging.current,
    );
    if (keyboardPositions.length) {
      const positions = new Map(
        Object.entries(fullPositions).map(([id, p]) => [id, { nodeId: id, ...p }]),
      );
      if (!focusId)
        for (const node of nodes) positions.set(node.id, { nodeId: node.id, ...node.position });
      for (const change of keyboardPositions) {
        if (change.type === 'position' && change.position) {
          positions.set(change.id, persistedPosition(change.id, change.position));
        }
      }
      void savePositions([...positions.values()]);
    }
  };
  return (
    <>
      <div className="map-toolbar">
        <h1>문서 구조</h1>
        <small>{projected.cards.length}개 문서</small>
        {toolbarActions}
        {focusId && (
          <button
            className="button compact"
            onClick={() => {
              setFocusId('');
              onDocumentSelect('');
              onEdgeSelect([]);
            }}
          >
            전체 보기
          </button>
        )}
        <input
          aria-label="지도 검색"
          placeholder="문서·소제목 검색"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button
          className="button compact"
          disabled={saving || !!focusId}
          onClick={() => {
            if (!window.confirm('사용자 배치를 자동 정렬로 바꿀까요?')) return;
            const p = layoutProjectMap({ ...map, positions: [] }, fullSizes);
            void savePositions(Object.entries(p).map(([nodeId, p]) => ({ nodeId, ...p })));
          }}
        >
          자동 정렬
        </button>
        <small aria-live="polite">
          {saving ? '위치 저장 중' : dirty.current ? '미저장 위치 있음' : '위치 자동 저장'}
        </small>
        <small role="status">
          {routing
            ? '연결 정리 중'
            : failed || routeError
              ? '일부 연결은 곡선으로 표시 중'
              : missingLabels
                ? '연결 이름은 상세 목록에서 확인'
                : ''}
        </small>
        {error && (
          <span role="alert">
            {error} <button onClick={() => void savePositions(view.positions)}>저장 재시도</button>
          </span>
        )}
      </div>
      <div className="graph-canvas">
        <ReactFlow
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          nodes={nodes}
          edges={edges}
          onNodesChange={changes}
          onInit={(instance) => {
            flow.current = instance;
          }}
          defaultViewport={{ x: 80, y: 96, zoom: 1 }}
          fitViewOptions={fitViewOptions}
          nodesConnectable={!busy}
          isValidConnection={(c) =>
            !!c.source &&
            !!c.target &&
            resolveDocumentEndpoint(projected.cards, c.source, c.sourceHandle) !==
              resolveDocumentEndpoint(projected.cards, c.target, c.targetHandle)
          }
          onConnectStart={() => {
            connecting.current = true;
          }}
          onConnectEnd={() =>
            setTimeout(() => {
              connecting.current = false;
            }, 100)
          }
          onConnect={(c) => {
            if (c.source && c.target)
              onConnect(
                resolveDocumentEndpoint(projected.cards, c.source, c.sourceHandle),
                resolveDocumentEndpoint(projected.cards, c.target, c.targetHandle),
              );
          }}
          onNodeDragStart={() => {
            dragging.current = true;
          }}
          onNodeDragStop={(_e, n) => {
            const positions = new Map(
              Object.entries(fullPositions).map(([id, p]) => [id, { nodeId: id, ...p }]),
            );
            for (const node of focusId ? [] : nodes) {
              positions.set(node.id, { nodeId: node.id, ...node.position });
            }
            positions.set(n.id, persistedPosition(n.id, n.position));
            void savePositions([...positions.values()]);
            dragging.current = false;
            lastDrag.current = Date.now();
          }}
          onNodeClick={(_e, n) =>
            !connecting.current &&
            !dragging.current &&
            Date.now() - lastDrag.current > 100 &&
            onDocumentSelect(n.id)
          }
          onEdgeClick={(_e, e) => onEdgeSelect(e.data?.members.map((m) => m.id) || [])}
          onPaneClick={() => onEdgeSelect([])}
          deleteKeyCode={null}
          minZoom={0.8}
          maxZoom={2}
        >
          <Background gap={24} color="#cad3df" />
          <Controls showInteractive={false} />
        </ReactFlow>
        <MapLegend
          collapsed={view.legendCollapsed}
          onToggle={() => void saveView({ legendCollapsed: !view.legendCollapsed })}
        />
      </div>
    </>
  );
}
