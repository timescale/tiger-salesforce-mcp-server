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

const inputSchema = {
  account_id: z
    .string()
    .min(1)
    .describe(
      'The Salesforce Account ID to retrieve. Either account_id or account_keyword is required.',
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
      'Include contacts, CSM, lead support engineer, and product sponsor.',
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
Retrieve details for a Salesforce account by ID or fuzzy name match.

Always returns: name, type, website, industry, annual revenue, number of employees, description, Slack channel, NPS score, tier, stage, health, customer dates, churn risk, plan type, free plan dates, billing category, use case, industry tag, MST flag, and the names of the CSM, lead support engineer, product sponsor, and account executive.

Optional groups (pass true to include):
- includeRevenue: MRR, ARR, LTV
- includeLocation: billing and shipping addresses
- includeContacts: all associated contacts
- includeUsage: cloud services, storage, CPU, trial status, and project/service IDs

Always link to the account using the returned \`url\`.
`.trim(),
    inputSchema,
    outputSchema,
  },
  fn: async ({
    account_id,
    includeRevenue,
    includeLocation,
    includeContacts,
    includeUsage,
  }): Promise<InferSchema<typeof outputSchema>> => {
    const result = await pgPool.query<Account>(
      /* sql */ `
SELECT
  -- Core (always returned)
  a.id,
  a.name,
  a.type,
  a.website,
  a.industry,
  a.account_status_c,
  a.description,
  a.number_of_employees::integer,
  a.annual_revenue,
  a.nps_score_c,
  a.account_tier_c,
  a.account_stage_c,
  a.account_health_c,
  a.customer_start_date_c,
  a.customer_end_date_c,
  a.churn_risk_c,
  a.plan_type_c,
  a.free_plan_started_c,
  a.free_plan_conversion_date_c,
  a.billing_category_c,
  a.customer_use_case_c,
  a.company_industry_tag_c,
  a.mst_c,

  ${
    includeRevenue
      ? `a.current_billable_mrr_c,
  a.arr_as_of_last_month_c,
  a.lifetime_value_c,`
      : ''
  }
  ${
    includeLocation
      ? `a.billing_street,
  a.billing_city,
  a.billing_state,
  a.billing_postal_code,
  a.billing_country,
  a.billing_country_code,
  a.shipping_street,
  a.shipping_city,
  a.shipping_state,
  a.shipping_postal_code,
  a.shipping_country,`
      : ''
  }


  -- Named relationships (resolved to names)
  lse.name AS lead_support_engineer_name,
  ps.name AS product_sponsor_name,
  csm.name AS customer_success_manager_name,
  ae.name as account_executive_name

  ${
    includeUsage
      ? `, a.actively_consuming_c,
  a.cloud_provider_c,
  a.number_of_services_c,
  a.size_of_services_c,
  a.project_id_c,
  a.service_id_c,
  a.total_active_storage_c,
  a.total_active_cpu_c,
  a.weekly_page_views_c,
  a.cloud_trial_c`
      : ''
  }

FROM salesforce.account a
  LEFT JOIN salesforce.user lse ON lse.id = a.lead_support_engineer_c
  LEFT JOIN salesforce.user ps ON ps.id = a.product_sponsor_c
  LEFT JOIN salesforce.user csm ON csm.id = a.customer_success_manager_c
  LEFT join salesforce.user ae on ae.id = a.owner_id
WHERE NOT COALESCE(a.is_deleted, false)
  AND a.id = $1
ORDER BY a.name
`,
      [account_id],
    );

    if (result.rows.length === 0) {
      throw new Error(
        `No account found${account_id ? ` for id: ${account_id}` : ''}`,
      );
    }

    const account = result.rows[0];

    if (includeContacts) {
      const contactResult = await pgPool.query<Omit<Account, 'contacts'>>(
        /* sql */ `
SELECT
  id,
  first_name,
  last_name,
  title,
  email,
  phone,
  support_contact_c
FROM salesforce.contact
WHERE account_id = $1
  AND NOT COALESCE(is_deleted, false)
ORDER BY last_name, first_name
`,
        [account.id],
      );
      account.contacts = contactResult.rows;
    }

    return {
      account: filterNulls(account) as InferSchema<
        typeof outputSchema
      >['account'],
      url: process.env.SALESFORCE_DOMAIN
        ? `https://${process.env.SALESFORCE_DOMAIN}/lightning/r/Account/${account.id}/view`
        : undefined,
    };
  },
});

const filterNulls = <T extends Record<string, unknown>>(obj: T): T =>
  Object.fromEntries(
    Object.entries(obj).filter(([, value]) => value != null),
  ) as T;
