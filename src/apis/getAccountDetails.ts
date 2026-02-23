import { ApiFactory, InferSchema } from '@tigerdata/mcp-boilerplate';
import { z } from 'zod';
import {
  AccountContact,
  ServerContext,
  zAccountContact,
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
    .nullable()
    .describe('The Salesforce Account ID to retrieve. Either account_id or account_keyword is required.'),
  account_keyword: z
    .string()
    .min(1)
    .nullable()
    .describe('Fuzzy keyword to match against the account name. Either account_id or account_keyword is required.'),
  includeRevenue: z
    .boolean()
    .nullable()
    .describe('Include revenue information (MRR, ARR, LTV, estimated revenue).'),
  includeLocation: z
    .boolean()
    .nullable()
    .describe('Include billing and shipping address information.'),
  includeContacts: z
    .boolean()
    .nullable()
    .describe('Include contacts, CSM, lead support engineer, and product sponsor.'),
  includeUsage: z
    .boolean()
    .nullable()
    .describe('Include cloud usage information (services, storage, CPU, trial status, etc.).'),
} as const;

const outputSchema = {
  account: z.object({
    ...zAccountCore.shape,
    ...zAccountRevenueInformation.shape,
    ...zAccountLocationInformation.shape,
    ...zAccountContactInformation.shape,
    ...zAccountUsageInformation.shape,
  }).partial().required({ id: true }),
  url: z.string().optional().describe('URL to view the account in Salesforce'),
} as const;

type AccountRow = {
  // Core
  id: string;
  name: string | null;
  type: string | null;
  website: string | null;
  industry: string | null;
  description: string | null;
  number_of_employees: number | null;
  annual_revenue: number | null;
  private_slack_channel_c: string | null;
  nps_score_c: number | null;
  account_tier_c: string | null;
  account_stage_c: string | null;
  account_health_c: string | null;
  customer_start_date_c: Date | null;
  customer_end_date_c: Date | null;
  churn_risk_c: boolean | null;
  // Revenue
  current_billable_mrr_c: number | null;
  arr_as_of_last_month_c: number | null;
  estimated_revenue_c: number | null;
  lifetime_value_c: number | null;
  // Location
  billing_street: string | null;
  billing_city: string | null;
  billing_state: string | null;
  billing_postal_code: string | null;
  billing_country: string | null;
  billing_country_code: string | null;
  shipping_street: string | null;
  shipping_city: string | null;
  shipping_state: string | null;
  shipping_postal_code: string | null;
  shipping_country: string | null;
  // Contact info (denormalized from joins)
  lead_support_engineer_name: string | null;
  product_sponsor_name: string | null;
  customer_success_manager_name: string | null;
  // Usage
  actively_consuming_c: boolean | null;
  cloud_provider_c: string | null;
  number_of_services_c: number | null;
  size_of_services_c: string | null;
  cloud_project_id_c: string | null;
  cloud_service_id_c: string | null;
  total_active_storage_c: number | null;
  total_active_cpu_c: number | null;
  weekly_page_views_c: number | null;
  cloud_trial_c: boolean | null;
  // Contact rows
  contact_id: string | null;
  contact_first_name: string | null;
  contact_last_name: string | null;
  contact_title: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  contact_support_contact_c: boolean | null;
};

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

Always returns: name, type, website, industry, annual revenue, number of employees, description, Slack channel, NPS score, tier, stage, health, and customer dates.

Optional groups (pass true to include):
- includeRevenue: MRR, ARR, LTV, estimated revenue
- includeLocation: billing and shipping addresses
- includeContacts: CSM, lead support engineer, product sponsor, and all associated contacts
- includeUsage: cloud services, storage, CPU, trial status, and project/service IDs

