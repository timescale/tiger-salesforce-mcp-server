import { Connection } from 'jsforce';
import type { Pool } from 'pg';
import { z } from 'zod';

export interface ServerContext extends Record<string, unknown> {
  pgPool: Pool;
  salesforceClientFactory: (() => Promise<Connection>) | null;
}

export const zCaseSummary = z.object({
  case_id: z.string().describe('The unique identifier of the case.'),
  summary: z.string().describe('The content of the case summary.'),
  updated_at: z.coerce
    .date()
    .nullish()
    .describe('The datetime of when the case summary was last updated.'),
  url: z.string().optional().describe('The URL of the case summary.'),
});

export type CaseSummary = z.infer<typeof zCaseSummary>;

export const zCaseSummaryWithSemanticDistance = z.object({
  ...zCaseSummary.shape,
  distance: z
    .number()
    .describe(
      'The distance score indicating the relevance of the entry to the prompt. Lower values indicate higher relevance.',
    )
    .nullish(),
});

export type CaseSummaryWithSemanticDistance = z.infer<
  typeof zCaseSummaryWithSemanticDistance
>;

export const zAccountContact = z.object({
  account_id: z
    .string()
    .describe('The ID of the account that the contact belongs to.'),
  id: z.string().describe('Contact Salesforce ID'),
  first_name: z.string().nullish().describe('First name'),
  last_name: z.string().nullish().describe('Last name'),
  title: z.string().nullish().describe('Job title'),
  email: z.string().nullish().describe('Email address'),
  phone: z.string().nullish().describe('Phone number'),
  support_contact_c: z
    .boolean()
    .nullish()
    .describe('Is a designated support contact'),
});
export type AccountContact = z.infer<typeof zAccountContact>;
export const accountContactFields = zAccountContact.keyof().options;

export const zAccountCore = z.object({
  id: z.string().describe('Account Salesforce ID'),
  name: z.string().nullish().describe('Account / company name'),
  type: z.string().nullish().describe('Account type'),
  website: z.string().nullish().describe('Company website'),
  industry: z.string().nullish().describe('Industry classification'),
  description: z.string().nullish().describe('Account description'),
  number_of_employees: z.number().nullish().describe('Employee count'),
});

export const accountCoreFields = zAccountCore.keyof().options;
export type AccountCore = z.infer<typeof zAccountCore>;

export const zAccountInternalContact = z.object({
  lead_support_engineer_name: z
    .string()
    .nullish()
    .describe('Lead support engineer'),
  account_executive_name: z
    .string()
    .nullish()
    .describe('Account Executive/Owner (AE)'),
  product_sponsor_name: z.string().nullish().describe('Product sponsor'),
  customer_success_manager_name: z
    .string()
    .nullish()
    .describe('Customer success manager (CSM)'),
});

export const zAccountPlanDetails = z.object({
  account_status_c: z.string().nullish().describe('The status of the account'),
  nps_score_c: z.number().nullish().describe('NPS score (custom)'),
  account_tier_c: z.string().nullish().describe('Account tier (custom)'),
  account_stage_c: z
    .string()
    .nullish()
    .describe('Account lifecycle stage (custom)'),
  account_health_c: z
    .string()
    .nullish()
    .describe('Account health score (custom)'),
  customer_start_date_c: z.coerce
    .date()
    .transform((d) => d.toISOString())
    .nullish()
    .describe('Customer since (custom)'),
  customer_end_date_c: z.coerce
    .date()
    .transform((d) => d.toISOString())
    .nullish()
    .describe('Churned date, if applicable (custom)'),
  plan_type_c: z.string().nullish().describe('Type of plan'),
  free_plan_started_c: z.coerce
    .date()
    .transform((d) => d.toISOString())
    .nullish()
    .describe('When the free plan started'),
  free_plan_conversion_date_c: z.coerce
    .date()
    .transform((d) => d.toISOString())
    .nullish()
    .describe('When the free plan converted to a paid plan'),
  billing_category_c: z
    .string()
    .nullish()
    .describe('Describes the level e.g. performance / scale / enterprise'),
  customer_use_case_c: z.string().nullish().describe('The use case'),
  company_industry_tag_c: z
    .string()
    .nullish()
    .describe('Tags related to the company industry'),
  mst_c: z
    .boolean()
    .nullish()
    .describe(
      'Whether or not if the customer is MST. If true, customer is on a managed service, if false, customer is on a Cloud service.',
    ),
});
export const accountPlanDetailsFields = zAccountPlanDetails.keyof().options;
export type AccountPlanDetails = z.infer<typeof zAccountPlanDetails>;

export const zAccountRevenueInformation = z.object({
  annual_revenue: z.coerce.number().nullish().describe('Annual revenue'),
  current_billable_mrr_c: z.coerce.number().nullish().describe('Current MRR'),
  arr_as_of_last_month_c: z.coerce
    .number()
    .nullish()
    .describe('ARR as of last month'),
  lifetime_value_c: z.coerce
    .number()
    .nullish()
    .describe('Customer lifetime value'),
});
export const accountRevenueFields = zAccountRevenueInformation.keyof().options;
export type AccountRevenueInformation = z.infer<
  typeof zAccountRevenueInformation
>;

