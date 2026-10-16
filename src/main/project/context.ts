import { contextPayload } from '../../shared/context-payload';
import { originalSource, selectContextSources } from './context-selection';
import { randomUUID } from 'node:crypto';
import { PlanningSessionStore } from './planning';
import { attachPlanningContext } from './planning-context';
import { UserFlowStore } from './user-flows';
import { flowInstructions, documentInstructions } from '../ai/instructions';
import { flowOutputSchema, outputSchema } from '../../shared/proposal-schema';
import type {
  ContextInput,
  ContextSnapshot,
  ContextSource,
  RejectionFeedback,
} from '../../shared/contracts';
import type { ProjectStore } from './store';
export async function buildContext(
  input: ContextInput,
  store: ProjectStore,
  replacesId?: string,
  feedbackId?: string,
): Promise<ContextSnapshot> {
  const ws = store.workspace();
  if (input.planningAction && !input.planningSessionId)
    throw new Error('기획 세션을 선택해 주세요.');
  if (
    input.planningSessionId &&
    (input.mode !== 'idea' ||
      input.selectedIds.length ||
      input.excludedIds.length ||
      input.flowId !== undefined)
  )
    throw new Error('기획 대화는 문서/유저플로우 검토와 별도로 진행해 주세요.');
  const excluded = new Set(input.excludedIds);
  const selected = new Set(input.selectedIds);
  const revisionProposal = replacesId ? ws.proposals.find((p) => p.id === replacesId) : undefined;
  const feedback = feedbackId ? store.get<RejectionFeedback>('feedback', feedbackId) : undefined;
  const rejected = feedback
    ? ws.proposals.find((p) => p.id === feedback.proposalId && p.status === 'rejected')
    : undefined;
  if (feedbackId && (!feedback || !rejected || replacesId))
    throw new Error('거절 피드백 맥락을 확인해 주세요.');
  if (replacesId && (!revisionProposal || !['pending', 'stale'].includes(revisionProposal.status)))
    throw new Error('수정 요청할 대기 제안을 찾을 수 없습니다.');
  if (input.planningSessionId && (revisionProposal || rejected)) {
    const proposal = (revisionProposal || rejected)!;
    const origin = store.get<ContextSnapshot>('context', proposal.snapshotId);
    if (
      proposal.kind !== 'create' ||
      origin?.planningContext?.sessionId !== input.planningSessionId
    )
      throw new Error('현재 기획에서 생성한 새 문서 제안만 검토할 수 있습니다.');
  }
  if (revisionProposal?.targetId && revisionProposal.kind !== 'flow')
    selected.add(revisionProposal.targetId);
  const previousFlowProposal =
    revisionProposal?.kind === 'flow'
      ? revisionProposal
      : rejected?.kind === 'flow'
        ? rejected
        : undefined;
  const previousSnapshot = previousFlowProposal
    ? store.get<ContextSnapshot>('context', previousFlowProposal.snapshotId)
    : undefined;
  if (previousSnapshot) for (const source of previousSnapshot.sources) selected.add(source.id);
  const flowId = previousSnapshot?.flowContext?.flowId ?? input.flowId;
  const flowContext =
    flowId !== undefined
      ? {
          flowId: flowId || randomUUID(),
          projectId: ws.project.id,
          baseFlow:
            flowId && ws.userFlows?.some((flow) => flow.id === flowId)
              ? new UserFlowStore(store.root, ws.project.id, ws.documents).read(flowId)
              : null,
        }
      : undefined;
  if (input.flowId && !flowContext?.baseFlow && !previousFlowProposal)
    throw new Error('수정할 플로우를 찾을 수 없습니다.');
  const docFor = (id: string) =>
    ws.documents.find((d) => d.id === id || d.sections.some((s) => s.id === id));
  for (const id of selected)
    if (!docFor(id)) throw new Error('선택한 문서를 찾을 수 없습니다. 최신 문서를 확인해 주세요.');
  const source = originalSource;
  if (
    input.mode === 'idea' &&
    (selected.size || flowContext || (!input.planningSessionId && (revisionProposal || feedback)))
  )
    throw new Error('아이디어 상담에는 문서나 기존 제안을 포함할 수 없습니다.');
  const sources: ContextSource[] = [];
  const omittedIds: string[] = [];
  for (const id of selected) {
    const doc = docFor(id)!;
    if (!excluded.has(id) && !excluded.has(doc.id)) {
      if (id === doc.id && doc.sections.some((s) => excluded.has(s.id))) {
        sources.push(
          ...doc.sections.filter((s) => !excluded.has(s.id)).map((s) => source(doc, s.id)),
        );
        omittedIds.push(doc.id);
      } else sources.push(source(doc, id === doc.id ? undefined : id));
    }
  }
  const { id: _id, ...project } = ws.project;
  const snapshot: ContextSnapshot = {
    id: randomUUID(),
    requestId: randomUUID(),
    instruction: input.instruction,
    project,
    sources,
    requiresEvidence: input.mode !== 'idea',
    ...(flowContext ? { flowContext } : {}),
    decisions: ws.decisions,
    proposalHistory: ws.proposals
      .filter((p) => ['accepted', 'rejected'].includes(p.status))
      .map((p) => ({
        id: p.id,
        title: p.title,
        status: p.status,
        reason: p.reason,
        rejectionReason: p.rejectionReason,
      })),
    omittedIds,
  };
  if (revisionProposal) snapshot.revisionProposal = revisionProposal;
  if (rejected && feedback) {
    snapshot.rejectedProposal = {
      id: rejected.id,
      title: rejected.title,
      kind: rejected.kind,
      rejectionReason: feedback.reason,
    };
    snapshot.proposalHistory = snapshot.proposalHistory.map((p) => ({ ...p, reason: '' }));
  }
  const limit = input.maxCharacters ?? 60000;
  if (input.planningSessionId) {
    attachPlanningContext(
      snapshot,
      new PlanningSessionStore(store).read(input.planningSessionId),
      ws.messages,
      input.planningAction || 'discuss',
      limit,
    );
    store.saveSnapshot(snapshot);
    return snapshot;
  }
  const linkedIds = new Set(
    ws.relations
      .filter(
        (r) =>
          selected.has(r.fromId) ||
          selected.has(r.toId) ||
          sources.some((s) => s.documentId === r.fromId || s.documentId === r.toId),
      )
      .flatMap((r) => [r.fromId, r.toId]),
  );
  const words = input.instruction
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 1);
  const candidates = ws.documents
    .filter(
      (doc) =>
        linkedIds.has(doc.id) ||
        doc.sections.some((s) => linkedIds.has(s.id)) ||
        words.some((w) => (doc.title + ' ' + doc.markdown).toLowerCase().includes(w)),
    )
    .sort(
      (a, b) =>
        Number(linkedIds.has(b.id)) - Number(linkedIds.has(a.id)) ||
        words.filter((w) => b.title.toLowerCase().includes(w)).length -
          words.filter((w) => a.title.toLowerCase().includes(w)).length,
    );
  snapshot.relations = [];
  snapshot.omittedRelationCount = ws.relations.length;
  selectContextSources(
    snapshot,
    ws.documents,
    input.mode === 'idea' ? [] : sources,
    input.mode === 'idea' ? [] : candidates,
    excluded,
    limit,
  );
  snapshot.relations = [];
  snapshot.omittedRelationCount = 0;
  for (const relation of ws.relations) {
    const from = docFor(relation.fromId);
    const to = docFor(relation.toId);
    if (
      !from ||
      !to ||
      !snapshot.sources.some((s) => s.documentId === from.id) ||
      !snapshot.sources.some((s) => s.documentId === to.id)
    )
      continue;
    snapshot.relations.push({ fromId: from.id, toId: to.id, type: relation.type });
    if (JSON.stringify(contextPayload(snapshot)).length > limit) {
      snapshot.relations.pop();
      snapshot.omittedRelationCount++;
    }
  }
  if (JSON.stringify(contextPayload(snapshot)).length > limit)
    throw new Error('필수 맥락이 너무 큽니다. 선택 범위를 줄여 주세요.');
  const inputTokens =
    Buffer.byteLength(JSON.stringify(contextPayload(snapshot)), 'utf8') +
    Buffer.byteLength(JSON.stringify(flowContext ? flowOutputSchema : outputSchema), 'utf8') +
    2 * Buffer.byteLength(flowContext ? flowInstructions : documentInstructions, 'utf8') +
    100;
  if (snapshot.flowContext) snapshot.flowEstimate = { inputTokens };
  if (snapshot.selection) {
    snapshot.selection.usedCharacters = JSON.stringify(contextPayload(snapshot)).length;
    snapshot.selection.estimatedInputTokens = inputTokens;
  }
  store.saveSnapshot(snapshot);
  return snapshot;
}

export function assertReviewedContext(current: ContextSnapshot, reviewed?: ContextSnapshot) {
  const comparable = (s: ContextSnapshot) => ({
    instruction: s.instruction,
    planningContext: s.planningContext,
    project: s.project,
    requiresEvidence: s.requiresEvidence,
    sources: s.sources,
    decisions: s.decisions,
    proposalHistory: s.proposalHistory,
    relations: s.relations,
    flow: s.flowContext
      ? { projectId: s.flowContext.projectId, baseFlow: s.flowContext.baseFlow }
      : undefined,
    revisionProposal: s.revisionProposal,
    rejectedProposal: s.rejectedProposal,
  });
  if (!reviewed || JSON.stringify(comparable(current)) !== JSON.stringify(comparable(reviewed)))
    throw new Error('검토한 맥락이 변경되었습니다. 최신 근거를 다시 확인해 주세요.');
  if (current.flowContext && reviewed.flowContext)
    current.flowContext.flowId = reviewed.flowContext.flowId;
}
