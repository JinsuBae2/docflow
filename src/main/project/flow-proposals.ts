import type { ContextSnapshot, Proposal, ProposalDraft } from '../../shared/contracts';
import { parseUserFlow, type UserFlow } from '../../shared/user-flow';
import type { ProjectStore } from './store';
import { UserFlowStore } from './user-flows';

export function prepareFlowProposal(
  draft: ProposalDraft,
  context: ContextSnapshot,
  store: ProjectStore,
) {
  const request = context.flowContext;
  const flow = parseUserFlow(draft.flow);
  const base = request?.baseFlow || null;
  if (
    !request ||
    flow.id !== request.flowId ||
    flow.projectId !== request.projectId ||
    draft.targetId !== (base?.id || null) ||
    draft.baseRevision !== (base?.revision || null) ||
    flow.revision !== (base?.revision || '')
  )
    throw new Error('플로우 제안의 기준이 요청 맥락과 다릅니다.');
  for (const item of [...flow.nodes, ...flow.edges])
    for (const evidence of item.evidence) {
      const source = context.sources.find(
        (source) =>
          draft.sourceIds.includes(source.id) &&
          source.documentId === evidence.documentId &&
          source.revision === evidence.revision &&
          (!source.sectionId || source.sectionId === evidence.sectionId) &&
          evidence.quoteRange.start >= (source.range?.start || 0) &&
          evidence.quoteRange.end <= (source.range?.end ?? source.content.length),
      );
      if (!source) throw new Error('플로우 근거가 전달한 문서 범위를 벗어났습니다.');
    }
  flow.nodes = flow.nodes.map((node) => {
    const before = base?.nodes.find((candidate) => candidate.id === node.id);
    const {
      position: _position,
      width: _width,
      height: _height,
      collapsed: _collapsed,
      ...content
    } = node;
    return {
      ...content,
      ...(before?.parentId === node.parentId && before
        ? {
            position: before.position,
            width: before.width,
            height: before.height,
          }
        : {}),
      ...(node.type === 'group' ? { collapsed: before?.collapsed || false } : {}),
    };
  });
  new UserFlowStore(store.root, request.projectId, store.listDocuments()).validateEvidence(flow);
  return { flow: parseUserFlow(flow), baseFlow: base };
}

function content(flow: UserFlow) {
  return {
    ...flow,
    nodes: flow.nodes.map(
      ({ position: _position, width: _width, height: _height, ...node }) => node,
    ),
  };
}
export function acceptFlowProposal(store: ProjectStore, proposal: Proposal, laidFlow?: UserFlow) {
  const workspace = store.workspace();
  const service = new UserFlowStore(store.root, workspace.project.id, workspace.documents);
  const current = workspace.userFlows?.find((flow) => flow.id === proposal.flow!.id);
  const context = store.get<ContextSnapshot>('context', proposal.snapshotId);
  if (
    (current?.revision || null) !== proposal.baseRevision ||
    !context ||
    context.sources.some(
      (source) =>
        proposal.sourceIds.includes(source.id) &&
        workspace.documents.find((doc) => doc.id === source.documentId)?.revision !==
          source.revision,
    )
  ) {
    store.put('proposal', { ...proposal, status: 'stale' });
    throw new Error('플로우 또는 근거 문서가 변경되어 다시 검토해야 합니다.');
  }
  const flow = parseUserFlow(laidFlow);
  if (JSON.stringify(content(flow)) !== JSON.stringify(content(proposal.flow!)))
    throw new Error('배치 결과에서 제안 내용은 변경할 수 없습니다.');
  for (const node of flow.nodes) {
    const original = proposal.flow!.nodes.find((original) => original.id === node.id)!;
    if (
      !node.position ||
      (original.position && JSON.stringify(original.position) !== JSON.stringify(node.position))
    )
      throw new Error('기존 노드 좌표를 유지하고 신규 노드 배치를 확인해 주세요.');
  }
  try {
    service.validateEvidence(flow);
  } catch (error) {
    store.put('proposal', { ...proposal, status: 'stale' });
    throw error;
  }
  store.saveUserFlowProposal(flow, proposal.baseRevision, proposal.id);
}