export const zAccountLocationInformation = z.object({
  billing_street: z.string().nullish().describe('Billing street address'),
  billing_city: z.string().nullish().describe('Billing city'),
  billing_state: z.string().nullish().describe('Billing state / province'),
  billing_postal_code: z
    .string()
    .nullish()
    .describe('Billing postal / ZIP code'),
  billing_country: z.string().nullish().describe('Billing country'),
  billing_country_code: z
    .string()
    .nullish()
    .describe('Billing country code (ISO)'),
  shipping_street: z.string().nullish().describe('Shipping street address'),
  shipping_city: z.string().nullish().describe('Shipping city'),
  shipping_state: z.string().nullish().describe('Shipping state / province'),
  shipping_postal_code: z
    .string()
    .nullish()
    .describe('Shipping postal / ZIP code'),
  shipping_country: z.string().nullish().describe('Shipping country'),
});
export const accountLocationFields =
  zAccountLocationInformation.keyof().options;
export type AccountLocationInformation = z.infer<
  typeof zAccountLocationInformation
>;

export const zAccountContactInformation = z.object({
  contacts: z.array(zAccountContact).optional().describe('Associated contacts'),
});

export type AccountContactInformation = z.infer<
  typeof zAccountContactInformation
>;

export const zChurn = z.object({
  id: z.string().describe('Churn record ID'),
  name: z.string().nullish().describe('Churn record name'),
  churn_status_c: z
    .string()
    .nullish()
    .describe(
      'Churn status (e.g. Churned, Mitigation, Unengaged, Churn Avoided)',
    ),
  churn_impact_arr_c: z
    .number()
    .nullish()
    .describe('ARR impact of the churn event'),
  expected_churn_date_c: z.string().nullish().describe('Expected churn date'),
  churn_reason_c: z.string().nullish().describe('Reason for churn'),
  churn_competitor_c_c: z
    .string()
    .nullish()
    .describe('Competitor that the customer churned to'),
  churn_mitigation_plan_c: z
    .string()
    .nullish()
    .describe('Mitigation plan notes'),
  churn_discovery_notes_c: z
    .string()
    .nullish()
    .describe('Discovery notes about the churn event'),
});

export const churnFields = zChurn.keyof().options;

export type Churn = z.infer<typeof zChurn>;

export const zAccountChurnInformation = z.object({
  churn: z.array(zChurn).optional().describe('Churn records for this account'),
});
export type AccountChurnInformation = z.infer<typeof zAccountChurnInformation>;

export const zAccountUsageInformation = z.object({
  actively_consuming_c: z
    .boolean()
    .nullish()
    .describe('Is actively consuming (custom)'),
  cloud_provider_c: z.string().nullish().describe('Cloud provider (custom)'),
  number_of_services_c: z
    .number()
    .nullish()
    .describe('Number of services (custom)'),
  size_of_services_c: z
    .string()
    .nullish()
    .describe('Size of services (custom)'),
  project_id_c: z.string().nullish().describe('Cloud project ID (custom)'),
  service_id_c: z.string().nullish().describe('Cloud service ID (custom)'),
  total_active_storage_c: z
    .number()
    .nullish()
    .describe('Total active storage (custom)'),
  total_active_cpu_c: z
    .number()
    .nullish()
    .describe('Total active CPU (custom)'),
  weekly_page_views_c: z
    .number()
    .nullish()
    .describe('Weekly page views (custom)'),
  cloud_trial_c: z
    .boolean()
    .nullish()
    .describe('Is / was a trial account (custom)'),
});
export const accountUsageFields = zAccountUsageInformation.keyof().options;
export type AccountUsageInformation = z.infer<typeof zAccountUsageInformation>;

export const zAccount = z.object({
  ...zAccountCore.shape,
  ...zAccountInternalContact.shape,
  ...zAccountPlanDetails.shape,
  ...zAccountRevenueInformation.shape,
  ...zAccountLocationInformation.shape,
  ...zAccountContactInformation.shape,
  ...zAccountChurnInformation.shape,
  ...zAccountUsageInformation.shape,
});

export type Account = z.infer<typeof zAccount>;

export const zUserDetails = z.object({
  id: z.string().describe('The unique user identifier'),
  username: z.string().nullish(),
  first_name: z.string().nullish(),
  last_name: z.string().nullish(),
  company_name: z.string().nullish(),
  email: z.string().nullish(),
  title: z.string().nullish(),
  department: z.string().nullish(),
});

export type UserDetails = z.infer<typeof zUserDetails>;

export type CaseRow = {
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
};

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
export type CaseDetails = z.infer<typeof zCaseDetails>;
export const caseDetailsFields = zCaseDetails.keyof().options;

export const zCaseDetailsWithUrl = zCaseDetails.extend({
  url: z.string().optional().describe('The URL to view the case in Salesforce'),
});
export type CaseDetailsWithUrl = z.infer<typeof zCaseDetailsWithUrl>;

export const zEmail = z.object({
  from_address: z.string().nullish().describe('The sender email address'),
  created_date: z.coerce.date().nullish().describe('When the email was sent'),
  text_body: z
    .string()
    .nullish()
    .describe('The email body (with reply parsing applied)'),
});

export type Email = z.infer<typeof zEmail>;

export const emailFields = zEmail.keyof().options;

export interface AccountQueryOptions {
  includePlanDetails?: boolean;
  includeRevenue?: boolean;
  includeLocation?: boolean;
  includeInternalContacts?: boolean;
  includeContacts?: boolean;
  includeUsage?: boolean;
  includeChurnInformation?: boolean;
}

export interface AccountQueryById extends AccountQueryOptions {
  singleAccount: true;
  accountId: string;
}

export interface AccountQueryByKeyword extends AccountQueryOptions {
  singleAccount: false;
  nameKeyword: string;
}
