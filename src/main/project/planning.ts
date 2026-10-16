import { randomUUID } from 'node:crypto';
import type { ProjectStore } from './store';
import type { Project } from '../../shared/contracts';
import { revisionOf } from './markdown';
import {
  planningModeSchema,
  planningPatchSchema,
  planningBriefSchema,
  planningSessionSchema,
  type PlanningMode,
  type PlanningPatch,
  type PlanningBrief,
  type PlanningSession,
} from '../../shared/planning';

const revision = (session: Pick<PlanningSession, 'mode' | 'stage' | 'brief'>) =>
  revisionOf(JSON.stringify({ mode: session.mode, stage: session.stage, brief: session.brief }));
export class PlanningSessionStore {
  constructor(private store: ProjectStore) {}
  private get projectId() {
    return this.store.all<Project>('project')[0].id;
  }
  list(): PlanningSession[] {
    return this.store.all<unknown>('planning').flatMap((record) => {
      const result = planningSessionSchema.safeParse(record);
      return result.success && result.data.projectId === this.projectId ? [result.data] : [];
    });
  }
  read(id: string): PlanningSession {
    const session = this.list().find((item) => item.id === id);
    if (!session) throw new Error('이 프로젝트의 기획 세션을 찾을 수 없습니다.');
    return session;
  }
  start(mode: PlanningMode): PlanningSession {
    const parsed = planningModeSchema.parse(mode);
    const now = new Date().toISOString();
    const session: PlanningSession = {
      id: randomUUID(),
      projectId: this.projectId,
      mode: parsed,
      stage: parsed === 'brainstorm' ? 'problem' : 'scope',
      brief: { confirmed: '', openQuestions: '', assumptions: '' },
      revision: '',
      requestIds: [],
      createdAt: now,
      updatedAt: now,
    };
    session.revision = revision(session);
    this.store.put('planning', session);
    return session;
  }
  save(id: string, expectedRevision: string, patch: PlanningPatch): PlanningSession {
    return this.store.transaction(() => {
      const session = this.read(id);
      if (session.revision !== expectedRevision)
        throw new Error('기획이 변경되었습니다. 최신 내용을 확인해 주세요.');
      const next = {
        ...session,
        ...planningPatchSchema.parse(patch),
        updatedAt: new Date().toISOString(),
      };
      delete next.pendingBrief;
      next.revision = revision(next);
      this.store.put('planning', next);
      return next;
    });
  }
  attachRequest(id: string, requestId: string): void {
    const session = this.read(id);
    this.store.put('planning', {
      ...session,
      requestIds: [...new Set([...session.requestIds, requestId])],
      updatedAt: new Date().toISOString(),
    });
  }
  suggest(id: string, expectedRevision: string, requestId: string, brief: PlanningBrief): void {
    const session = this.read(id);
    if (session.revision !== expectedRevision || !session.requestIds.includes(requestId))
      throw new Error('기획이 변경되었거나 다른 세션의 응답입니다. 최신 기획을 확인해 주세요.');
    this.store.put('planning', {
      ...session,
      pendingBrief: planningBriefSchema.parse(brief),
      updatedAt: new Date().toISOString(),
    });
  }
}
