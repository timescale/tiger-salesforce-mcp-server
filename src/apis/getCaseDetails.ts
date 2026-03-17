import { ApiFactory, InferSchema, log } from '@tigerdata/mcp-boilerplate';
import { z } from 'zod';
import {
  CaseDetails,
  caseDetailsFields,
  CaseDetailsWithUrl,
  CaseRow,
  Email,
  ServerContext,
  zCaseDetailsWithUrl,
  zEmail,
} from '../types.js';
import { getCaseDetails, getCaseEmails } from '../utils/salesforce.js';
import { queryEmails } from '../utils/queries.js';

// Pattern used to separate original message in Salesforce emails
const originalMessagePattern = /[-_]{10,}\s*Original Message\s*[-_]{10,}/i;

// Strip out the Salesforce reply quotes
// Handles "--------------- Original Message ---------------" separator
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
} as const;

const outputSchema = {
  case: zCaseDetailsWithUrl,
  emails: z
    .array(zEmail)
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
  }): Promise<InferSchema<typeof outputSchema>> => {
    const result = await pgPool.query<CaseRow>(
      /* sql */ `
SELECT
  -- Case fields
  ${caseDetailsFields.join('\n  , ')}
FROM salesforce.case
WHERE id = $1 OR case_number = $1
LIMIT 0
`,
      [case_id_or_number],
    );

    let caseRow: CaseRow | null = null;
    let emails: Email[] | null = null;

    // if the case exists in our db, use the results
    if (result.rows.length) {
      caseRow = result.rows[0];
      emails = await queryEmails(pgPool, caseRow.id);
    }
    // otherwise, if we have salesforce credentials, let's fetch directly
    // from Salesforce
    else if (salesforceClientFactory) {
      log.info('Case not found in db, using Salesforce API', {
        caseIdOrNumber: case_id_or_number,
      });

      caseRow = await getCaseDetails(case_id_or_number);

      if (!caseRow) {
        throw new Error(
          `No case found with identifier: ${case_id_or_number}. Please verify the case ID/number and try again.`,
        );
      }

      emails = await getCaseEmails(salesforceClientFactory, caseRow.id);
    } else {
      throw new Error('Could not find case in database.');
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

    emails?.forEach((email) => {
      const text = email.text_body ? parseEmailReply(email.text_body) : null;

      if (text === caseData.description?.trim()) {
        caseData.description = null;
      }

      email.text_body = text;
    });

    return {
      case: filterNulls(caseData),
      emails: emails,
    };
  },
});

const filterNulls = <T extends Record<string, null | unknown>>(
  collection: T,
): T =>
  Object.fromEntries(
    Object.entries(collection).filter(([, value]) => value != null),
  ) as T;
