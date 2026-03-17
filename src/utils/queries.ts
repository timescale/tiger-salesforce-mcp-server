import { Pool } from 'pg';
import {
  Account,
  AccountContact,
  Churn,
  Email,
  emailFields,
} from '../types.js';
import { log } from '@tigerdata/mcp-boilerplate';

interface AccountQueryOptions {
  includePlanDetails?: boolean;
  includeRevenue?: boolean;
  includeLocation?: boolean;
  includeInternalContacts?: boolean;
  includeContacts?: boolean;
  includeUsage?: boolean;
  includeChurnInformation?: boolean;
}

interface AccountQueryById extends AccountQueryOptions {
  singleAccount: true;
  accountId: string;
}

interface AccountQueryByKeyword extends AccountQueryOptions {
  singleAccount: false;
  nameKeyword: string;
}

export const queryChurn = async (
  pool: Pool,
  accountId: string,
): Promise<Churn[]> => {
  const result = await pool.query<Churn>(
    /* sql */ `
SELECT
  id,
  name,
  churn_status_c,
  churn_impact_arr_c,
  expected_churn_date_c::text,
  churn_reason_c,
  churn_competitor_c_c,
  churn_mitigation_plan_c,
  churn_discovery_notes_c
FROM salesforce.churn_c
WHERE account_c = $1
  AND NOT COALESCE(_fivetran_deleted, false)
ORDER BY created_date DESC
`,
    [accountId],
  );

  return result.rows;
};

export const queryContacts = async (
  pool: Pool,
  accountId: string | string[],
): Promise<Record<string, AccountContact[]>> => {
  const accountIds = typeof accountId === 'string' ? [accountId] : accountId;
  const contactResults = await pool.query<AccountContact>(
    /* sql */ `
SELECT
  id,
  first_name,
  last_name,
  title,
  email,
  phone,
  support_contact_c,
  account_id
FROM salesforce.contact
WHERE account_id = ANY($1)
  AND NOT COALESCE(is_deleted, false)
ORDER BY last_name, first_name
`,
    [accountIds],
  );

  return contactResults.rows.reduce<Record<string, AccountContact[]>>(
    (acc, curr) => {
      acc[curr.account_id] ||= [];
      acc[curr.account_id].push(curr);
      return acc;
    },
    {},
  );
};

export const queryEmails = async (
  pool: Pool,
  caseId: string,
): Promise<Email[]> => {
  const emailResults = await pool.query<Email>(
    /* sql */ `
SELECT
  ${emailFields.join(',')}
FROM salesforce.email_message
WHERE parent_id = $1
  AND NOT COALESCE(is_deleted, false)
ORDER BY created_date desc
`,
    [caseId],
  );

  return emailResults.rows;
};

export async function queryAccounts(
  pool: Pool,
  params: AccountQueryById,
): Promise<Account>;
export async function queryAccounts(
  pool: Pool,
  params: AccountQueryByKeyword,
): Promise<Account[]>;
export async function queryAccounts(
  pool: Pool,
  params: AccountQueryById | AccountQueryByKeyword,
): Promise<Account | Account[]> {
  const {
    includeContacts,
    includeChurnInformation,
    includePlanDetails,
    includeInternalContacts,
    includeLocation,
    includeRevenue,
    includeUsage,
    singleAccount,
  } = params;

  const result = await pool.query<Account>(
    /* sql */ `
SELECT
  ${[
    'a.id',
    'a.name',
    'a.type',
    'a.website',
    'a.industry',
    'a.description',
    'a.number_of_employees::integer',
    ...(includePlanDetails
      ? [
          'a.account_status_c',
          'a.nps_score_c',
          'a.account_tier_c',
          'a.account_stage_c',
          'a.account_health_c',
          'a.customer_start_date_c',
          'a.customer_end_date_c',
          'a.plan_type_c',
          'a.free_plan_started_c',
          'a.free_plan_conversion_date_c',
          'a.billing_category_c',
          'a.customer_use_case_c',
          'a.company_industry_tag_c',
          'a.mst_c',
        ]
      : []),
    ...(includeRevenue
      ? [
          'a.annual_revenue',
          'a.current_billable_mrr_c',
          'a.arr_as_of_last_month_c',
          'a.lifetime_value_c',
        ]
      : []),
    ...(includeLocation
      ? [
          'a.billing_street',
          'a.billing_city',
          'a.billing_state',
          'a.billing_postal_code',
          'a.billing_country',
          'a.billing_country_code',
          'a.shipping_street',
          'a.shipping_city',
          'a.shipping_state',
          'a.shipping_postal_code',
          'a.shipping_country',
        ]
      : []),
    ...(includeInternalContacts
      ? [
          'lse.name AS lead_support_engineer_name',
          'ps.name AS product_sponsor_name',
          'csm.name AS customer_success_manager_name',
          'ae.name AS account_executive_name',
        ]
      : []),
    ...(includeUsage
      ? [
          'a.actively_consuming_c',
          'a.cloud_provider_c',
          'a.number_of_services_c',
          'a.size_of_services_c',
          'a.project_id_c',
          'a.service_id_c',
          'a.total_active_storage_c',
          'a.total_active_cpu_c',
          'a.weekly_page_views_c',
          'a.cloud_trial_c',
        ]
      : []),
  ].join(',\n  ')}
FROM salesforce.account a
${
  includeInternalContacts
    ? `LEFT JOIN salesforce.user lse ON lse.id = a.lead_support_engineer_c
  LEFT JOIN salesforce.user ps ON ps.id = a.product_sponsor_c
  LEFT JOIN salesforce.user csm ON csm.id = a.customer_success_manager_c
  LEFT JOIN salesforce.user ae ON ae.id = a.owner_id`
    : ''
}
 
WHERE NOT COALESCE(a.is_deleted, false)
  ${singleAccount ? 'AND a.id = $1' : "AND a.name ILIKE '%' || $1 || '%'"}
ORDER BY a.name
`,
    [singleAccount ? params.accountId : params.nameKeyword],
  );

  if (!result.rowCount) {
    throw new Error(
      `Could not find a matching account with ${singleAccount ? 'id' : 'name matching'} ${singleAccount ? params.accountId : params.nameKeyword}`,
    );
  }

  if (singleAccount) {
    if (result.rowCount > 1) {
      throw new Error(
        `Found multiple accounts matching id ${params.accountId}`,
      );
    }
  }

  const { rows: accounts } = result;
  if (includeChurnInformation && singleAccount) {
    accounts[0].churn = await queryChurn(pool, accounts[0].id);
  }

  if (includeContacts) {
    const contacts = await queryContacts(
      pool,
      accounts.map((x) => x.id),
    );

    accounts.forEach((account) => {
      const accountContacts = contacts[account.id];
      if (!accountContacts) {
        log.warn('Could not find contact results for account', {
          accountId: account.id,
        });
      } else {
        account.contacts = accountContacts;
      }
    });
  }

  return singleAccount ? result.rows[0] : result.rows;
}
