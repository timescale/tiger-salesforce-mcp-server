import { ApiFactory, InferSchema, log } from '@tigerdata/mcp-boilerplate';
import { z } from 'zod';
import {
  CaseDetails,
  caseDetailsFields,
  CaseDetailsWithUrl,
  CaseRow,
  Email,
  EmailOutput,
  ServerContext,
  zCaseDetailsWithUrl,
  zEmailOutput,
} from '../types.js';
import { getCaseDetails, getCaseEmails } from '../utils/salesforce.js';
import { queryEmails } from '../utils/queries.js';

// Matches "--------------- Original Message ---------------" in plain text or HTML
const originalMessagePattern = /[-]{5,}\s*Original Message\s*[-]{5,}/i;

// Strip quoted reply history from an email body (plain text or HTML).
function parseEmailReply(text: string | null): string | null {
  const trimmed = text?.trim();
  if (!trimmed) return null;

  const match = trimmed.search(originalMessagePattern);
  if (match >= 0) {
    return trimmed.substring(0, match).trim();
  }

  return trimmed;
}

const inputSchema = {
  case_id_or_number: z
    .string()
    .regex(
      /^([a-zA-Z0-9]{18}|\d+)$/,
      'case_id must be either an 18-character Salesforce case ID (e.g. "0053s000004R2WwAAK") or a numeric case number (e.g. "00037312")',
    )
    .describe(
      'The unique identifier of the Salesforce case to retrieve details for. This can either be the case id (e.g. "0053s000004R2WwAAK") or the case number (e.g. "00037312")',
    ),
  query_salesforce_directly: z
    .boolean()
    .describe(
      'Whether or not to use Salesforce directly. If false, will query the database that has Salesforce data synced to it every 5 hours. If true, will get realtime data from Salesforce.',
    ),
} as const;

const outputSchema = {
  case: zCaseDetailsWithUrl,
  emails: z
    .array(zEmailOutput)
    .nullish()
    .describe('Array of email messages in chronological order'),
} as const;

export const getCaseDetailsFactory: ApiFactory<
  ServerContext,
  typeof inputSchema,
  typeof outputSchema
> = ({ pgPool, salesforceClientFactory }) => ({
  name: 'get_case_details',
  method: 'get',
  route: '/case-details',
  config: {
    title: 'Get Salesforce Case Details',
    description:
      'This retrieves complete details for a specific Salesforce support case, including all metadata and the complete email conversation thread. Be sure to create a link to the case in your response, using the returned `url`.',
    inputSchema,
    outputSchema,
  },
  fn: async ({
    case_id_or_number,
    query_salesforce_directly,
  }): Promise<InferSchema<typeof outputSchema>> => {
    let caseRow: CaseRow | null = null;
    let emails: Email[] | null = null;

    if (query_salesforce_directly && salesforceClientFactory) {
      const client = await salesforceClientFactory();
      log.info('Querying with Salesforce API', {
        caseIdOrNumber: case_id_or_number,
      });

      caseRow = await getCaseDetails(client, case_id_or_number);

      if (!caseRow) {
        throw new Error(
          `No case found with identifier: ${case_id_or_number}. Please verify the case ID/number and try again.`,
        );
      }

      emails = await getCaseEmails(client, caseRow.id);
    } else {
      const result = await pgPool.query<CaseRow>(
        /* sql */ `
SELECT
  -- Case fields
  ${caseDetailsFields.join('\n  , ')}
FROM salesforce.case
WHERE id = $1 OR case_number = $1
LIMIT 1
`,
        [case_id_or_number],
      );

      // if the case exists in our db, use the results
      if (result.rows.length) {
        caseRow = result.rows[0];
        emails = await queryEmails(pgPool, caseRow.id);
      }
    }

    if (!caseRow) {
      throw new Error(
        'Could not find case in database, try again using Salesforce API directly.',
      );
    }

    const caseData: CaseDetailsWithUrl = caseDetailsFields.reduce(
      (acc, key) => {
        const value = caseRow[key as keyof CaseRow];
        const converted =
          value instanceof Date ? value.toISOString() : (value ?? null);

        // Use explicit type assertion for the specific field
        (acc as Record<typeof key, typeof converted>)[key] = converted;
        return acc;
      },
      {} as Partial<CaseDetails>,
    ) as CaseDetails;

    const caseId = caseData.id;
    if (process.env.SALESFORCE_DOMAIN && caseId) {
      caseData.url = `https://${process.env.SALESFORCE_DOMAIN}/lightning/r/Case/${caseId}/view`;
    }

    const emailOutputs: EmailOutput[] | null =
      emails?.map((email) => {
        const bodyToUse = email.html_body || email.text_body;
        const body = (bodyToUse ? parseEmailReply(bodyToUse) : null)?.trim();

        const textBody = email.text_body ? parseEmailReply(email.text_body)?.trim() : null;
        if (textBody === caseData.description?.trim()) {
          caseData.description = null;
        }

        return {
          from_address: email.from_address,
          created_date: email.created_date,
          body,
        };
      }) ?? null;

    return {
      case: filterNulls(caseData),
      emails: emailOutputs,
    };
  },
});

const filterNulls = <T extends Record<string, null | unknown>>(
  collection: T,
): T =>
  Object.fromEntries(
    Object.entries(collection).filter(([, value]) => value != null),
  ) as T;
