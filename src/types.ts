import type { Pool } from 'pg';
import z from 'zod';

export interface ServerContext extends Record<string, unknown> {
  pgPool: Pool;
}

const zEmbeddedDoc = z.object({
  case_id: z.string().describe('The unique identifier of the case summary.'),
  summary: z.string().describe('The content of the case summary.'),
  distance: z
    .number()
    .describe(
      'The distance score indicating the relevance of the entry to the prompt. Lower values indicate higher relevance.',
    )
    .nullish(),
});

export type EmbeddedDoc = z.infer<typeof zEmbeddedDoc>;
