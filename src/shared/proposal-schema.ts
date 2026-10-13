import { z } from 'zod';
export const documentTypeSchema = z.enum(['overview', 'prd', 'feature', 'flow', 'design', 'note']);
export const proposalDraftSchema = z.object({
  kind: z.enum(['create', 'update', 'diagram', 'decision']), title: z.string().min(1).max(200),
  documentType: documentTypeSchema, targetId: z.string().nullable(), baseRevision: z.string().nullable(),
  replacement: z.string().min(1).max(150000), sourceIds: z.array(z.string()).max(100),
  reason: z.string().min(1).max(5000), dependencyIds: z.array(z.string()).max(20)
}).strict();
export const responseSchema = z.object({ message: z.string().max(30000), proposals: z.array(proposalDraftSchema).max(8) }).strict();
export const outputSchema = z.toJSONSchema(responseSchema);
