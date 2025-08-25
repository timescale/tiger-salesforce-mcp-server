import { z } from 'zod';
import { ApiFactory } from '../shared/boilerplate/src/types.js';
import { ServerContext } from '../types.js';

const inputSchema = {
  case_id: z
    .string()
    .min(1)
    .describe(
      'The unique identifier of the Salesforce case to retrieve the summary for.',
    ),
} as const;

const zCaseSummary = z.object({
  case_id: z.string().describe('The unique identifier of the case summary.'),
  summary: z.string().describe('The content of the case summary.'),
  url: z.string().optional().describe('The URL of the case summary.'),
});

type CaseSummary = z.infer<typeof zCaseSummary>;

const outputSchema = {
  result: zCaseSummary,
} as const;

export const getCaseSummaryFactory: ApiFactory<
  ServerContext,
  typeof inputSchema,
  typeof outputSchema
> = ({ pgPool }) => ({
  name: 'getCaseSummary',
  method: 'get',
  route: '/case-summary',
  config: {
    title: 'Get Salesforce Case Summary',
    description:
      'This retrieves the summary for a specific Salesforce support case.',
    inputSchema,
    outputSchema,
  },
  fn: async ({ case_id }) => {
    const result = await pgPool.query<CaseSummary>(
      /* sql */ `
SELECT case_id, summary
FROM public.case_summary
WHERE case_id = $1
`,
      [case_id],
    );

    const [row] = result.rows;

    if (!row) {
      throw new Error(
        `No case summary found for case_id: ${case_id}. The summary may not have been generated yet. Double-check the id, and try again later.`,
      );
    }

    return {
      result: process.env.SALESFORCE_DOMAIN
        ? {
            ...row,
            url: `https://${process.env.SALESFORCE_DOMAIN}/lightning/r/Case/${case_id}/view`,
          }
        : row,
    };
  },
});
