import { ApiFactory, InferSchema } from '@tigerdata/mcp-boilerplate';
import { z } from 'zod';
import { Churn, ServerContext, zChurn } from '../types.js';

const inputSchema = {
  accountIds: z
    .array(z.string())
    .nullable()
    .describe('Optional list of account IDs to filter churn records by'),
  churnStatus: z
    .string()
    .nullable()
    .describe(
      'Optional churn status to filter by (e.g. Churned, Mitigation, Unengaged, Churn Avoided)',
    ),
  timestampStart: z.coerce
    .date()
    .nullable()
    .describe(
      'Optional start date for the expected churn date range. Filters on the expected_churn_date_c column. Defaults to one month ago.',
    ),
  timestampEnd: z.coerce
    .date()
    .nullable()
    .describe(
      'Optional end date for the expected churn date range. Filters on the expected_churn_date_c column. When null, defaults to no upper bound.',
    ),
} as const;

const outputSchema = {
  results: z.array(
    z.object({
      ...zChurn.shape,
      account_c: z.string().describe('The account ID this churn record belongs to'),
      account_name: z.string().nullish().describe('The name of the account'),
    }),
  ),
} as const;

type ChurnWithAccount = Churn & { account_c: string; account_name: string | null };

export const searchChurnInformationFactory: ApiFactory<
  ServerContext,
  typeof inputSchema,
  typeof outputSchema
> = ({ pgPool }) => ({
  name: 'search_churn_information',
  method: 'get',
  route: '/search/churn-information',
  config: {
    title: 'Search Churn Information',
    description: `
Search Salesforce churn records from the churn_c table using any combination of optional filters:
- Filter by one or more account IDs
- Filter by churn status (e.g. Churned, Mitigation, Unengaged, Churn Avoided)
- Filter by expected churn date range using \`timestampStart\` and/or \`timestampEnd\`

Results are ordered by expected churn date descending (most recent first).
`.trim(),
    inputSchema,
    outputSchema,
  },
  fn: async ({
    accountIds,
    churnStatus,
    timestampStart,
    timestampEnd,
  }): Promise<InferSchema<typeof outputSchema>> => {
    const result = await pgPool.query<ChurnWithAccount>(
      /* sql */ `
SELECT
  c.id,
  c.name,
  c.churn_status_c,
  c.churn_impact_arr_c,
  c.expected_churn_date_c::text,
  c.churn_reason_c,
  c.churn_competitor_c_c,
  c.churn_mitigation_plan_c,
  c.churn_discovery_notes_c,
  c.account_c,
  a.name AS account_name
FROM salesforce.churn_c c
LEFT JOIN salesforce.account a ON a.id = c.account_c
WHERE NOT COALESCE(c._fivetran_deleted, false)
  AND ($1::TEXT[] IS NULL OR c.account_c = ANY($1::TEXT[]))
  AND ($2::TEXT IS NULL OR c.churn_status_c = $2::TEXT)
  AND ($3::TIMESTAMPTZ IS NULL OR c.expected_churn_date_c >= $3::TIMESTAMPTZ)
  AND ($3::TIMESTAMPTZ IS NOT NULL OR c.expected_churn_date_c >= NOW() - INTERVAL '1 month')
  AND ($4::TIMESTAMPTZ IS NULL OR c.expected_churn_date_c <= $4::TIMESTAMPTZ)
ORDER BY c.expected_churn_date_c DESC NULLS LAST
`,
      [
        accountIds,
        churnStatus,
        timestampStart?.toISOString(),
        timestampEnd?.toISOString(),
      ],
    );

    return { results: result.rows };
  },
});
