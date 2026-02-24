import { ApiFactory, InferSchema } from '@tigerdata/mcp-boilerplate';
import { z } from 'zod';
import {
  Account,
  ServerContext,
  zAccountContactInformation,
  zAccountCore,
  zAccountLocationInformation,
  zAccountRevenueInformation,
  zAccountUsageInformation,
} from '../types.js';
import { queryAccounts } from '../utils/queries.js';

const inputSchema = {
  name: z
    .string()
    .min(1)
    .describe('Keyword to use to do a fuzzy search on Account name'),
} as const;

const outputSchema = {
  accounts: z.array(zAccountCore),
  url_template: z
    .string()
    .optional()
    .describe('URL template to view the accounts in Salesforce'),
} as const;

export const getAccountsFactory: ApiFactory<
  ServerContext,
  typeof inputSchema,
  typeof outputSchema
> = ({ pgPool }) => ({
  name: 'get_accounts',
  method: 'get',
  route: '/accounts',
  config: {
    title: 'Get Salesforce Accounts',
    description: `
Search for Salesforce accounts matching a keyword. Use this tool to find the account ID for a given company name.

Returns minimal account information (id, name, type, website, industry) — not full account details. If more details are needed, use the get_account_details tool as a follow-up with the returned account ID.
`.trim(),
    inputSchema,
    outputSchema,
  },
  fn: async ({ name }): Promise<InferSchema<typeof outputSchema>> => {
    const accounts = await queryAccounts(pgPool, {
      singleAccount: false,
      nameKeyword: name,
    });

    return {
      accounts,
      url_template: process.env.SALESFORCE_DOMAIN
        ? 'https://${process.env.SALESFORCE_DOMAIN}/lightning/r/Account/${account.id}/view'
        : undefined,
    };
  },
});
