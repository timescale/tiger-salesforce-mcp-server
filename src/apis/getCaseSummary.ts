import { ApiFactory, InferSchema } from '@tigerdata/mcp-boilerplate';
import {
  CaseSummary,
  ServerContext,
  zCaseSummary,
  zGetCaseSchema,
} from '../types.js';
import { addUrlToCaseSummary } from '../utils/addUrlToCaseSummary.js';

const outputSchema = {
  result: zCaseSummary,
} as const;

export const getCaseSummaryFactory: ApiFactory<
  ServerContext,
  typeof zGetCaseSchema,
  typeof outputSchema
> = ({ pgPool }) => ({
  name: 'get_case_summary',
  method: 'get',
  route: '/case-summary',
  config: {
    title: 'Get Salesforce Case Summary',
    description:
      'This retrieves the summary for a specific closed Salesforce support case. Be sure to create a link to the case in your response, using the returned `url`. Note: summaries are only created for cases that are closed. Use the get_case_details tool to retrieve information for a non-closed case.',
    inputSchema: zGetCaseSchema,
    outputSchema,
  },
  fn: async ({
    case_id_or_number,
  }): Promise<InferSchema<typeof outputSchema>> => {
    const result = await pgPool.query<CaseSummary>(
      /* sql */ `
SELECT case_id, summary, updated_at
FROM public.case_summary
WHERE case_id = $1 or case_number = $1
`,
      [case_id_or_number],
    );

    const [row] = result.rows;

    if (!row) {
      throw new Error(
        `No case summary found for case_id_or_number: ${case_id_or_number}. The summary may not have been generated yet. Double-check the id, and try again later.`,
      );
    }

    return {
      result: addUrlToCaseSummary(row),
    };
  },
});
