import { ApiFactory, InferSchema, log } from '@tigerdata/mcp-boilerplate';
import { z } from 'zod';
import {
  CaseAttachment,
  CaseDetails,
  caseDetailsFields,
  CaseDetailsWithUrl,
  CaseRow,
  Email,
  EmailOutput,
  ServerContext,
  zCaseAttachment,
  zCaseDetailsWithUrl,
  zEmailOutput,
} from '../types.js';
import {
  getCaseAttachments,
  getCaseDetails,
  getCaseEmails,
} from '../utils/salesforce.js';

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
} as const;

const outputSchema = {
  case: zCaseDetailsWithUrl,
  emails: z
    .array(zEmailOutput)
    .nullish()
    .describe('Array of email messages in chronological order'),
  attachments: z
    .array(zCaseAttachment)
    .describe(
      'Files reachable from the Case — attached directly or via any of its EmailMessages. Deduped by (title, size, content type); inline signature images are dropped. Use `download_case_attachment` with each `{kind, download_id}` to fetch bytes.',
    ),
} as const;

export const getCaseDetailsFactory: ApiFactory<
  ServerContext,
  typeof inputSchema,
  typeof outputSchema
> = ({ salesforceClientFactory }) => ({
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
    let caseRow: CaseRow | null = null;
    let emails: Email[] | null = null;
    const salesforceClient = await salesforceClientFactory();
    log.info('Querying with Salesforce API', {
      caseIdOrNumber: case_id_or_number,
    });

    caseRow = await getCaseDetails(salesforceClient, case_id_or_number);

    if (!caseRow) {
      throw new Error(`No case found with identifier: ${case_id_or_number}.`);
    }

    emails = await getCaseEmails(salesforceClient, caseRow.id);

    const attachments: CaseAttachment[] = await getCaseAttachments(
      salesforceClient,
      caseRow.id,
    );

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

    // it might worth nulling the case description if we have emails as the original email's body should be equivalent to the case description
    const emailOutputs: EmailOutput[] | null =
      emails?.map((email) => {
        const bodyToUse = email.html_body || email.text_body;
        const body = (bodyToUse ? parseEmailReply(bodyToUse) : null)?.trim();

        return {
          from_address: email.from_address,
          created_date: email.created_date,
          body,
        };
      }) ?? null;

    return {
      case: filterNulls(caseData),
      emails: emailOutputs,
      attachments,
    };
  },
});

const filterNulls = <T extends Record<string, null | unknown>>(
  collection: T,
): T =>
  Object.fromEntries(
    Object.entries(collection).filter(([, value]) => value != null),
  ) as T;
