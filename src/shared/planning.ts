import { z } from 'zod';
import type { Document } from './contracts';
import { hasSourceEvidence } from './context-payload';

export const planningModeSchema = z.enum(['brainstorm', 'plan']);
export const planningStageSchema = z.enum([
  'problem',
  'scope',
  'requirements',
  'scenarios',
  'implementation',
]);
export const planningBriefSchema = z
  .object({
    confirmed: z.string().max(4000),
    openQuestions: z.string().max(4000),
    assumptions: z.string().max(4000),
  })
  .strict();
export const planningPatchSchema = z
  .object({ stage: planningStageSchema, brief: planningBriefSchema })
  .strict();
export type PlanningMode = z.infer<typeof planningModeSchema>;
export type PlanningStage = z.infer<typeof planningStageSchema>;
export type PlanningBrief = z.infer<typeof planningBriefSchema>;
export type PlanningPatch = z.infer<typeof planningPatchSchema>;
export const planningSessionSchema = planningPatchSchema.extend({
  id: z.string().min(1).max(250),
  projectId: z.string().min(1).max(250),
  mode: planningModeSchema,
  revision: z.string().min(1),
  requestIds: z.array(z.string().min(1)),
  pendingBrief: planningBriefSchema.optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type PlanningSession = z.infer<typeof planningSessionSchema>;
export const planningStages: Record<PlanningStage, string> = {
  problem: '문제 정의',
  scope: 'MVP 범위',
  requirements: '요구사항 분석',
  scenarios: '사용자 시나리오',
  implementation: '구현·검증 계획',
};
export function isPlanningStart(documents: Pick<Document, 'markdown' | 'title'>[]): boolean {
  return documents.every(({ markdown }) => {
    const content = markdown
      .replace(/<!--\s*docflow-(?:id|section):[\s\S]*?-->/g, '')
      .replace(/^docflow-id:.*$/gm, '')
      .replace(/^---\s*$/gm, '')
      .trim();
    return !hasSourceEvidence(content.replace(/^#\s+[^\r\n]+\s*$/, ''));
  });
}
export interface PlanningContext {
  sessionId: string;
  revision: string;
  mode: PlanningMode;
  stage: PlanningStage;
  brief: PlanningBrief;
  action: 'discuss' | 'draft';
  messages: Array<{ id: string; role: 'user' | 'assistant'; text: string; requestId: string }>;
}
export interface PlanningSelection {
  includedMessageIds: string[];
  omittedMessageIds: string[];
  usedCharacters: number;
  limit: number;
}
