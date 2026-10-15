import { randomUUID } from 'node:crypto';
import type { ContextSnapshot, Proposal } from '../../shared/contracts';
import { responseSchema } from '../../shared/proposal-schema';
import type { ProjectStore } from './store';
import { prepareFlowProposal, acceptFlowProposal } from './flow-proposals';
import type { UserFlow } from '../../shared/user-flow';
export class ProposalService {
  constructor(private store: ProjectStore) {}
  async register(snapshotId: string, raw: unknown, replacesId?: string): Promise<Proposal[]> {
    const context = this.store.get<ContextSnapshot>('context', snapshotId);
    if (!context) throw new Error('요청 맥락을 찾을 수 없습니다.');
    const batch = this.store.get<{ id: string; proposalIds: string[] }>('batch', context.requestId);
    if (batch) return batch.proposalIds.map((id) => this.store.get<Proposal>('proposal', id)!);
    const response = responseSchema.parse(raw);
    if (
      context.flowContext &&
      (response.proposals.length > 1 || response.proposals.some((draft) => draft.kind !== 'flow'))
    )
      throw new Error('유저플로우 요청은 플로우 제안 하나만 반환할 수 있습니다.');
    const allowedSources = new Set(context.sources.map((s) => s.id));
    const proposals: Proposal[] = response.proposals.map((draft) => {
      if (draft.sourceIds.some((id) => !allowedSources.has(id)))
        throw new Error('전달하지 않은 문서를 근거로 제안할 수 없습니다.');
      if (draft.kind === 'update') {
        const target = context.sources.find(
          (s) =>
            s.documentId === draft.targetId &&
            (draft.scopedSourceId
              ? s.id === draft.scopedSourceId && !!s.range
              : s.id === draft.targetId && s.complete !== false),
        );
        if (!target || target.revision !== draft.baseRevision)
          throw new Error('수정 대상 문서와 기준 버전이 요청 맥락과 일치하지 않습니다.');
        if (draft.scopedSourceId && !draft.sourceIds.includes(target.id))
          throw new Error('발췌 수정의 근거 ID가 누락되었습니다.');
        const current = this.store.document(target.documentId);
        for (const section of current.source === 'linked' || draft.scopedSourceId
          ? []
          : current.sections)
          if (
            draft.replacement.includes(section.title) &&
            !draft.replacement.includes(`docflow-section:${section.id}`)
          )
            throw new Error(
              '수정안에서 기존 섹션 ID가 누락되었습니다. ID를 유지하도록 다시 요청해 주세요.',
            );
      } else if (draft.kind !== 'flow' && (draft.targetId !== null || draft.baseRevision !== null))
        throw new Error('새 문서와 결정 제안에는 수정 대상이 없어야 합니다.');
      if (draft.kind !== 'update' && draft.scopedSourceId)
        throw new Error('범위 수정은 update 제안에만 허용됩니다.');
      if (draft.kind === 'relation') {
        const relation = draft.relation;
        const from = context.sources.find(
          (s) => s.documentId === relation.fromId && draft.sourceIds.includes(s.id),
        );
        const to = context.sources.find(
          (s) => s.documentId === relation.toId && draft.sourceIds.includes(s.id),
        );
        if (
          relation.fromId === relation.toId ||
          !from ||
          !to ||
          !draft.sourceIds.includes(from.id) ||
          !draft.sourceIds.includes(to.id)
        )
          throw new Error('관계 제안에는 전달된 서로 다른 두 문서의 근거가 필요합니다.');
        if (relation.fromRevision !== from.revision || relation.toRevision !== to.revision)
          throw new Error('관계 제안의 문서 버전이 요청 맥락과 일치하지 않습니다.');
      }
      if (draft.dependencyIds.some((id) => !this.store.get<Proposal>('proposal', id)))
        throw new Error('선행 제안을 찾을 수 없습니다.');
      return {
        ...draft,
        ...(draft.kind === 'flow' ? prepareFlowProposal(draft, context, this.store) : {}),
        sourceRanges: context.sources
          .filter((s) => draft.sourceIds.includes(s.id) && s.range)
          .map((s) => ({ id: s.id, documentId: s.documentId, ...s.range! })),
        id: randomUUID(),
        requestId: context.requestId,
        snapshotId,
        status: 'pending',
        createdAt: new Date().toISOString(),
        replacesId,
      };
    });
    this.store.transaction(() => {
      for (const proposal of proposals) this.store.put('proposal', proposal);
      this.store.put('batch', {
        id: context.requestId,
        proposalIds: proposals.map((p) => p.id),
      } as {
        id: string;
      });
      if (replacesId && proposals.length) {
        const previous = this.store.get<Proposal>('proposal', replacesId);
        if (previous && ['pending', 'stale'].includes(previous.status))
          this.store.put('proposal', { ...previous, status: 'superseded' });
      }
    });
    return proposals;
  }
  async accept(id: string, laidFlow?: UserFlow) {
    const proposal = this.store.get<Proposal>('proposal', id);
    if (!proposal || proposal.status !== 'pending')
      throw new Error('검토 대기 중인 제안만 수락할 수 있습니다.');
    if (
      proposal.dependencyIds.some(
        (id) => this.store.get<Proposal>('proposal', id)?.status !== 'accepted',
      )
    )
      throw new Error('선행 제안을 먼저 수락해 주세요.');
    if (proposal.kind === 'flow') {
      acceptFlowProposal(this.store, proposal, laidFlow);
    } else if (proposal.kind === 'relation') {
      const relation = proposal.relation;
      const docs = this.store.listDocuments();
      if (
        !relation ||
        docs.find((d) => d.id === relation.fromId)?.revision !== relation.fromRevision ||
        docs.find((d) => d.id === relation.toId)?.revision !== relation.toRevision
      ) {
        this.store.put('proposal', { ...proposal, status: 'stale' });
        throw new Error('연결 대상 문서가 변경되거나 삭제되어 관계를 다시 검토해야 합니다.');
      }
      this.store.acceptRelationProposal(id);
    } else if (proposal.kind === 'update') {
      if (this.store.document(proposal.targetId!).revision !== proposal.baseRevision) {
        this.store.put('proposal', { ...proposal, status: 'stale' });
        throw new Error('문서가 변경되어 제안을 다시 검토해야 합니다.');
      }
      if (proposal.scopedSourceId) {
        const snapshot = this.store.get<ContextSnapshot>('context', proposal.snapshotId);
        const source = snapshot?.sources.find(
          (s) =>
            s.id === proposal.scopedSourceId &&
            s.documentId === proposal.targetId &&
            s.revision === proposal.baseRevision,
        );
        if (!source?.range) throw new Error('발췌 수정의 원본 근거를 찾을 수 없습니다.');
        this.store.saveExcerpt(source, proposal.replacement, id);
      } else
        await this.store.saveDocument(
          proposal.targetId!,
          proposal.replacement,
          proposal.baseRevision!,
          id,
        );
    } else if (proposal.kind === 'decision')
      this.store.addDecision(proposal.replacement, proposal.sourceIds, id);
    else await this.store.createFromProposal(proposal);
    return this.store.workspace();
  }
  async reject(id: string, reason?: string) {
    const proposal = this.store.get<Proposal>('proposal', id);
    if (!proposal || !['pending', 'stale'].includes(proposal.status))
      throw new Error('이미 처리된 제안입니다.');
    this.store.put('proposal', {
      ...proposal,
      status: 'rejected',
      rejectionReason: reason?.trim() || undefined,
    });
    return this.store.workspace();
  }
}