Always link to the account using the returned \`url\`.
`.trim(),
    inputSchema,
    outputSchema,
  },
  fn: async ({
    account_id,
    account_keyword,
    includeRevenue,
    includeLocation,
    includeContacts,
    includeUsage,
  }): Promise<InferSchema<typeof outputSchema>> => {
    if (!account_id && !account_keyword) {
      throw new Error('Either account_id or account_keyword must be provided.');
    }

    const result = await pgPool.query<AccountRow>(
      /* sql */ `
SELECT
  -- Core (always returned)
  a.id,
  a.name,
  a.type,
  a.website,
  a.industry,
  a.description,
  a.number_of_employees,
  a.annual_revenue,
  a.private_slack_channel_c,
  a.nps_score_c,
  a.account_tier_c,
  a.account_stage_c,
  a.account_health_c,
  a.customer_start_date_c,
  a.customer_end_date_c,
  a.churn_risk_c,

  -- Revenue
  a.current_billable_mrr_c,
  a.arr_as_of_last_month_c,
  a.estimated_revenue_c,
  a.lifetime_value_c,

  -- Location
  a.billing_street,
  a.billing_city,
  a.billing_state,
  a.billing_postal_code,
  a.billing_country,
  a.billing_country_code,
  a.shipping_street,
  a.shipping_city,
  a.shipping_state,
  a.shipping_postal_code,
  a.shipping_country,

  -- Named relationships (resolved to names)
  lse.name AS lead_support_engineer_name,
  ps.name AS product_sponsor_name,
  csm.name AS customer_success_manager_name,

  -- Usage
  a.actively_consuming_c,
  a.cloud_provider_c,
  a.number_of_services_c,
  a.size_of_services_c,
  a.cloud_project_id_c,
  a.cloud_service_id_c,
  a.total_active_storage_c,
  a.total_active_cpu_c,
  a.weekly_page_views_c,
  a.cloud_trial_c,

  -- Contacts (one row per contact)
  con.id AS contact_id,
  con.first_name AS contact_first_name,
  con.last_name AS contact_last_name,
  con.title AS contact_title,
  con.email AS contact_email,
  con.phone AS contact_phone,
  con.support_contact_c AS contact_support_contact_c

FROM salesforce.account a
  LEFT JOIN salesforce.user lse ON lse.id = a.lead_support_engineer_c
  LEFT JOIN salesforce.user ps ON ps.id = a.product_sponsor_c
  LEFT JOIN salesforce.user csm ON csm.id = a.customer_success_manager_c
  LEFT JOIN salesforce.contact con
    ON con.account_id = a.id
    AND NOT COALESCE(con.is_deleted, false)
WHERE NOT COALESCE(a.is_deleted, false)
  AND (
    ($1::TEXT IS NULL OR a.id = $1)
    AND ($2::TEXT IS NULL OR a.name ILIKE '%' || $2 || '%')
  )
ORDER BY a.name, con.last_name, con.first_name
`,
      [account_id ?? null, account_keyword ?? null],
    );

    if (result.rows.length === 0) {
      throw new Error(
        `No account found${account_id ? ` for id: ${account_id}` : ''}${account_keyword ? ` matching: "${account_keyword}"` : ''}. Please verify and try again.`,
      );
    }

    const firstRow = result.rows[0];

    // Build core account fields (always included)
    const account: Record<string, unknown> = {
      id: firstRow.id,
      name: firstRow.name,
      type: firstRow.type,
      website: firstRow.website,
      industry: firstRow.industry,
      description: firstRow.description,
      number_of_employees: firstRow.number_of_employees,
      annual_revenue: firstRow.annual_revenue,
      private_slack_channel_c: firstRow.private_slack_channel_c,
      nps_score_c: firstRow.nps_score_c,
      account_tier_c: firstRow.account_tier_c,
      account_stage_c: firstRow.account_stage_c,
      account_health_c: firstRow.account_health_c,
      customer_start_date_c: firstRow.customer_start_date_c ?? null,
      customer_end_date_c: firstRow.customer_end_date_c ?? null,
      churn_risk_c: firstRow.churn_risk_c,
    };

    if (includeRevenue) {
      account.current_billable_mrr_c = firstRow.current_billable_mrr_c;
      account.arr_as_of_last_month_c = firstRow.arr_as_of_last_month_c;
      account.estimated_revenue_c = firstRow.estimated_revenue_c;
      account.lifetime_value_c = firstRow.lifetime_value_c;
    }

    if (includeLocation) {
      account.billing_street = firstRow.billing_street;
      account.billing_city = firstRow.billing_city;
      account.billing_state = firstRow.billing_state;
      account.billing_postal_code = firstRow.billing_postal_code;
      account.billing_country = firstRow.billing_country;
      account.billing_country_code = firstRow.billing_country_code;
      account.shipping_street = firstRow.shipping_street;
      account.shipping_city = firstRow.shipping_city;
      account.shipping_state = firstRow.shipping_state;
      account.shipping_postal_code = firstRow.shipping_postal_code;
      account.shipping_country = firstRow.shipping_country;
    }

    if (includeContacts) {
      account.lead_support_engineer_c = firstRow.lead_support_engineer_name;
      account.product_sponsor_c = firstRow.product_sponsor_name;
      account.customer_success_manager_c = firstRow.customer_success_manager_name;

      const seen = new Set<string>();
      const contacts: AccountContact[] = [];
      for (const row of result.rows) {
        if (row.contact_id && !seen.has(row.contact_id)) {
          seen.add(row.contact_id);
          contacts.push(
            zAccountContact.parse({
              id: row.contact_id,
              first_name: row.contact_first_name,
              last_name: row.contact_last_name,
              title: row.contact_title,
              email: row.contact_email,
              phone: row.contact_phone,
              support_contact_c: row.contact_support_contact_c,
            }),
          );
        }
      }
      account.contacts = contacts;
    }

    if (includeUsage) {
      account.actively_consuming_c = firstRow.actively_consuming_c;
      account.cloud_provider_c = firstRow.cloud_provider_c;
      account.number_of_services_c = firstRow.number_of_services_c;
      account.size_of_services_c = firstRow.size_of_services_c;
      account.cloud_project_id_c = firstRow.cloud_project_id_c;
      account.cloud_service_id_c = firstRow.cloud_service_id_c;
      account.total_active_storage_c = firstRow.total_active_storage_c;
      account.total_active_cpu_c = firstRow.total_active_cpu_c;
      account.weekly_page_views_c = firstRow.weekly_page_views_c;
      account.cloud_trial_c = firstRow.cloud_trial_c;
    }

    return {
      account: filterNulls(account) as InferSchema<typeof outputSchema>['account'],
      url: process.env.SALESFORCE_DOMAIN
        ? `https://${process.env.SALESFORCE_DOMAIN}/lightning/r/Account/${firstRow.id}/view`
        : undefined,
    };
  },
});

const filterNulls = <T extends Record<string, unknown>>(obj: T): T =>
  Object.fromEntries(
    Object.entries(obj).filter(([, value]) => value != null),
  ) as T;
