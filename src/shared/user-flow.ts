import { z } from 'zod';

const key = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]{0,100}$/);
const sourceId = z.string().min(1).max(250);
const coordinate = z.number().min(-1_000_000).max(1_000_000);
export const flowEvidenceSchema = z
  .object({
    documentId: sourceId,
    sectionId: sourceId.nullable(),
    revision: sourceId,
    quoteRange: z
      .object({ start: z.number().int().min(0), end: z.number().int().min(1) })
      .strict()
      .refine((range) => range.end > range.start, '근거 범위가 올바르지 않습니다.'),
  })
  .strict();
const attribution = {
  origin: z.enum(['grounded', 'inferred']),
  evidence: z.array(flowEvidenceSchema).max(100),
};
const nodeSchema = z
  .object({
    id: key,
    type: z.enum(['group', 'startEnd', 'page', 'action', 'condition', 'system']),
    parentId: key.optional(),
    extent: z.literal('parent').optional(),
    position: z.object({ x: coordinate, y: coordinate }).strict().optional(),
    width: z.number().min(100).max(1_000_000).optional(),
    height: z.number().min(48).max(1_000_000).optional(),
    collapsed: z.boolean().optional(),
    data: z
      .object({
        label: z.string().trim().min(1).max(200),
        description: z.string().max(2000).optional(),
        components: z.array(z.string().max(200)).max(20).optional(),
        role: z.enum(['start', 'end']).optional(),
        outputs: z
          .array(z.object({ id: key, label: z.string().trim().min(1).max(80) }).strict())
          .max(20)
          .optional(),
      })
      .strict(),
    ...attribution,
  })
  .strict();
const edgeSchema = z
  .object({
    id: key,
    source: key,
    target: key,
    sourceHandle: key.optional(),
    label: z.string().max(200).optional(),
    ...attribution,
  })
  .strict();
export const userFlowSchema = z
  .object({
    schemaVersion: z.literal(1),
    id: key,
    projectId: sourceId,
    title: z.string().trim().min(1).max(200),
    revision: z.string().max(250),
    nodes: z.array(nodeSchema).max(500),
    edges: z.array(edgeSchema).max(1000),
  })
  .strict()
  .superRefine((flow, context) => {
    const fail = (message: string) => context.addIssue({ code: 'custom', message });
    const nodes = new Map(flow.nodes.map((node) => [node.id, node]));
    if (nodes.size !== flow.nodes.length) fail('중복 노드 ID입니다.');
    if (new Set(flow.edges.map((edge) => edge.id)).size !== flow.edges.length)
      fail('중복 연결 ID입니다.');
    if (flow.edges.some((edge) => nodes.has(edge.id))) fail('노드와 연결 ID는 서로 달라야 합니다.');
    for (const item of [...flow.nodes, ...flow.edges]) {
      if (item.origin === 'grounded' && !item.evidence.length) fail('문서 근거가 필요합니다.');
    }
    for (const node of flow.nodes) {
      if (node.parentId && nodes.get(node.parentId)?.type !== 'group')
        fail('부모 그룹을 찾을 수 없습니다.');
      if (node.extent && !node.parentId) fail('부모 범위에는 parentId가 필요합니다.');
      if (node.collapsed !== undefined && node.type !== 'group') fail('그룹만 접을 수 있습니다.');
      const seen = new Set([node.id]);
      let parent = node.parentId;
      while (parent) {
        if (seen.has(parent)) {
          fail('그룹 참조가 순환합니다.');
          break;
        }
        seen.add(parent);
        parent = nodes.get(parent)?.parentId;
      }
      const outputs = node.data.outputs || [];
      if (outputs.some((port) => port.id === 'in')) fail('in은 입력 포트 전용 ID입니다.');
      if (new Set(outputs.map((port) => port.id)).size !== outputs.length)
        fail('중복 분기 포트입니다.');
      if (node.type !== 'condition' && outputs.length) fail('조건 노드만 분기 포트를 가집니다.');
    }
    for (const edge of flow.edges) {
      const source = nodes.get(edge.source);
      if (!source || !nodes.has(edge.target)) fail('연결 대상 노드를 찾을 수 없습니다.');
      if (source?.type === 'condition') {
        if (!source.data.outputs?.some((port) => port.id === edge.sourceHandle))
          fail('조건 분기 포트가 올바르지 않습니다.');
      } else if (edge.sourceHandle && edge.sourceHandle !== 'out')
        fail('출력 포트가 올바르지 않습니다.');
    }
  });

export type UserFlow = z.infer<typeof userFlowSchema>;
export type UserFlowNode = UserFlow['nodes'][number];
export type UserFlowEdge = UserFlow['edges'][number];
export type FlowEvidence = z.infer<typeof flowEvidenceSchema>;
export const parseUserFlow = (input: unknown): UserFlow => userFlowSchema.parse(input);

export function projectUserFlow(flow: UserFlow) {
  const nodes = new Map(flow.nodes.map((node) => [node.id, node]));
  const visibleEndpoint = (id: string) => {
    let visible = id;
    let parent = nodes.get(id)?.parentId;
    while (parent) {
      const group = nodes.get(parent)!;
      if (group.collapsed) visible = parent;
      parent = group.parentId;
    }
    return visible;
  };
  const depth = (node: UserFlowNode): number =>
    node.parentId ? 1 + depth(nodes.get(node.parentId)!) : 0;
  return {
    nodes: flow.nodes
      .filter((node) => visibleEndpoint(node.id) === node.id)
      .sort((a, b) => depth(a) - depth(b)),
    edges: flow.edges.flatMap((edge) => {
      const source = visibleEndpoint(edge.source),
        target = visibleEndpoint(edge.target);
      if (source === target && (source !== edge.source || target !== edge.target)) return [];
      return [
        {
          ...edge,
          label:
            edge.label ||
            nodes.get(edge.source)?.data.outputs?.find((port) => port.id === edge.sourceHandle)
              ?.label,
          source,
          target,
          sourceHandle: source === edge.source ? edge.sourceHandle || 'out' : `out-${edge.id}`,
          targetHandle: target === edge.target ? 'in' : `in-${edge.id}`,
        },
      ];
    }),
  };
}

export function diffUserFlow(base: UserFlow, proposed: UserFlow) {
  const compare = (before: Array<{ id: string }>, after: Array<{ id: string }>) => {
    const old = new Map(before.map((item) => [item.id, item]));
    const next = new Map(after.map((item) => [item.id, item]));
    return [...new Set([...old.keys(), ...next.keys()])].map((id) => ({
      id,
      status: !old.has(id)
        ? 'added'
        : !next.has(id)
          ? 'deleted'
          : JSON.stringify(old.get(id)) === JSON.stringify(next.get(id))
            ? 'unchanged'
            : 'modified',
    }));
  };
  return { nodes: compare(base.nodes, proposed.nodes), edges: compare(base.edges, proposed.edges) };
}
