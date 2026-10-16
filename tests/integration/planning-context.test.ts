import { expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ProjectStore } from '../../src/main/project/store';
import { PlanningSessionStore } from '../../src/main/project/planning';
import { buildContext, assertReviewedContext } from '../../src/main/project/context';
import { contextPayload } from '../../src/shared/context-payload';
import { planningResponseSchema, planningOutputSchema } from '../../src/shared/proposal-schema';

it('carries only this planning session history and blocks changes after context review', async () => {
  const root = await mkdtemp(join(tmpdir(), 'docflow-planning-context-'));
  const store = await ProjectStore.open(root);
  try {
    const sessions = new PlanningSessionStore(store),
      session = sessions.start('brainstorm');
    await store.createDocument('秘密', 'note', '# 秘密\nDO NOT SEND');
    store.addDecision('OTHER DECISION', []);
    store.put('message', {
      id: 'foreign',
      role: 'user',
      text: 'FOREIGN CHAT',
      requestId: 'outside',
      createdAt: '',
    });
    sessions.attachRequest(session.id, 'one');
    store.put('message', {
      id: 'user-one',
      role: 'user',
      text: '대상은 운영자 👩‍💻',
      requestId: 'one',
      createdAt: '',
    });
    store.put('message', {
      id: 'assistant-one',
      role: 'assistant',
      text: '어떤 문제를 해결하나요?',
      requestId: 'one',
      createdAt: '',
    });
    const input = {
      mode: 'idea' as const,
      instruction: '탐지 시간을 줄입니다',
      selectedIds: [],
      excludedIds: [],
      planningSessionId: session.id,
    };
    const context = await buildContext(input, store);
    expect(context.planningContext?.messages.map((m) => m.text)).toEqual([
      '대상은 운영자 👩‍💻',
      '어떤 문제를 해결하나요?',
    ]);
    expect(context.requiresEvidence).toBe(false);
    expect(JSON.stringify(contextPayload(context))).not.toMatch(
      /DO NOT SEND|FOREIGN CHAT|OTHER DECISION/,
    );
    expect(contextPayload(context)).not.toHaveProperty('planningSelection');
    const next = await buildContext(input, store);
    expect(() => assertReviewedContext(next, context)).not.toThrow();
    sessions.save(session.id, session.revision, {
      stage: 'scope',
      brief: { confirmed: '웹', openQuestions: '', assumptions: '' },
    });
    expect(() =>
      assertReviewedContext(
        { ...next, planningContext: { ...next.planningContext!, stage: 'scope' } },
        context,
      ),
    ).toThrow(/변경/);
    await expect(buildContext({ ...input, mode: 'documents' }, store)).rejects.toThrow();
    await expect(buildContext({ ...input, flowId: null }, store)).rejects.toThrow();
  } finally {
    store.close();
    await rm(root, { recursive: true, force: true });
  }
});

it('retains whole Korean turns locally when long history is omitted from a bounded request', async () => {
  const root = await mkdtemp(join(tmpdir(), 'docflow-planning-long-'));
  const store = await ProjectStore.open(root);
  try {
    const sessions = new PlanningSessionStore(store),
      session = sessions.start('plan');
    for (const [id, text] of [
      ['old', '오래된 대화 👩‍💻'.repeat(500)],
      ['new', '최근 답변: 로그인 없음'],
    ]) {
      sessions.attachRequest(session.id, id);
      store.put('message', { id, role: 'user', text, requestId: id, createdAt: '' });
    }
    const context = await buildContext(
      {
        mode: 'idea',
        instruction: '계획해줘',
        selectedIds: [],
        excludedIds: [],
        planningSessionId: session.id,
        maxCharacters: 1600,
      },
      store,
    );
    expect(context.planningContext?.messages.map((m) => m.text)).toEqual([
      '최근 답변: 로그인 없음',
    ]);
    expect(context.planningSelection?.omittedMessageIds).toEqual(['old']);
    expect(JSON.stringify(contextPayload(context)).length).toBeLessThanOrEqual(1600);
    expect(store.workspace().messages).toHaveLength(2);
    const suggestion = { confirmed: 'AI 제안', openQuestions: '', assumptions: '가정' };
    expect(
      planningResponseSchema.parse({
        message: '검토해 주세요',
        proposals: [],
        planningSuggestion: suggestion,
      }).planningSuggestion,
    ).toEqual(suggestion);
    expect(planningOutputSchema.required).toContain('planningSuggestion');
  } finally {
    store.close();
    await rm(root, { recursive: true, force: true });
  }
});

it('allows only same-session create proposal revisions and rejection review in planning', async () => {
  const root = await mkdtemp(join(tmpdir(), 'docflow-planning-revision-'));
  const store = await ProjectStore.open(root);
  try {
    const sessions = new PlanningSessionStore(store);
    const session = sessions.start('plan');
    const input = {
      mode: 'idea' as const,
      instruction: '수정해줘',
      selectedIds: [],
      excludedIds: [],
      planningSessionId: session.id,
      planningAction: 'draft' as const,
    };
    const original = await buildContext(input, store);
    const proposal = {
      id: 'proposal',
      kind: 'create',
      status: 'pending',
      snapshotId: original.id,
      title: '개요',
      targetId: null,
    };
    store.put('proposal', proposal);
    const revision = await buildContext(input, store, proposal.id);
    expect(revision.revisionProposal?.id).toBe(proposal.id);
    const other = sessions.start('plan');
    await expect(
      buildContext({ ...input, planningSessionId: other.id }, store, proposal.id),
    ).rejects.toThrow();
    store.put('proposal', { ...proposal, status: 'rejected' });
    store.put('feedback', { id: 'feedback', proposalId: proposal.id, reason: '범위 축소' });
    const feedback = await buildContext(input, store, undefined, 'feedback');
    expect(feedback.rejectedProposal?.rejectionReason).toBe('범위 축소');
    store.put('proposal', { ...proposal, kind: 'update' });
    await expect(buildContext(input, store, proposal.id)).rejects.toThrow();
  } finally {
    store.close();
    await rm(root, { recursive: true, force: true });
  }
});
