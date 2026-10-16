import { expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ProjectStore } from '../../src/main/project/store';
import { PlanningSessionStore } from '../../src/main/project/planning';
import { isPlanningStart } from '../../src/shared/planning';

it('persists planning independently, rejects stale edits and restores pending suggestions without confirming them', async () => {
  const root = await mkdtemp(join(tmpdir(), 'docflow-planning-store-'));
  let store = await ProjectStore.open(join(root, 'one'));
  const other = await ProjectStore.open(join(root, 'two'));
  try {
    expect(store.workspace().planningSessions).toEqual([]);
    await store.createDocument('빈 문서', 'note');
    expect(isPlanningStart(store.workspace().documents)).toBe(true);
    const sessions = new PlanningSessionStore(store);
    const first = sessions.start('brainstorm'),
      second = sessions.start('plan');
    expect(first.stage).toBe('problem');
    expect(second.stage).toBe('scope');
    const brief = {
      confirmed: '대상 사용자는 운영자',
      openQuestions: '성공 기준은?',
      assumptions: '웹 기반',
    };
    const saved = sessions.save(first.id, first.revision, { stage: 'requirements', brief });
    expect(() => sessions.save(first.id, first.revision, { stage: 'scope', brief })).toThrow(
      /변경/,
    );
    expect(() => new PlanningSessionStore(other).read(first.id)).toThrow(/찾|프로젝트/);
    sessions.attachRequest(first.id, 'request-one');
    sessions.suggest(first.id, saved.revision, 'request-one', {
      ...brief,
      confirmed: 'AI의 미확정 제안',
    });
    expect(sessions.read(first.id).brief.confirmed).toBe('대상 사용자는 운영자');
    expect(() => sessions.suggest(first.id, saved.revision, 'foreign', brief)).toThrow();
    store.close();
    store = await ProjectStore.open(join(root, 'one'));
    const restored = new PlanningSessionStore(store).read(first.id);
    expect(restored.stage).toBe('requirements');
    expect(restored.brief).toEqual(brief);
    expect(restored.requestIds).toEqual(['request-one']);
    expect(restored.pendingBrief?.confirmed).toBe('AI의 미확정 제안');
    expect(store.workspace().planningSessions).toHaveLength(2);
    expect(new PlanningSessionStore(other).list()).toEqual([]);
  } finally {
    store.close();
    other.close();
    await rm(root, { recursive: true, force: true });
  }
});
