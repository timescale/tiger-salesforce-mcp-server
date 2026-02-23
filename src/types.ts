import type { Pool } from 'pg';
import z from 'zod';

export interface ServerContext extends Record<string, unknown> {
  pgPool: Pool;
}

export const zCaseSummary = z.object({
  case_id: z.string().describe('The unique identifier of the case.'),
  summary: z.string().describe('The content of the case summary.'),
  updated_at: z.coerce
    .date()
    .nullish()
    .describe('The datetime of when the case summary was last updated.'),
  url: z.string().optional().describe('The URL of the case summary.'),
});

export type CaseSummary = z.infer<typeof zCaseSummary>;

export const zCaseSummaryWithSemanticDistance = z.object({
  ...zCaseSummary.shape,
  distance: z
    .number()
    .describe(
      'The distance score indicating the relevance of the entry to the prompt. Lower values indicate higher relevance.',
    )
    .nullish(),
});

export type CaseSummaryWithSemanticDistance = z.infer<
  typeof zCaseSummaryWithSemanticDistance
>;
