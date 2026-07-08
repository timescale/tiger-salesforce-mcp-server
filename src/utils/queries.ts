import { Pool } from 'pg';
import {
  Account,
  AccountContact,
  AccountQueryById,
  AccountsQueryWithCriteria,
  Churn,
  Email,
  accountCoreFields,
  accountLocationFields,
  accountPlanDetailsFields,
  accountRevenueFields,
  accountUsageFields,
  emailFields,
} from '../types.js';
import { log } from '@tigerdata/mcp-boilerplate';

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
): Promise<Account | null>;
export async function queryAccounts(
  pool: Pool,
  params: AccountsQueryWithCriteria,
): Promise<Account[]>;
export async function queryAccounts(
  pool: Pool,
  params: AccountQueryById | AccountsQueryWithCriteria,
): Promise<Account | Account[] | null> {
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

  // Prefix a schema-derived field with `a.`, casting `number_of_employees` to
  // integer since Salesforce stores it as text.
  const asAccountCol = (c: string): string =>
    c === 'number_of_employees' ? 'a.number_of_employees::integer' : `a.${c}`;

  const result = await pool.query<Account>(
    /* sql */ `
SELECT
  ${[
    ...accountCoreFields.map(asAccountCol),
    ...(includePlanDetails ? accountPlanDetailsFields.map(asAccountCol) : []),
    ...(includeRevenue ? accountRevenueFields.map(asAccountCol) : []),
    ...(includeLocation ? accountLocationFields.map(asAccountCol) : []),
    ...(includeInternalContacts
      ? [
          'lse.name AS lead_support_engineer_name',
          'ps.name AS product_sponsor_name',
          'csm.name AS customer_success_manager_name',
          'ae.name AS account_executive_name',
        ]
      : []),
    ...(includeUsage ? accountUsageFields.map(asAccountCol) : []),
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
 
WHERE NOT COALESCE(a.is_deleted, false) AND
  ${
    singleAccount
      ? 'a.id = $1'
      : (({ dateType }): string => {
          const col =
            dateType === 'mstCustomerStart'
              ? 'a.mst_customer_start_date_c'
              : dateType === 'trialStart'
                ? 'a.trial_start_date_c'
                : 'a.customer_start_date_c';
          return `((a.name ILIKE '%' || $1 || '%') OR $1 IS NULL)
  AND (${col} >= $2 OR $2 IS NULL)
  AND (${col} <= $3 OR $3 IS NULL)`;
        })(params)
  }
ORDER BY a.name
`,
    singleAccount
      ? [params.accountId]
      : [params.nameKeyword, params.dateRangeStart, params.dateRangeEnd],
  );
  //Customer_Start_Date__c, MST_Customer_Start_Date__c, Trial_Start_Date__c
  if (singleAccount) {
    if (result?.rowCount && result.rowCount > 1) {
      throw new Error(
        `Found multiple accounts matching id ${params.accountId}`,
      );
    }
    return null;
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
