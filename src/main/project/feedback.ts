import { randomUUID } from 'node:crypto';
import type { Proposal, RejectionFeedback } from '../../shared/contracts';
import type { ProjectStore } from './store';
export class FeedbackService {
  constructor(private store: ProjectStore) {}
  prepare(proposalId: string, rawReason: string, id: string): RejectionFeedback {
    if (!id || id.length > 250 || rawReason.length > 3000) throw new Error('거절 이유는 3000자 이하로 입력해 주세요.');
    const reason = rawReason.trim(); const existing = this.store.get<RejectionFeedback>('feedback', id);
    if (existing) {
      if (existing.proposalId !== proposalId || existing.reason !== reason) throw new Error('다른 피드백과 ID가 충돌합니다.');
      return existing;
    }
    const proposal = this.store.get<Proposal>('proposal', proposalId);
    if (!proposal || !['pending', 'stale'].includes(proposal.status)) throw new Error('이미 처리된 제안입니다.');
    const feedback: RejectionFeedback = { id, proposalId, reason, status: reason ? 'ready' : 'completed', ...(reason ? { messageId: randomUUID(), requestId: id } : {}) };
    return this.store.transaction(() => {
      this.store.put('proposal', { ...proposal, status: 'rejected', rejectionReason: reason || undefined });
      if (feedback.messageId) this.store.put('message', { id: feedback.messageId, role: 'user', text: `제안 '${proposal.title}' 거절 이유: ${reason}`, requestId: id, createdAt: new Date().toISOString() });
      this.store.put('feedback', feedback); return feedback;
    });
  }
  get(id: string): RejectionFeedback {
    const feedback = this.store.get<RejectionFeedback>('feedback', id);
    if (!feedback || this.store.get<Proposal>('proposal', feedback.proposalId)?.status !== 'rejected') throw new Error('거절 피드백을 찾을 수 없습니다.');
    return feedback;
  }
  setStatus(id: string, status: RejectionFeedback['status'], requestId?: string) {
    const feedback = this.get(id);
    if (status === 'running' && (!feedback.reason || !['ready', 'failed'].includes(feedback.status))) throw new Error('다시 요청할 수 있는 피드백이 아닙니다.');
    this.store.transaction(() => {
      this.store.put('feedback', { ...feedback, status, requestId: requestId || feedback.requestId });
      if (requestId && feedback.messageId) {
        const message = this.store.get<{ id: string; requestId: string }>('message', feedback.messageId);
        if (message) this.store.put('message', { ...message, requestId });
      }
    });
  }
}
