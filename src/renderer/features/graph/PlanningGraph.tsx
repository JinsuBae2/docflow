import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import cytoscape, { type Core, type ElementDefinition } from 'cytoscape';
import { Maximize2, Minus, Plus } from 'lucide-react';
import type { Workspace } from '../../../shared/contracts';
import {
  extractPlanningItems,
  groupPlanningDocuments,
  planningCategory,
} from '../../../shared/planning-items';
import { planningPositions } from './planning-layout';
import { PlanningDetail } from './PlanningDetail';
import { usePlanningRoutes } from './usePlanningRoutes';

interface PlanningNode {
  id: string;
  kind: 'root' | 'document' | 'item';
  label: string;
  title: string;
  color: string;
  width: number;
  height: number;
  position: { x: number; y: number };
  documentId?: string;
  itemId?: string;
}

export function PlanningGraph({
  workspace,
  onSelect,
  toolbarActions,
}: {
  workspace: Workspace;
  onSelect: (id: string) => void;
  toolbarActions: ReactNode;
}) {
  const [planning, setPlanning] = useState(true),
    [group, setGroup] = useState(true);
  const [expanded, setExpanded] = useState(''),
    [page, setPage] = useState(0),
    [selected, setSelected] = useState('');
  const [viewport, setViewport] = useState({ x: 24, y: 28, zoom: 0.9 });
  const [size, setSize] = useState({ width: 0, height: 0 });
  const hits = useRef(new Map<string, HTMLButtonElement>());
  const stage = useRef<HTMLDivElement>(null);
  const host = useRef<HTMLDivElement>(null),
    cy = useRef<Core | null>(null),
    initialized = useRef(false);
  const documents = useMemo(
    () =>
      groupPlanningDocuments(workspace.documents, group).filter(
        (item) => !planning || planningCategory(item.document).core,
      ),
    [workspace.documents, group, planning],
  );
  const document = documents.find((item) => item.document.id === expanded)?.document;
  const extracted = useMemo(
    () => new Map(documents.map((item) => [item.document.id, extractPlanningItems(item.document)])),
    [documents],
  );
  const allItems = document ? extracted.get(document.id)! : [];
  const effectivePage = Math.min(page, Math.max(0, Math.ceil(allItems.length / 8) - 1));
  const items = allItems.slice(effectivePage * 8, effectivePage * 8 + 8);
  const selectedItem = items.find((item) => item.id === selected);
  const toggle = (id: string) => {
    setExpanded((current) => (current === id ? '' : id));
    setPage(0);
    setSelected('');
  };
  const nodes = useMemo<PlanningNode[]>(() => {
    const itemSlice = document
      ? extracted.get(document.id)!.slice(effectivePage * 8, effectivePage * 8 + 8)
      : [];
    const positions = planningPositions(
      documents.map((item) => `doc:${item.document.id}`),
      itemSlice.map((item) => `item:${item.id}`),
      document ? `doc:${document.id}` : undefined,
    );
    return [
      {
        id: 'project',
        kind: 'root',
        label: `프로젝트 기획\n${workspace.project.name.length > 32 ? workspace.project.name.slice(0, 32) + '…' : workspace.project.name}`,
        title: workspace.project.name,
        color: '#155eef',
        width: 170,
        height: 110,
        position: positions.project,
      },
      ...documents.map(({ document: doc, members }) => ({
        id: `doc:${doc.id}`,
        kind: 'document' as const,
        documentId: doc.id,
        label: `${planningCategory(doc).label}\n${doc.title.length > 24 ? doc.title.slice(0, 24) + '…' : doc.title}\n${extracted.get(doc.id)!.length}개 항목 · ${doc.id === document?.id ? '접기 −' : '펼치기 +'}${members.length > 1 ? ` · ${members.length}개 묶음` : ''}`,
        title: doc.title,
        color: planningCategory(doc).color,
        width: 190,
        height: 90,
        position: positions[`doc:${doc.id}`],
      })),
      ...itemSlice.map((item) => ({
        id: `item:${item.id}`,
        kind: 'item' as const,
        itemId: item.id,
        label: `${item.label || '문서 항목'}\n${item.title.length > 48 ? item.title.slice(0, 48) + '…' : item.title}`,
        title: `${item.label} ${item.title}`,
        color: planningCategory(document!).color,
        width: 260,
        height: 100,
        position: positions[`item:${item.id}`],
      })),
    ];
  }, [documents, document, effectivePage, workspace.project.name, extracted]);
  const edges = useMemo(
    () => [
      ...documents.map(({ document: doc }) => ({
        id: `root:${doc.id}`,
        fromId: 'project',
        toId: `doc:${doc.id}`,
      })),
      ...nodes
        .filter((node) => node.kind === 'item')
        .map((node) => ({ id: `edge:${node.id}`, fromId: `doc:${document!.id}`, toId: node.id })),
    ],
    [documents, nodes, document],
  );
  const routing = useMemo(
    () => ({
      nodes: nodes.map((node) => ({
        id: node.id,
        x: node.position.x - node.width / 2,
        y: node.position.y - node.height / 2,
        width: node.width,
        height: node.height,
      })),
      edges: edges.map((edge) => {
        const source = nodes.find((node) => node.id === edge.fromId)!,
          target = nodes.find((node) => node.id === edge.toId)!;
        const siblings = edges.filter((item) => item.fromId === edge.fromId);
        const offset =
          (siblings.findIndex((item) => item.id === edge.id) - (siblings.length - 1) / 2) *
          Math.min(10, 68 / Math.max(1, siblings.length - 1));
        return {
          ...edge,
          start: { x: source.position.x + source.width / 2, y: source.position.y + offset },
          end: { x: target.position.x - target.width / 2, y: target.position.y },
        };
      }),
    }),
    [nodes, edges],
  );
  const routes = usePlanningRoutes(routing);
  useLayoutEffect(() => {
    const element = host.current!;
    const instance = cytoscape({
      container: element,
      elements: [],
      layout: { name: 'preset' },
      minZoom: 0.35,
      maxZoom: 1.8,
      wheelSensitivity: 0.15,
      boxSelectionEnabled: false,
      style: [
        {
          selector: 'node',
          style: {
            shape: 'round-rectangle',
            width: 'data(width)',
            height: 'data(height)',
            label: 'data(label)',
            'font-family': 'Aptos, Apple SD Gothic Neo, Malgun Gothic, sans-serif',
            'font-size': 14,
            'text-wrap': 'wrap',
            'text-max-width': '175px',
            'text-valign': 'center',
            'text-halign': 'center',
            'line-height': 1.65,
            color: '#252c31',
            'background-color': 'data(color)',
            'background-opacity': 0.12,
            'border-color': '#e0e6ef',
            'border-width': 1,
          },
        },
        {
          selector: 'node[kind="root"]',
          style: {
            'text-max-width': '155px',
            'border-color': '#155eef',
            'background-opacity': 0.18,
          },
        },
        {
          selector: 'node[kind="item"]',
          style: { 'text-max-width': '235px', 'background-opacity': 0.07 },
        },
        {
          selector: '.planning-selected',
          style: { 'border-color': '#155eef', 'border-width': 3, 'background-opacity': 0.23 },
        },
      ],
    });
    cy.current = instance;
    instance.on('pan zoom', () =>
      setViewport({ x: instance.pan().x, y: instance.pan().y, zoom: instance.zoom() }),
    );
    instance.on('tap', (event) => {
      if (event.target === instance) setSelected('');
    });
    const observer = new ResizeObserver(() => {
      instance.resize();
      setSize({ width: element.clientWidth, height: element.clientHeight });
      if (!initialized.current && element.clientWidth) {
        instance.viewport({
          zoom: Math.max(0.8, Math.min(1, (element.clientWidth - 48) / 930)),
          pan: { x: 24, y: 28 },
        });
        initialized.current = true;
      }
    });
    observer.observe(element);
    return () => {
      observer.disconnect();
      instance.destroy();
      cy.current = null;
      initialized.current = false;
    };
  }, []);
  useEffect(() => {
    const instance = cy.current;
    if (!instance) return;
    const camera = { zoom: instance.zoom(), pan: instance.pan() };
    instance.elements().remove();
    instance.add(
      nodes.map((node) => ({
        data: node,
        position: node.position,
        locked: true,
        classes:
          node.id === `doc:${expanded}` || node.id === `item:${selected}`
            ? 'planning-selected'
            : '',
      })) as ElementDefinition[],
    );
    instance.viewport(camera);
  }, [nodes, expanded, selected]);
  useEffect(() => {
    setSelected('');
  }, [document?.revision]);
  const closeDetail = () => {
    const button = hits.current.get(`item:${selected}`);
    setSelected('');
    button?.focus({ preventScroll: true });
  };
  const revealNode = (node: PlanningNode) => {
    const instance = cy.current,
      element = stage.current;
    if (!instance || !element) return;
    element.scrollTop = 0;
    element.scrollLeft = 0;
    const zoom = instance.zoom(),
      pan = instance.pan(),
      pad = 12;
    const left = (node.position.x - node.width / 2) * zoom + pan.x,
      top = (node.position.y - node.height / 2) * zoom + pan.y;
    const right = left + node.width * zoom,
      bottom = top + node.height * zoom;
    const dx =
      left < pad
        ? pad - left
        : right > element.clientWidth - pad
          ? element.clientWidth - pad - right
          : 0;
    const dy =
      top < pad
        ? pad - top
        : bottom > element.clientHeight - pad
          ? element.clientHeight - pad - bottom
          : 0;
    if (dx || dy) instance.pan({ x: pan.x + dx, y: pan.y + dy });
  };
  const active = nodes.find((node) => node.id === `item:${selected}`);
  return (
    <section className="planning-view">
      <div className="map-toolbar">
        <h1>문서 구조</h1>
        <label>
          <input
            type="checkbox"
            checked={planning}
            onChange={(event) => {
              setPlanning(event.target.checked);
              setSelected('');
            }}
          />
          기획·설계 문서만
        </label>
        <label>
          <input
            type="checkbox"
            checked={group}
            onChange={(event) => {
              setGroup(event.target.checked);
              setSelected('');
            }}
          />
          같은 본문 묶기
        </label>
        {toolbarActions}
      </div>
      <div className="planning-controls">
        <label>
          펼칠 문서{' '}
          <select
            aria-label="펼칠 문서"
            value={document?.id || ''}
            onChange={(event) => {
              setExpanded(event.target.value);
              setPage(0);
              setSelected('');
            }}
          >
            <option value="">문서 카드 선택</option>
            {documents.map(({ document: doc }) => (
              <option key={doc.id} value={doc.id}>
                {doc.title}
              </option>
            ))}
          </select>
        </label>
        <button
          className="button compact"
          disabled={!document}
          onClick={() => {
            setExpanded('');
            setSelected('');
          }}
        >
          접기
        </button>
        <small>실선: 문서·항목 구성 · {documents.length}개 문서 · 원문 순서</small>
      </div>
      <div className="planning-stage" ref={stage}>
        <div
          className="planning-canvas"
          ref={host}
          role="img"
          aria-label={`프로젝트 기획, ${documents.length}개 문서, ${items.length}개 항목 카드`}
        />
        <svg className="planning-routes" aria-hidden="true">
          <g transform={`translate(${viewport.x},${viewport.y}) scale(${viewport.zoom})`}>
            {routing.edges.map((edge) => {
              const route = routes[edge.id],
                ready = route?.status === 'ready',
                a = edge.start,
                b = edge.end;
              const d = ready
                ? route.points
                    .map((point, index) => `${index ? 'L' : 'M'} ${point.x} ${point.y}`)
                    .join(' ')
                : `M ${a.x} ${a.y} C ${(a.x + b.x) / 2} ${a.y} ${(a.x + b.x) / 2} ${b.y} ${b.x} ${b.y}`;
              return (
                <path
                  key={edge.id}
                  d={d}
                  fill="none"
                  stroke={edge.fromId === 'project' ? '#cbd5e1' : '#155eef'}
                  strokeWidth={edge.fromId === 'project' ? 1.3 : 1.8}
                  data-routing={ready ? 'routed' : 'fallback'}
                />
              );
            })}
          </g>
        </svg>
        <div className="planning-hit-layer">
          {nodes
            .filter((node) => node.kind !== 'root')
            .map((node) => (
              <button
                key={node.id}
                className="planning-node-hit"
                ref={(element) => {
                  if (element) hits.current.set(node.id, element);
                  else hits.current.delete(node.id);
                }}
                data-kind={node.kind}
                onFocus={() => revealNode(node)}
                aria-label={
                  node.kind === 'document'
                    ? `문서 펼치기: ${node.title}`
                    : `상세보기: ${node.title}`
                }
                aria-expanded={
                  node.kind === 'document' ? node.documentId === document?.id : undefined
                }
                title={node.title}
                style={{
                  left: (node.position.x - node.width / 2) * viewport.zoom + viewport.x,
                  top: (node.position.y - node.height / 2) * viewport.zoom + viewport.y,
                  width: node.width * viewport.zoom,
                  height: node.height * viewport.zoom,
                }}
                onClick={() =>
                  node.kind === 'document' ? toggle(node.documentId!) : setSelected(node.itemId!)
                }
              >
                <span className="planning-sr-only">{node.title}</span>
              </button>
            ))}
        </div>
        <div className="planning-zoom">
          <button
            className="icon-button"
            aria-label="축소"
            onClick={() => cy.current?.zoom(Math.max(0.35, viewport.zoom - 0.1))}
          >
            <Minus size={16} />
          </button>
          <button
            className="icon-button"
            aria-label="확대"
            onClick={() => cy.current?.zoom(Math.min(1.8, viewport.zoom + 0.1))}
          >
            <Plus size={16} />
          </button>
          <button
            className="icon-button"
            aria-label="전체 맞춤"
            onClick={() => cy.current?.fit(undefined, 32)}
          >
            <Maximize2 size={16} />
          </button>
        </div>
        {selectedItem && document && active && (
          <PlanningDetail
            item={selectedItem}
            document={document}
            card={{
              x: (active.position.x - active.width / 2) * viewport.zoom + viewport.x,
              y: (active.position.y - active.height / 2) * viewport.zoom + viewport.y,
              width: active.width * viewport.zoom,
              height: active.height * viewport.zoom,
            }}
            width={size.width}
            height={size.height}
            onClose={closeDetail}
            onSource={onSelect}
          />
        )}
        {!documents.length && (
          <p className="planning-empty">
            표시할 기획 문서가 없습니다. 필터를 해제하거나 문서를 추가하세요.
          </p>
        )}
      </div>
      <div className="planning-pagination">
        {document ? (
          <>
            <span>
              {effectivePage * 8 + 1}–{effectivePage * 8 + items.length} / {allItems.length}개 항목
            </span>
            <button
              className="button compact"
              disabled={effectivePage === 0}
              onClick={() => {
                setPage(effectivePage - 1);
                setSelected('');
              }}
            >
              이전 항목
            </button>
            <button
              className="button compact"
              disabled={(effectivePage + 1) * 8 >= allItems.length}
              onClick={() => {
                setPage(effectivePage + 1);
                setSelected('');
              }}
            >
              다음 항목
            </button>
          </>
        ) : (
          <span>문서 카드를 누르면 오른쪽에 항목 카드가 펼쳐집니다.</span>
        )}
      </div>
    </section>
  );
}
