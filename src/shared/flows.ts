export type FlowKind = 'flowchart' | 'sequence' | 'state' | 'er' | 'unsupported';
export interface SimpleFlow {
  direction: 'TD' | 'TB' | 'BT' | 'LR' | 'RL';
  nodes: Array<{ id: string; label: string }>;
  edges: Array<{ from: string; to: string }>;
}
export function flowKind(code: string): FlowKind {
  const first =
    code
      .split(/\r?\n/)
      .find((line) => line.trim() && !line.trim().startsWith('%%'))
      ?.trim() || '';
  if (/^(flowchart|graph)\s+(TD|TB|BT|LR|RL)\b/.test(first)) return 'flowchart';
  if (/^sequenceDiagram\b/.test(first)) return 'sequence';
  if (/^stateDiagram(?:-v2)?\b/.test(first)) return 'state';
  if (/^erDiagram\b/.test(first)) return 'er';
  return 'unsupported';
}
export function flowSafetyError(code: string): string | undefined {
  if (code.length > 50_000)
    return '미리보기 렌더 한도 50,000자를 넘었습니다. 원문은 아래에서 확인할 수 있습니다.';
  let statements = code
    .replace(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g, '""')
    .replace(/%%[^\n]*/g, '');
  if (flowKind(code) === 'flowchart')
    statements = statements.replace(
      /\b[A-Za-z][A-Za-z0-9_]*\s*(?:\[[^\]\n]*\]|\{[^}\n]*\})/g,
      'node',
    );
  if (
    /%%\{|^\s*---|(?:https?|javascript|data|file):/i.test(code) ||
    /(?:^|[;\r\n{}])\s*(?:click|href|callback|links?)\b/i.test(statements) ||
    /<\/?[A-Za-z][^>]*>/.test(code.replace(/<<(choice|fork|join)>>/g, ''))
  )
    return '실행 링크·HTML·설정 지시문이 포함되어 미리보기를 차단했습니다. 원문은 보존됩니다.';
  if (flowKind(code) === 'unsupported')
    return '이 형식은 원문 보기로 지원합니다. 흐름도·시퀀스·상태·ERD를 미리 볼 수 있습니다.';
}
const validId = (id: string) => /^[A-Za-z][A-Za-z0-9_]{0,60}$/.test(id);
const validLabel = (label: string) =>
  !!label.trim() && label.length <= 200 && !/[[\]"<>\\\r\n]/.test(label);
export function serializeSimpleFlow(flow: SimpleFlow): string {
  if (
    !['TD', 'TB', 'BT', 'LR', 'RL'].includes(flow.direction) ||
    !flow.nodes.length ||
    flow.nodes.length > 100 ||
    flow.edges.length > 200
  )
    throw new Error('편집 가능한 방향·노드·연결 수를 확인해 주세요.');
  const ids = new Set<string>();
  for (const node of flow.nodes) {
    if (!validId(node.id) || !validLabel(node.label) || ids.has(node.id))
      throw new Error(
        '단계 ID와 이름을 확인해 주세요. HTML·따옴표·대괄호·줄바꿈은 사용할 수 없습니다.',
      );
    ids.add(node.id);
  }
  const edges = new Set<string>();
  for (const edge of flow.edges) {
    const key = `${edge.from}:${edge.to}`;
    if (!ids.has(edge.from) || !ids.has(edge.to) || edges.has(key))
      throw new Error('연결 대상과 중복을 확인해 주세요.');
    edges.add(key);
  }
  const code = [
    `flowchart ${flow.direction}`,
    ...flow.nodes.map((node) => `  ${node.id}["${node.label}"]`),
    ...flow.edges.map((edge) => `  ${edge.from} --> ${edge.to}`),
  ].join('\n');
  const error = flowSafetyError(code);
  if (error) throw new Error(error);
  return code;
}
export function parseSimpleFlow(code: string): SimpleFlow | null {
  if (flowSafetyError(code)) return null;
  const lines = code
    .trim()
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const header = /^(?:flowchart|graph)\s+(TD|TB|BT|LR|RL)\s*;?$/.exec(lines.shift() || '');
  if (!header) return null;
  const nodes = new Map<string, string>();
  const edges = new Map<string, { from: string; to: string }>();
  const explicit = new Set<string>();
  for (const line of lines) {
    const parts = line.replace(/;$/, '').split(/\s*-->\s*/);
    const ids: string[] = [];
    for (const part of parts) {
      const match = /^([A-Za-z][A-Za-z0-9_]{0,60})(?:\[(?:"([^"\n]*)"|([^\]\n]*))\])?$/.exec(part);
      if (!match) return null;
      const id = match[1];
      const label = match[2] ?? match[3];
      if (label !== undefined) {
        if (!validLabel(label) || (explicit.has(id) && nodes.get(id) !== label)) return null;
        explicit.add(id);
        nodes.set(id, label);
      } else if (!nodes.has(id)) nodes.set(id, id);
      ids.push(id);
    }
    for (let index = 1; index < ids.length; index++) {
      const key = `${ids[index - 1]}:${ids[index]}`;
      if (edges.has(key)) return null;
      edges.set(key, { from: ids[index - 1], to: ids[index] });
    }
  }
  const flow: SimpleFlow = {
    direction: header[1] as SimpleFlow['direction'],
    nodes: [...nodes].map(([id, label]) => ({ id, label })),
    edges: [...edges.values()],
  };
  try {
    serializeSimpleFlow(flow);
    return flow;
  } catch {
    return null;
  }
}
