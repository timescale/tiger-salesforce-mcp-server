import { openai } from '@ai-sdk/openai';
import { ApiFactory, InferSchema } from '@tigerdata/mcp-boilerplate';
import { embed } from 'ai';
import { z } from 'zod';
import {
  CaseSummaryWithSemanticDistance,
  ServerContext,
  zCaseSummaryWithSemanticDistance,
} from '../types.js';

const inputSchema = {
  limit: z.coerce
    .number()
    .min(1)
    .nullable()
    .describe('The maximum number of matches to return. Defaults to 10.'),
  serviceId: z
    .string()
    .min(10)
    .nullable()
    .describe('The service id to filter on.'),
  projectId: z
    .string()
    .min(10)
    .nullable()
    .describe('The project id to filter on.'),
  prompt: z
    .string()
    .min(1)
    .nullable()
    .describe(
      'The natural language query used to search the TimescaleDB documentation for relevant information.',
    ),
  timestampStart: z.coerce
    .date()
    .nullable()
    .describe(
      'Optional start date for the case summary range. Filters on the updated at column. When null, will include all historic data.',
    ),
  timestampEnd: z.coerce
    .date()
    .nullable()
    .describe(
      'Optional end date for the message range. Filters on the updated at column. Defaults to the current time.',
    ),
} as const;

const outputSchema = {
  results: z.array(zCaseSummaryWithSemanticDistance),
  url_template: z
    .string()
    .optional()
    .describe(
      'URL template to use to link to Salesforce cases. Substitute {case_id} with the actual case ID.',
    ),
} as const;

export const searchCaseSummaries: ApiFactory<
  ServerContext,
  typeof inputSchema,
  typeof outputSchema
> = ({ pgPool }) => ({
  name: 'search_case_summaries',
  method: 'get',
  route: '/search/case-summaries',
  config: {
    title: 'Search Salesforce Case Summaries',
    description: `
Search Salesforce support case summaries using any combination of parameters:
- Natural language semantic search via \`prompt\`
- Filter by project ID or service ID
- Filter by date range using \`timestampStart\` and/or \`timestampEnd\` (based on when the case summary was last updated)

Use this to find cases relevant to a customer issue, a specific project or service, or cases updated within a given time window.

Always cite your sources.
When mentioning a case in your response, format it as an inline link, as supported by the response platform.
Always use the provided \`url_template\` to create a link to the original case by its \`case_id\`.
`.trim(),
    inputSchema,
    outputSchema,
  },
  fn: async ({
    prompt,
    limit,
    projectId,
    serviceId,
    timestampStart,
    timestampEnd,
  }): Promise<InferSchema<typeof outputSchema>> => {
    const hasSemanticSearch = !!prompt;

    const { embedding } = hasSemanticSearch
      ? await embed({
          model: openai.embedding('text-embedding-3-small'),
          value: prompt,
        })
      : { embedding: null };

    const result = await pgPool.query<CaseSummaryWithSemanticDistance>(
      /* sql */ `
WITH distances AS (
  SELECT
    cs.case_id,
    summary,
    cs.updated_at,
    CASE WHEN $1::vector(1536) IS NULL THEN NULL ELSE embedding <=> $1::vector(1536) END AS distance
  FROM public.case_summary_embedding as cs
  JOIN salesforce."case" AS c
      ON c.id = cs.case_id
  WHERE
    (($2::TIMESTAMPTZ IS NULL) OR cs.updated_at >= $2::TIMESTAMPTZ)
    AND ($3::TIMESTAMPTZ IS NULL OR cs.updated_at <= $3::TIMESTAMPTZ)
    AND ($4::TEXT IS NULL OR lower(c.cloud_project_id_c) = $4::TEXT)

    -- the service id field can be a comma delimited list
    AND ($5::TEXT IS NULL OR c.cloud_service_id_c ILIKE '%'||$5::text||'%')
),
ranked AS (
  SELECT
    case_id,
    summary,
    updated_at,
    distance,
    ROW_NUMBER() OVER (PARTITION BY case_id ORDER BY distance NULLS LAST, case_id) as rn
  FROM distances
)
SELECT case_id, summary, distance, updated_at
FROM ranked
WHERE rn = 1
${hasSemanticSearch ? 'ORDER BY distance' : 'ORDER BY updated_at DESC'}
LIMIT $6
`,
      [
        hasSemanticSearch ? JSON.stringify(embedding) : null,
        timestampStart?.toISOString(),
        timestampEnd?.toISOString(),
        projectId,
        serviceId,
        limit || 10,
      ],
    );

    return {
      results: result.rows,
      url_template: process.env.SALESFORCE_DOMAIN
        ? `https://${process.env.SALESFORCE_DOMAIN}/lightning/r/Case/{case_id}/view`
        : undefined,
    };
  },
});
