import { z } from 'zod';
import { openai } from '@ai-sdk/openai';
import { embed } from 'ai';
import { ApiFactory } from '../shared/boilerplate/src/types.js';
import { ServerContext } from '../types.js';

const inputSchema = {
  limit: z.coerce
    .number()
    .min(1)
    .optional()
    .default(10)
    .describe('The maximum number of matches to return. Defaults to 10.'),
  prompt: z
    .string()
    .min(1)
    .describe(
      'The natural language query used to search the TimescaleDB documentation for relevant information.',
    ),
} as const;

const zEmbeddedDoc = z.object({
  case_id: z.string().describe('The unique identifier of the case summary.'),
  summary: z.string().describe('The content of the case summary.'),
  distance: z
    .number()
    .describe(
      'The distance score indicating the relevance of the entry to the prompt. Lower values indicate higher relevance.',
    ),
});

type EmbeddedDoc = z.infer<typeof zEmbeddedDoc>;

const outputSchema = {
  results: z.array(zEmbeddedDoc),
} as const;

export const semanticSearchSalesforceCaseSummariesFactory: ApiFactory<
  ServerContext,
  typeof inputSchema,
  typeof outputSchema,
  z.infer<(typeof outputSchema)['results']>
> = ({ pgPool }) => ({
  name: 'semanticSearchSalesforceCaseSummaries',
  method: 'get',
  route: '/semantic-search/salesforce-case-summaries',
  config: {
    title: 'Semantic Search of Salesforce Case Summaries',
    description:
      'This retrieves relevant Salesforce support case summaries based on a natural language query. Use this to find solutions to problems experienced by our customers in the past.',
    inputSchema,
    outputSchema,
  },
  fn: async ({ prompt, limit }) => {
    const { embedding } = await embed({
      model: openai.embedding('text-embedding-3-small'),
      value: prompt,
    });

    const result = await pgPool.query<EmbeddedDoc>(
      /* sql */ `
WITH distances AS (
  SELECT
    case_id,
    summary,
    embedding <=> $1::vector(1536) AS distance
  FROM public.case_summary_embedding
),
ranked AS (
  SELECT
    case_id,
    summary,
    distance,
    ROW_NUMBER() OVER (PARTITION BY case_id ORDER BY distance) as rn
  FROM distances
)
SELECT case_id, summary, distance
FROM ranked
WHERE rn = 1
ORDER BY distance
LIMIT $2
`,
      [JSON.stringify(embedding), limit],
    );

    return {
      results: result.rows,
    };
  },
  pickResult: (r) => r.results,
});
