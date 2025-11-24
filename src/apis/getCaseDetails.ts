import { ApiFactory, InferSchema } from '@tigerdata/mcp-boilerplate';
import { z } from 'zod';
import { ServerContext } from '../types.js';

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
  case_id: z
    .string()
    .min(1)
    .describe(
      'The unique identifier of the Salesforce case to retrieve details for.',
    ),
} as const;

// Define the case fields schema
const zCaseDetails = z.object({
  id: z.string().describe('The unique case identifier'),
  case_number: z.string().nullish().describe('The case number'),
  subject: z.string().nullish().describe('The case subject'),
  status: z.string().nullish().describe('The case status'),
  is_closed: z.boolean().nullish().describe('Whether the case is closed'),
  description: z.string().nullish().describe('The original email message'),
  supplied_email: z
    .string()
    .nullish()
    .describe('The email address of the person who submitted the case'),
  owner_id: z.string().nullish().describe('The ID of the case owner'),
  account_id: z
    .string()
    .nullish()
    .describe('The account ID associated with the case'),
  created_date: z.string().nullish().describe('When the case was created'),
  closed_date: z.string().nullish().describe('When the case was closed'),

  // Cloud-related fields
  cloud_region_c: z.string().nullish().describe('Cloud region'),
  cloud_project_id_c: z.string().nullish().describe('Cloud project ID'),
  cloud_service_id_c: z.string().nullish().describe('Cloud service ID'),
  cloud_impact_c: z
    .string()
    .nullish()
    .describe(
      'Cloud impact level (Production Down / Production Impaired / Just a Question)',
    ),
  cloud_is_production_c: z
    .boolean()
    .nullish()
    .describe('Whether this is a production issue'),

  // Case details
  product_area_c: z.string().nullish().describe('Product area'),
  platform_name_c: z
    .string()
    .nullish()
    .describe('Platform name (Cloud / MST / PopSQL)'),
  impact_c: z.string().nullish().describe('Impact level'),
  supergeo_c: z.string().nullish().describe('Geographic identifier'),
  problem_description_c: z.string().nullish().describe('Problem description'),
  troubleshooting_steps_taken_c: z
    .string()
    .nullish()
    .describe('Troubleshooting steps taken'),
  final_resolution_c: z.string().nullish().describe('Final resolution'),

  // Additional metadata
  csm_case_c: z.boolean().nullish().describe('Whether this is a CSM case'),
  dev_help_links_c: z.string().nullish().describe('Developer help links'),
  parent_case_c: z.string().nullish().describe('Parent case ID'),
  priority: z.string().nullish().describe('Case priority'),
  severity_c: z.string().nullish().describe('Case severity'),
  internal_status_c: z.string().nullish().describe('Internal status'),

  // CSAT details
  csat_response_c: z.string().nullish().describe('CSAT response'),
  csatdetail_c: z.string().nullish().describe('CSAT details'),
});
type CaseDetails = z.infer<typeof zCaseDetails>;
const caseDetailsFields = zCaseDetails.keyof().options;

const zCaseDetailsWithUrl = zCaseDetails.extend({
  url: z.string().optional().describe('The URL to view the case in Salesforce'),
});
type CaseDetailsWithUrl = z.infer<typeof zCaseDetailsWithUrl>;

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

type CaseRow = {
  // Case fields
  id: string;
  case_number: string | null;
  subject: string | null;
  status: string | null;
  is_closed: boolean | null;
  description: string | null;
  supplied_email: string | null;
  owner_id: string | null;
  account_id: string | null;
  created_date: Date | null;
  closed_date: Date | null;
  cloud_region_c: string | null;
  cloud_project_id_c: string | null;
  cloud_service_id_c: string | null;
  cloud_impact_c: string | null;
  cloud_is_production_c: boolean | null;
  product_area_c: string | null;
  platform_name_c: string | null;
  impact_c: string | null;
  supergeo_c: string | null;
  problem_description_c: string | null;
  troubleshooting_steps_taken_c: string | null;
  final_resolution_c: string | null;
  csm_case_c: boolean | null;
  dev_help_links_c: string | null;
  parent_case_c: string | null;
  priority: string | null;
  severity_c: string | null;
  internal_status_c: string | null;
  csat_response_c: string | null;
  csatdetail_c: string | null;

  // Email fields (will be null if no emails)
  email_id: string | null;
  email_from_address: string | null;
  email_created_date: Date | null;
  email_text_body: string | null;
};

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
  fn: async ({ case_id }): Promise<InferSchema<typeof outputSchema>> => {
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
      [case_id],
    );

    if (result.rows.length === 0) {
      throw new Error(
        `No case found for case_id: ${case_id}. Please verify the case ID and try again.`,
      );
    }

    // Extract case data from the first row (all rows have the same case data)
    const [row] = result.rows;
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
    if (process.env.SALESFORCE_DOMAIN) {
      caseData.url = `https://${process.env.SALESFORCE_DOMAIN}/lightning/r/Case/${case_id}/view`;
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
