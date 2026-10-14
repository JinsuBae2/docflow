import type { ELK, ElkNode, ElkExtendedEdge } from 'elkjs/lib/elk-api';
import type { UserFlow, UserFlowNode } from '../../../shared/user-flow';

export interface FlowLayout {
  flow: UserFlow;
  paths: Record<string, Array<{ x: number; y: number }>>;
}
export function nodeSize(node: UserFlowNode) {
  return {
    width: node.type === 'action' ? 210 : 250,
    height:
      node.type === 'startEnd'
        ? 100
        : node.type === 'page'
          ? 190
          : Math.max(140, (node.data.outputs?.length || 0) * 36 + 70),
  };
}
export async function layoutUserFlow(
  flow: UserFlow,
  engine: Pick<ELK, 'layout'>,
  preservePositions = false,
): Promise<FlowLayout> {
  preservePositions = preservePositions && flow.nodes.some((node) => !!node.position);
  const options = {
    'elk.algorithm': 'layered',
    'elk.direction': 'RIGHT',
    'elk.edgeRouting': 'ORTHOGONAL',
    'elk.layered.mergeEdges': 'false',
    'elk.hierarchyHandling': 'INCLUDE_CHILDREN',
    'elk.spacing.nodeNode': '48',
    'elk.layered.spacing.nodeNodeBetweenLayers': '100',
    'elk.padding': '[top=70,left=32,bottom=32,right=32]',
  };
  const children = (parentId?: string): ElkNode[] =>
    flow.nodes
      .filter((node) => node.parentId === parentId)
      .map((node) => {
        const size = nodeSize(node);
        const outputs = node.type === 'condition' ? node.data.outputs || [] : [{ id: 'out' }];
        return {
          id: node.id,
          ...size,
          layoutOptions: { ...options, 'elk.portConstraints': 'FIXED_POS' },
          ...(node.type === 'group' ? { children: children(node.id) } : {}),
          ports: [
            { id: `${node.id}--in`, x: 0, y: size.height / 2, width: 0, height: 0 },
            ...outputs.map((port, index) => ({
              id: `${node.id}--${port.id}`,
              x: size.width,
              y: (size.height * (index + 1)) / (outputs.length + 1),
              width: 0,
              height: 0,
            })),
          ],
        };
      });
  const result = await engine.layout({
    id: 'root',
    layoutOptions: options,
    children: children(),
    edges: flow.edges.map((edge) => ({
      id: edge.id,
      sources: [`${edge.source}--${edge.sourceHandle || 'out'}`],
      targets: [`${edge.target}--in`],
    })),
  });
  const positions = new Map<string, ElkNode>();
  const paths: FlowLayout['paths'] = {};
  const offsets = new Map<string, { x: number; y: number }>([['root', { x: 0, y: 0 }]]);
  const routed: Array<{
    edge: ElkExtendedEdge & { container?: string };
    offset: { x: number; y: number };
  }> = [];
  const read = (node: ElkNode, offset = { x: 0, y: 0 }) => {
    for (const edge of (node.edges || []) as ElkExtendedEdge[]) {
      routed.push({ edge, offset });
    }
    for (const child of node.children || []) {
      positions.set(child.id, child);
      const absolute = { x: offset.x + (child.x || 0), y: offset.y + (child.y || 0) };
      offsets.set(child.id, absolute);
      read(child, absolute);
    }
  };
  read(result);
  for (const { edge, offset } of routed) {
    const section = edge.sections?.[0];
    const origin = offsets.get(edge.container || '') || offset;
    if (section)
      paths[edge.id] = [section.startPoint, ...(section.bendPoints || []), section.endPoint].map(
        (point) => ({ x: point.x + origin.x, y: point.y + origin.y }),
      );
  }
  const placed = flow.nodes.map((node) => {
    const layout = positions.get(node.id)!;
    return {
      ...node,
      position:
        preservePositions && node.position
          ? { ...node.position }
          : { x: layout.x || 0, y: layout.y || 0 },
      width: preservePositions && node.width ? node.width : layout.width,
      height: preservePositions && node.height ? node.height : layout.height,
    };
  });
  if (preservePositions) {
    const saved = new Set(flow.nodes.filter((node) => node.position).map((node) => node.id));
    const occupied = placed.filter((node) => saved.has(node.id));
    for (const node of placed.filter((node) => !saved.has(node.id))) {
      while (
        occupied.some(
          (other) =>
            other.parentId === node.parentId &&
            node.position.x < other.position.x + (other.width || 250) + 24 &&
            node.position.x + (node.width || 250) + 24 > other.position.x &&
            node.position.y < other.position.y + (other.height || 140) + 24 &&
            node.position.y + (node.height || 140) + 24 > other.position.y,
        )
      )
        node.position.y += (node.height || 140) + 24;
      occupied.push(node);
    }
    const grow = (parentId: string): { width: number; height: number } => {
      const group = placed.find((node) => node.id === parentId)!;
      for (const child of placed.filter((node) => node.parentId === parentId)) {
        if (child.type === 'group') Object.assign(child, grow(child.id));
        group.width = Math.max(group.width || 250, child.position.x + (child.width || 250) + 32);
        group.height = Math.max(group.height || 140, child.position.y + (child.height || 140) + 32);
      }
      return { width: group.width || 250, height: group.height || 140 };
    };
    for (const group of placed.filter((node) => node.type === 'group' && !node.parentId))
      grow(group.id);
  }
  return {
    paths: preservePositions ? {} : paths,
    flow: {
      ...flow,
      nodes: placed,
    },
  };
}
