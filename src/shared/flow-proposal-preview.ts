import { diffUserFlow, type UserFlow } from './user-flow';
export type FlowChange = {
  status: 'added' | 'modified' | 'deleted' | 'unchanged';
  summary: string;
};
export type FlowChanges = { nodes: Record<string, FlowChange>; edges: Record<string, FlowChange> };
export function flowProposalPreview(base: UserFlow | null, proposed: UserFlow, laid: UserFlow) {
  const before = base || { ...proposed, nodes: [], edges: [] };
  const diff = diffUserFlow(before, proposed);
  const changes: FlowChanges = { nodes: {}, edges: {} };
  for (const kind of ['nodes', 'edges'] as const)
    for (const item of diff[kind]) {
      const old = before[kind].find((node) => node.id === item.id);
      const next = proposed[kind].find((node) => node.id === item.id);
      const fields = (a: unknown, b: unknown, prefix = ''): string[] => {
        if (JSON.stringify(a) === JSON.stringify(b)) return [];
        if (
          a &&
          b &&
          typeof a === 'object' &&
          typeof b === 'object' &&
          !Array.isArray(a) &&
          !Array.isArray(b)
        ) {
          const x = a as Record<string, unknown>,
            y = b as Record<string, unknown>;
          return [...new Set([...Object.keys(x), ...Object.keys(y)])].flatMap((key) =>
            fields(x[key], y[key], prefix ? `${prefix}.${key}` : key),
          );
        }
        return [`${prefix}: ${JSON.stringify(a) ?? '없음'} → ${JSON.stringify(b) ?? '없음'}`];
      };
      changes[kind][item.id] = {
        status: item.status as FlowChange['status'],
        summary: item.status === 'modified' ? fields(old, next).join('\n') : '',
      };
    }
  const flow: UserFlow = {
    ...laid,
    nodes: [...laid.nodes, ...removedFlowNodes(before, proposed)].map((node) => {
      const original = before.nodes.find((old) => old.id === node.id);
      return {
        ...node,
        ...(node.type === 'group' ? { collapsed: false } : {}),
        ...(node.type === 'condition'
          ? {
              data: {
                ...node.data,
                outputs: [
                  ...(node.data.outputs || []),
                  ...(original?.data.outputs || []).filter(
                    (port) => !node.data.outputs?.some((next) => next.id === port.id),
                  ),
                ],
              },
            }
          : {}),
      };
    }),
    edges: [
      ...laid.edges.map((edge) => ({ ...edge })),
      ...before.edges
        .filter((edge) => !proposed.edges.some((next) => next.id === edge.id))
        .map((edge) => ({ ...edge })),
    ],
  };
  for (const edge of flow.edges.filter((edge) => changes.edges[edge.id]?.status === 'deleted')) {
    const source = flow.nodes.find((node) => node.id === edge.source)!;
    if (source.type === 'condition') {
      const port = edge.sourceHandle || 'out';
      if (!source.data.outputs?.some((output) => output.id === port))
        source.data = {
          ...source.data,
          outputs: [...(source.data.outputs || []), { id: port, label: '이전 연결' }],
        };
    } else edge.sourceHandle = 'out';
  }
  return { flow, changes };
}

export function removedFlowNodes(base: UserFlow, proposed: UserFlow) {
  return base.nodes
    .filter((node) => !proposed.nodes.some((next) => next.id === node.id))
    .map((node) => {
      if (
        node.parentId &&
        proposed.nodes.some((parent) => parent.id === node.parentId && parent.type === 'group')
      )
        return { ...node, position: node.position ? { ...node.position } : undefined };
      const { parentId: _parentId, extent: _extent, ...ghost } = node;
      let position = node.position ? { ...node.position } : undefined;
      let parent = node.parentId;
      while (parent) {
        const ancestor = base.nodes.find((node) => node.id === parent)!;
        if (position && ancestor.position) {
          position.x += ancestor.position.x;
          position.y += ancestor.position.y;
        }
        parent = ancestor.parentId;
      }
      return { ...ghost, position };
    });
}
