import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MarkerType,
  applyNodeChanges,
  type NodeChange,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import type { Workspace } from '../../../shared/contracts';
import { buildProjectMap, type MapView, type MapPosition } from '../../../shared/project-map';
import { layoutProjectMap } from './layout';
import { MapNodeCard, type MapFlowNode } from './MapNodes';
import { MapLegend } from './MapLegend';
import { RoutedEdge } from './RoutedEdge';
import { retargetRoute, type Route, type RoutingInput } from './routing';
const nodeTypes = { map: MapNodeCard };
const edgeTypes = { routed: RoutedEdge, proposal: RoutedEdge };
export function MapCanvas({
  workspace,
  busy,
  onSelect,
  onConnect,
  onEdgeSelect,
  selectedEdge,
}: {
  workspace: Workspace;
  busy: boolean;
  onSelect: (id: string) => void;
  onConnect: (a?: string, b?: string) => void;
  onEdgeSelect: (id: string) => void;
  selectedEdge: string;
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
  const [sizes, setSizes] = useState<Record<string, { width: number; height: number }>>({});
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
  const persist = (next: MapView) => {
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
            map.nodes.some((node) => node.id === position.nodeId),
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
  const savePositions = (positions: MapPosition[]) => persist({ ...view, positions });
  const saveView = (patch: Partial<MapView>) => persist({ ...view, ...patch });
  const toggle = (id: string) =>
    void saveView({
      collapsedDocumentIds: view.collapsedDocumentIds.includes(id)
        ? view.collapsedDocumentIds.filter((x) => x !== id)
        : [...view.collapsedDocumentIds, id],
    });
  useEffect(() => {
    const positions = layoutProjectMap(map, sizes);
    setNodes((current) =>
      map.nodes
        .filter((n) => positions[n.id])
        .map((n) => {
          const old = current.find((x) => x.id === n.id);
          return {
            ...old,
            id: n.id,
            type: 'map',
            className: 'doc-node',
            position: dragging.current && old ? old.position : positions[n.id],
            data: {
              node: n,
              collapsed: view.collapsedDocumentIds.includes(n.id),
              onToggle: () => toggle(n.id),
            },
          };
        }),
    );
  }, [map, sizes]); // Node callbacks are rebuilt with the current view.
  const shown = nodes.filter(
    (n) =>
      n.data.node.kind === 'root' ||
      !query ||
      n.data.node.title.toLowerCase().includes(query.toLowerCase()) ||
      map.nodes.some(
        (s) => s.documentId === n.id && s.title.toLowerCase().includes(query.toLowerCase()),
      ),
  );
  const shownIds = new Set(shown.map((n) => n.id));
  const endpoint = (id: string) =>
    shownIds.has(id)
      ? id
      : map.nodes.find((n) => n.id === id && view.collapsedDocumentIds.includes(n.documentId || ''))
          ?.documentId;
  const geometry = shown.map((node) => ({
    id: node.id,
    ...node.position,
    width: sizes[node.id]?.width || 230,
    height: sizes[node.id]?.height || 82,
  }));
  const edges = map.edges.flatMap((e) => {
    const source = endpoint(e.fromId),
      target = endpoint(e.toId);
    if (!source || !target || !shownIds.has(source) || !shownIds.has(target) || source === target)
      return [];
    const pending = e.status === 'pending';
    const color = pending ? '#1763ef' : e.kind === 'structure' ? '#97a7bb' : '#526581';
    return [
      {
        id: e.id,
        source,
        target,
        sourceHandle: 'right',
        targetHandle: 'left',
        type: pending ? 'proposal' : 'routed',
        data: { route: routes[e.id] && retargetRoute(routes[e.id], source, target, geometry) },
        selected: selectedEdge === e.id,
        label: pending ? `AI 제안 · ${e.label}` : e.label,
        className: pending ? 'map-pending-edge' : '',
        style: {
          stroke: color,
          strokeDasharray: e.kind === 'semantic' ? '6 4' : undefined,
          strokeWidth: e.kind === 'semantic' ? 1.8 : 1.2,
        },
        markerEnd: e.kind === 'semantic' ? { type: MarkerType.ArrowClosed, color } : undefined,
        labelStyle: { fontSize: 12 },
        labelBgStyle: { fill: '#fff' },
        ariaLabel: e.kind === 'structure' ? '문서 구조' : `${pending ? 'AI 제안: ' : ''}${e.label}`,
      },
    ];
  });
  const routingSignature = JSON.stringify({
    nodes: geometry,
    edges: edges.map((e) => ({ id: e.id, fromId: e.source, toId: e.target, label: e.label })),
  });
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
  const failed = Object.values(routes).filter((r) => r.status !== 'ready').length;
  const missingLabels = edges.filter(
    (e) => e.label && routes[e.id]?.status === 'ready' && !routes[e.id]?.labelPosition,
  ).length;
  const changes = (changes: NodeChange<MapFlowNode>[]) => {
    setNodes((current) => applyNodeChanges(changes, current));
    const keyboardPositions = changes.filter(
      (change) => change.type === 'position' && change.position && !dragging.current,
    );
    if (keyboardPositions.length) {
      const positions = new Map(view.positions.map((position) => [position.nodeId, position]));
      for (const node of nodes) positions.set(node.id, { nodeId: node.id, ...node.position });
      for (const change of keyboardPositions) {
        if (change.type === 'position' && change.position) {
          positions.set(change.id, { nodeId: change.id, ...change.position });
        }
      }
      void savePositions([...positions.values()]);
    }
    const measured = changes.filter((c) => c.type === 'dimensions' && c.dimensions);
    if (measured.length)
      setSizes((current) => {
        const next = { ...current };
        let changed = false;
        for (const c of measured)
          if (
            c.type === 'dimensions' &&
            c.dimensions &&
            (current[c.id]?.width !== c.dimensions.width ||
              current[c.id]?.height !== c.dimensions.height)
          ) {
            next[c.id] = c.dimensions;
            changed = true;
          }
        return changed ? next : current;
      });
  };
  return (
    <>
      <div className="map-toolbar">
        <input
          aria-label="지도 검색"
          placeholder="문서·소제목 검색"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button
          className="button compact"
          disabled={saving}
          onClick={() => {
            if (!window.confirm('사용자 배치를 자동 정렬로 바꿀까요?')) return;
            const p = layoutProjectMap({ ...map, positions: [], collapsedDocumentIds: [] }, sizes);
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
            ? '선 경로 계산 중'
            : failed
              ? `경로 계산 보류 ${failed}개 · 겹친 카드를 이동해 주세요`
              : missingLabels
                ? `관계 이름 ${missingLabels}개는 아래 목록에서 확인하세요`
                : routeError}
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
          nodes={shown}
          edges={edges}
          onNodesChange={changes}
          fitView
          fitViewOptions={{ padding: 0.12, maxZoom: 1 }}
          nodesConnectable={!busy}
          isValidConnection={(c) =>
            !!c.source &&
            !!c.target &&
            c.source !== c.target &&
            !c.source.startsWith('root:') &&
            !c.target.startsWith('root:')
          }
          onConnectStart={() => {
            connecting.current = true;
          }}
          onConnectEnd={() =>
            setTimeout(() => {
              connecting.current = false;
            }, 100)
          }
          onConnect={(c) => c.source && c.target && onConnect(c.source, c.target)}
          onNodeDragStart={() => {
            dragging.current = true;
          }}
          onNodeDragStop={(_e, n) => {
            const positions = new Map(view.positions.map((p) => [p.nodeId, p]));
            for (const node of nodes) {
              positions.set(node.id, { nodeId: node.id, ...node.position });
            }
            positions.set(n.id, { nodeId: n.id, ...n.position });
            void savePositions([...positions.values()]);
            dragging.current = false;
            lastDrag.current = Date.now();
          }}
          onNodeClick={(_e, n) =>
            !connecting.current &&
            !dragging.current &&
            Date.now() - lastDrag.current > 100 &&
            onSelect(n.id)
          }
          onEdgeClick={(_e, e) => onEdgeSelect(e.id)}
          onPaneClick={() => onEdgeSelect('')}
          deleteKeyCode={null}
          minZoom={0.1}
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
