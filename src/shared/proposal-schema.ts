import { z } from 'zod';
export const documentTypeSchema = z.enum(['overview', 'prd', 'feature', 'flow', 'design', 'note']);
const documentProposalSchema = z
  .object({
    kind: z.enum(['create', 'update', 'diagram', 'decision']),
    title: z.string().min(1).max(200),
    documentType: documentTypeSchema,
    targetId: z.string().nullable(),
    baseRevision: z.string().nullable(),
    replacement: z.string().min(1).max(150000),
    sourceIds: z.array(z.string()).max(100),
    reason: z.string().min(1).max(5000),
    dependencyIds: z.array(z.string()).max(20),
  })
  .strict();
const relationProposalSchema = documentProposalSchema.extend({
  kind: z.literal('relation'),
  targetId: z.null(),
  baseRevision: z.null(),
  relation: z
    .object({
      fromId: z.string().min(1).max(250),
      toId: z.string().min(1).max(250),
      relationType: z.string().trim().min(1).max(80),
      fromRevision: z.string().min(1).max(250),
      toRevision: z.string().min(1).max(250),
    })
    .strict(),
});
export const proposalDraftSchema = z.union([documentProposalSchema, relationProposalSchema]);
export const responseSchema = z
  .object({ message: z.string().max(30000), proposals: z.array(proposalDraftSchema).max(8) })
  .strict();
export const outputSchema = z.toJSONSchema(responseSchema);
