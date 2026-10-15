module.exports = function flowResponse(context) {
  const request = context.flowContext;
  const source = context.sources[0];
  const base = request.baseFlow;
  const inferred = { origin: 'inferred', evidence: [] };
  const flow = base
    ? structuredClone(base)
    : {
        schemaVersion: 1,
        id: request.flowId,
        projectId: request.projectId,
        revision: '',
        title: 'AI 가입 여정',
        nodes: [
          { id: 'start', type: 'startEnd', data: { label: '시작', role: 'start' }, ...inferred },
          {
            id: 'screen',
            type: 'page',
            data: { label: '로그인 화면', description: '문서에 설명된 사용자 화면' },
            origin: 'grounded',
            evidence: [
              {
                documentId: source.documentId,
                sectionId: source.sectionId || null,
                revision: source.revision,
                quoteRange: {
                  start: source.range?.start || 0,
                  end: source.range?.end ?? source.content.length,
                },
              },
            ],
          },
          { id: 'end', type: 'startEnd', data: { label: '완료', role: 'end' }, ...inferred },
        ],
        edges: [
          { id: 'e-start', source: 'start', target: 'screen', ...inferred },
          { id: 'e-end', source: 'screen', target: 'end', ...inferred },
        ],
      };
  if (base) {
    flow.nodes = flow.nodes
      .filter((node) => node.id !== 'end')
      .map((node) =>
        node.id === 'screen'
          ? { ...node, data: { ...node.data, label: '로그인 화면 개선' } }
          : node,
      );
    flow.nodes.push({
      id: 'finish',
      type: 'system',
      data: { label: '완료 상태 저장' },
      ...inferred,
    });
    flow.edges = flow.edges.filter((edge) => edge.id !== 'e-end');
    flow.edges.push({
      id: 'e-finish',
      source: 'screen',
      target: 'finish',
      label: '성공',
      ...inferred,
    });
  }
  return {
    message: '유저플로우 변경을 제안했습니다.',
    proposals: [
      {
        kind: 'flow',
        title: flow.title,
        documentType: 'flow',
        targetId: base?.id || null,
        baseRevision: base?.revision || null,
        replacement: '문서 근거에 따른 사용자 여정',
        sourceIds: [source.id],
        reason: '화면 근거와 추정 완료 단계를 구분했습니다.',
        dependencyIds: [],
        flow,
      },
    ],
  };
};
