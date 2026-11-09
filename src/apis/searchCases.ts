import { ApiFactory, InferSchema } from '@tigerdata/mcp-boilerplate';
import { z } from 'zod';
import {
  CaseSearchResult,
  ServerContext,
  zCaseSearchResult,
  zSearchCaseSchema,
} from '../types.js';

const inputSchema = zSearchCaseSchema.extend({
  keyword: z
    .string()
    .min(1)
    .nullable()
    .describe(
      'The natural language query used to search the TimescaleDB documentation for relevant information.',
    ),
  status: z
    .string()
    .nullable()
    .describe(
      'The case status to filter on (e.g. New, Waiting on Customer, Waiting on Timescale, Spam).',
    ),
  priority: z
    .string()
    .nullable()
    .describe('The case priority to filter on (e.g. Low, Medium, High).'),
  includeClosed: z
    .boolean()
    .nullable()
    .describe(
      'When true, closed cases are included alongside open ones. Defaults to false (open cases only). Prefer search_case_summaries for closed cases — it searches richer summaries semantically.',
    ),
}).shape;

const outputSchema = {
  results: z.array(zCaseSearchResult),
  url_template: z
    .string()
    .optional()
    .describe(
      'URL template to use to link to Salesforce cases. Substitute {case_id} with the actual case ID.',
    ),
} as const;

export const searchCasesFactory: ApiFactory<
  ServerContext,
  typeof inputSchema,
  typeof outputSchema
> = ({ pgPool }) => ({
  name: 'search_cases',
  method: 'get',
  route: '/search/cases',
  config: {
    title: 'Search Salesforce Cases',
    description: `
Search open (not closed) Salesforce support cases using any combination of parameters:
- Filter by customer account id (will always be set on case and is the best way to find cases for a particular customer)
- Filter by customer project id (this is optional on cases, but can be used to find cases that are specific to a project within a customer account)
- Filter by customer service id (this is optional on cases, but can be used to find cases for a specific TimescaleDB instance within a customer account project)
- Filter by \`status\` and/or \`priority\`
- Filter by date range using \`timestampStart\` and/or \`timestampEnd\` (based on when the case was last modified)
- Literal keyword match against the case subject and description via \`keyword\`

Results are returned in descending order of when the case was last modified.

Use this tool for cases that are still open. Closed cases are summarized and embedded, so use \`search_case_summaries\` to search those — it offers semantic (\`prompt\`) search over the generated summaries, which this tool cannot do because open cases have no summary yet. Set \`includeClosed\` to true only when you specifically need a keyword or filter match across both open and closed cases.

This returns a compact row per case for triage. Follow up with \`get_case_details\` using a returned \`case_id\` to read the full case and its email thread.

Always cite your sources.
When mentioning a case in your response, format it as an inline link, as supported by the response platform.
Always use the provided \`url_template\` to create a link to the original case by its \`case_id\`.
`.trim(),
    inputSchema,
    outputSchema,
  },
  fn: async ({
    accountId,
    limit,
    projectId,
    keyword,
    serviceId,
    status,
    priority,
    includeClosed,
    timestampStart,
    timestampEnd,
  }): Promise<InferSchema<typeof outputSchema>> => {
    const result = await pgPool.query<CaseSearchResult>(
      /* sql */ `
SELECT
  c.id AS case_id,
  c.case_number,
  c.subject,
  c.status,
  c.internal_status_c,
  c.priority,
  c.severity_c,
  c.account_id,
  a.name AS account_name,
  c.cloud_project_id_c,
  c.cloud_service_id_c,
  u.name AS owner_name,
  c.created_date,
  c.last_modified_date
FROM salesforce."case" AS c
LEFT JOIN salesforce.account AS a ON a.id = c.account_id
LEFT JOIN salesforce.user AS u ON u.id = c.owner_id
WHERE NOT COALESCE(c.is_deleted, false)
  AND ($1::BOOLEAN IS TRUE OR NOT COALESCE(c.is_closed, false))
  AND ($2::TIMESTAMPTZ IS NULL OR c.last_modified_date >= $2::TIMESTAMPTZ)
  AND ($3::TIMESTAMPTZ IS NULL OR c.last_modified_date <= $3::TIMESTAMPTZ)
  AND ($4::TEXT IS NULL OR lower(c.cloud_project_id_c) = $4::TEXT)

  -- the service id field can be a comma delimited list
  AND ($5::TEXT IS NULL OR c.cloud_service_id_c ILIKE '%'||$5::TEXT||'%')
  AND ($6::TEXT IS NULL OR c.account_id = $6::TEXT)
  AND ($7::TEXT IS NULL OR c.status = $7::TEXT)
  AND ($8::TEXT IS NULL OR c.priority = $8::TEXT)
  AND ($9::TEXT IS NULL
    OR c.subject ILIKE '%'||$9::TEXT||'%'
    OR c.description ILIKE '%'||$9::TEXT||'%')
ORDER BY c.last_modified_date DESC NULLS LAST
LIMIT $10
`,
      [
        includeClosed,
        timestampStart?.toISOString(),
        timestampEnd?.toISOString(),
        projectId?.toLowerCase(),
        serviceId,
        accountId,
        status,
        priority,
        keyword,
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
