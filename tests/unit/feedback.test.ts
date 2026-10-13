import { it, expect, vi } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ProjectStore } from '../../src/main/project/store';
import { ProposalService } from '../../src/main/project/proposals';
import { FeedbackService } from '../../src/main/project/feedback';
import { buildContext } from '../../src/main/project/context';
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'docflow-feedback-'));
  const store = await ProjectStore.open(root);
  const allowed = await store.createDocument('Allowed', 'note', '# Allowed');
  const excluded = await store.createDocument('Excluded', 'note', '# Excluded\nSECRET_BODY');
  const context = await buildContext(
    { instruction: '검토', selectedIds: [allowed.id, excluded.id], excludedIds: [] },
    store,
  );
  const draft = {
    kind: 'create',
    documentType: 'note',
    title: '검토용 제안',
    targetId: null,
    baseRevision: null,
    replacement: '# 제안\nSECRET_BODY',
    sourceIds: [allowed.id, excluded.id],
    reason: 'SECRET_RATIONALE',
    dependencyIds: [],
  };
  const proposals = await new ProposalService(store).register(context.id, {
    message: '검토했습니다',
    proposals: [draft, { ...draft, title: '다른 제안' }],
  });
  return {
    root,
    store,
    allowed,
    excluded,
    proposals,
    async close() {
      this.store.close();
      await rm(root, { recursive: true, force: true, maxRetries: 5 });
    },
  };
}
it('records one rejection/message and deduplicates the same feedback without altering original files', async () => {
  const f = await fixture();
  try {
    const service = new FeedbackService(f.store);
    expect(f.store.workspace().proposals[0].status).toBe('pending');
    const first = service.prepare(f.proposals[0].id, ' 범위를 줄여 주세요 ', 'feedback-id');
    expect(service.prepare(f.proposals[0].id, '범위를 줄여 주세요', 'feedback-id')).toEqual(first);
    expect(f.store.workspace().proposals[0]).toMatchObject({
      status: 'rejected',
      rejectionReason: '범위를 줄여 주세요',
    });
    expect(f.store.workspace().messages).toHaveLength(1);
    expect(f.store.workspace().documents).toHaveLength(2);
    expect(() => service.prepare(f.proposals[1].id, '다른 이유', 'feedback-id')).toThrow(
      /다른|충돌/,
    );
    expect(() => service.prepare(f.proposals[0].id, '다른 이유', 'different-id')).toThrow(
      /처리|거절/,
    );
  } finally {
    await f.close();
  }
});
it('records an empty reason as rejection only, without a conversation request', async () => {
  const f = await fixture();
  try {
    const feedback = new FeedbackService(f.store).prepare(
      f.proposals[0].id,
      '  ',
      'empty-feedback',
    );
    expect(feedback.status).toBe('completed');
    expect(feedback.requestId).toBeUndefined();
    expect(f.store.workspace().messages).toHaveLength(0);
  } finally {
    await f.close();
  }
});
it('rolls back rejection and message together when the local write fails', async () => {
  const f = await fixture();
  try {
    const original = f.store.put.bind(f.store);
    const spy = vi.spyOn(f.store, 'put').mockImplementation((kind, record) => {
      if (kind === 'feedback') throw new Error('disk failure');
      return original(kind, record);
    });
    expect(() =>
      new FeedbackService(f.store).prepare(f.proposals[0].id, '이유', 'atomic-feedback'),
    ).toThrow('disk failure');
    spy.mockRestore();
    expect(f.store.workspace().proposals[0].status).toBe('pending');
    expect(f.store.workspace().messages).toHaveLength(0);
    expect(f.store.workspace().feedbacks).toEqual([]);
  } finally {
    await f.close();
  }
});
it('persists failed feedback and starts retries without duplicating rejection or the user message', async () => {
  const f = await fixture();
  try {
    let service = new FeedbackService(f.store);
    const feedback = service.prepare(
      f.proposals[0].id,
      '이유를 다시 판단해 주세요',
      'retry-feedback',
    );
    service.setStatus(feedback.id, 'running', feedback.id);
    service.setStatus(feedback.id, 'failed');
    f.store.close();
    f.store = await ProjectStore.open(f.root);
    service = new FeedbackService(f.store);
    expect(f.store.workspace().feedbacks?.[0].status).toBe('failed');
    service.setStatus(feedback.id, 'running', 'retry-request');
    service.setStatus(feedback.id, 'completed');
    expect(f.store.workspace().messages).toHaveLength(1);
    expect(f.store.workspace().proposals[0].status).toBe('rejected');
    expect(f.store.workspace().feedbacks?.[0].requestId).toBe('retry-request');
  } finally {
    await f.close();
  }
});
it('sends only a safe rejected-proposal summary and preserves document exclusions', async () => {
  const f = await fixture();
  try {
    const feedback = new FeedbackService(f.store).prepare(
      f.proposals[0].id,
      '문서 범위가 너무 큽니다',
      'private-feedback',
    );
    const context = await buildContext(
      { instruction: '후속 대화', selectedIds: [f.allowed.id], excludedIds: [f.excluded.id] },
      f.store,
      undefined,
      feedback.id,
    );
    expect(context.rejectedProposal).toMatchObject({
      id: f.proposals[0].id,
      rejectionReason: '문서 범위가 너무 큽니다',
    });
    expect(JSON.stringify(context)).not.toContain('SECRET_BODY');
    expect(JSON.stringify(context)).not.toContain('SECRET_RATIONALE');
    expect(f.store.workspace().proposals[0].replacement).toContain('SECRET_BODY');
  } finally {
    await f.close();
  }
});
it('recovers an interrupted request as failed and rejects retrying empty or completed feedback', async () => {
  const f = await fixture();
  try {
    let service = new FeedbackService(f.store);
    const feedback = service.prepare(f.proposals[0].id, '다시 판단', 'interrupted');
    service.setStatus(feedback.id, 'running', 'interrupted-request');
    expect(() => service.setStatus(feedback.id, 'running', 'duplicate')).toThrow();
    f.store.close();
    f.store = await ProjectStore.open(f.root);
    service = new FeedbackService(f.store);
    expect(service.get(feedback.id).status).toBe('failed');
    service.setStatus(feedback.id, 'running', 'resumed');
    service.setStatus(feedback.id, 'completed');
    expect(() => service.setStatus(feedback.id, 'running', 'again')).toThrow();
    const empty = service.prepare(f.proposals[1].id, '', 'empty');
    expect(() => service.setStatus(empty.id, 'running')).toThrow();
    expect(f.store.workspace().messages).toHaveLength(1);
  } finally {
    await f.close();
  }
});
