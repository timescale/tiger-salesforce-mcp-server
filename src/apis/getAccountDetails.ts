import { ApiFactory, InferSchema } from '@tigerdata/mcp-boilerplate';
import { z } from 'zod';
import {
  Account,
  ServerContext,
  zAccountContactInformation,
  zAccountCore,
  zAccountLocationInformation,
  zAccountPlanDetails,
  zAccountRevenueInformation,
  zAccountUsageInformation,
} from '../types.js';
import { queryAccounts } from '../utils/queries.js';

const inputSchema = {
  account_id: z
    .string()
    .min(1)
    .describe(
      'The Salesforce Account ID to retrieve. Either account_id or account_keyword is required.',
    ),
  includePlanDetails: z
    .boolean()
    .describe(
      'Include plan and account health details (status, tier, stage, health, NPS score, plan type, churn risk, billing category, use case, industry tag, MST flag, and customer dates).',
    ),
  includeRevenue: z
    .boolean()
    .describe(
      'Include revenue information (MRR, ARR, LTV, estimated revenue).',
    ),
  includeLocation: z
    .boolean()
    .describe('Include billing and shipping address information.'),
  includeContacts: z
    .boolean()
    .describe(
      'Include contacts within the account organization. This requires extra querying and tokens and should only be used if trying to find a contact within the client company.',
    ),
  includeUsage: z
    .boolean()
    .describe(
      'Include cloud usage information (services, storage, CPU, trial status, etc.).',
    ),
} as const;

const outputSchema = {
  account: z
    .object({
      ...zAccountCore.shape,
      ...zAccountPlanDetails.shape,
      ...zAccountRevenueInformation.shape,
      ...zAccountLocationInformation.shape,
      ...zAccountContactInformation.shape,
      ...zAccountUsageInformation.shape,
    })
    .partial()
    .required({ id: true }),
  url: z.string().optional().describe('URL to view the account in Salesforce'),
} as const;

export const getAccountDetailsFactory: ApiFactory<
  ServerContext,
  typeof inputSchema,
  typeof outputSchema
> = ({ pgPool }) => ({
  name: 'get_account_details',
  method: 'get',
  route: '/account-details',
  config: {
    title: 'Get Salesforce Account Details',
    description: `
Retrieve details for a single Salesforce account by ID.

Always returns: name, type, website, industry, number of employees, description, and the names of the CSM, lead support engineer, product sponsor, and account executive.

Optional groups (pass true to include):
- includePlanDetails: account status, annual revenue, NPS score, tier, stage, health, customer dates, churn risk, plan type, free plan dates, billing category, use case, industry tag, MST flag
- includeRevenue: MRR, ARR, LTV
- includeLocation: billing and shipping addresses
- includeContacts: all associated contacts within the account's organization
- includeUsage: cloud services, storage, CPU, trial status, and project/service IDs

Always link to the account using the returned \`url\`.
`.trim(),
    inputSchema,
    outputSchema,
  },
  fn: async ({
    account_id,
    includePlanDetails,
    includeRevenue,
    includeLocation,
    includeContacts,
    includeUsage,
  }): Promise<InferSchema<typeof outputSchema>> => {
    const account = await queryAccounts(pgPool, {
      singleAccount: true,
      accountId: account_id,
      includePlanDetails,
      includeInternalContacts: true,
      includeContacts,
      includeLocation,
      includeRevenue,
      includeUsage,
    });

    return {
      account,
      url: process.env.SALESFORCE_DOMAIN
        ? `https://${process.env.SALESFORCE_DOMAIN}/lightning/r/Account/${account.id}/view`
        : undefined,
    };
  },
});
