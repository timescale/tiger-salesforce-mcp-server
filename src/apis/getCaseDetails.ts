import { ApiFactory, InferSchema, log } from '@tigerdata/mcp-boilerplate';
import { z } from 'zod';
import {
  CaseDetails,
  caseDetailsFields,
  CaseDetailsWithUrl,
  CaseRow,
  ServerContext,
  zCaseDetailsWithUrl,
} from '../types.js';
import { getCaseDetails } from '../utils/salesforce.js';

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

// Define the email schema
const zEmail = z.object({
  from_address: z.string().nullish().describe('The sender email address'),
  created_date: z.string().nullish().describe('When the email was sent'),
  body: z
    .string()
    .nullish()
    .describe('The email body (with reply parsing applied)'),
});

const outputSchema = {
  case: zCaseDetailsWithUrl,
  emails: z
    .array(zEmail)
    .describe('Array of email messages in chronological order'),
} as const;

export const getCaseDetailsFactory: ApiFactory<
  ServerContext,
  typeof inputSchema,
  typeof outputSchema
> = ({ pgPool }) => ({
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
  ${caseDetailsFields.map((field) => `c.${field}`).join('\n  , ')}
  -- Email fields
  , e.id as email_id
  , e.from_address as email_from_address
  , e.created_date as email_created_date
  , e.text_body as email_text_body
FROM salesforce.case c
LEFT JOIN salesforce.email_message e ON e.parent_id = c.id
WHERE c.id = $1 OR c.case_number = $1
ORDER BY e.created_date ASC NULLS FIRST
`,
      [case_id_or_number],
    );

    let row: CaseRow | null = null;
    if (result.rows.length === 0) {
      log.warn('Case not found in db, using Salesforce API', {
        caseIdOrNumber: case_id_or_number,
      });

      row = await getCaseDetails(case_id_or_number);

      if (!row) {
        throw new Error(
          `No case found with identifier: ${case_id_or_number}. Please verify the case ID/number and try again.`,
        );
      }
    } else {
      row = result.rows[0];
    }

    // Extract case data from the first row (all rows have the same case data)

    const caseData: CaseDetailsWithUrl = caseDetailsFields.reduce(
      (acc, key) => {
        const value = row[key as keyof CaseRow];
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

    // Extract and parse emails
    const emails = result.rows
      .filter((row) => row.email_id !== null) // Filter out rows with no email
      .map((row) => {
        const body = parseEmailReply(row.email_text_body);

        return {
          from_address: row.email_from_address,
          created_date: row.email_created_date?.toISOString() ?? null,
          body,
        };
      });

    // Avoid duplicating the original message
    if (emails[0]?.body === caseData.description?.trim()) {
      caseData.description = null;
    }

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
