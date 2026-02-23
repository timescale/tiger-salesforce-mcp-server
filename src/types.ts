import type { Pool } from 'pg';
import { z } from 'zod';

export interface ServerContext extends Record<string, unknown> {
  pgPool: Pool;
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

// ── Account schemas ──────────────────────────────────────────────────────────

export const zAccountContact = z.object({
  id: z.string().describe('Contact Salesforce ID'),
  first_name: z.string().nullish().describe('First name'),
  last_name: z.string().nullish().describe('Last name'),
  title: z.string().nullish().describe('Job title'),
  email: z.string().nullish().describe('Email address'),
  phone: z.string().nullish().describe('Phone number'),
  support_contact_c: z.boolean().nullish().describe('Is a designated support contact'),
});
export type AccountContact = z.infer<typeof zAccountContact>;

export const zAccountCore = z.object({
  id: z.string().describe('Account Salesforce ID'),
  name: z.string().nullish().describe('Account / company name'),
  type: z.string().nullish().describe('Account type'),
  website: z.string().nullish().describe('Company website'),
  industry: z.string().nullish().describe('Industry classification'),
  description: z.string().nullish().describe('Account description'),
  number_of_employees: z.number().nullish().describe('Employee count'),
  annual_revenue: z.number().nullish().describe('Annual revenue'),
  private_slack_channel_c: z.string().nullish().describe('Private Slack channel (custom)'),
  nps_score_c: z.number().nullish().describe('NPS score (custom)'),
  account_tier_c: z.string().nullish().describe('Account tier (custom)'),
  account_stage_c: z.string().nullish().describe('Account lifecycle stage (custom)'),
  account_health_c: z.string().nullish().describe('Account health score (custom)'),
  customer_start_date_c: z.coerce.date().nullish().describe('Customer since (custom)'),
  customer_end_date_c: z.coerce.date().nullish().describe('Churned date, if applicable (custom)'),
  churn_risk_c: z.boolean().nullish().describe('Churn risk flag (custom)'),
});
export type AccountCore = z.infer<typeof zAccountCore>;

export const zAccountRevenueInformation = z.object({
  annual_revenue: z.number().nullish().describe('Annual revenue'),
  current_billable_mrr_c: z.number().nullish().describe('Current MRR (custom)'),
  arr_as_of_last_month_c: z.number().nullish().describe('ARR as of last month (custom)'),
  estimated_revenue_c: z.number().nullish().describe('Estimated revenue (custom)'),
  lifetime_value_c: z.number().nullish().describe('Customer lifetime value (custom)'),
});
export type AccountRevenueInformation = z.infer<typeof zAccountRevenueInformation>;

export const zAccountLocationInformation = z.object({
  billing_street: z.string().nullish().describe('Billing street address'),
  billing_city: z.string().nullish().describe('Billing city'),
  billing_state: z.string().nullish().describe('Billing state / province'),
  billing_postal_code: z.string().nullish().describe('Billing postal / ZIP code'),
  billing_country: z.string().nullish().describe('Billing country'),
  billing_country_code: z.string().nullish().describe('Billing country code (ISO)'),
  shipping_street: z.string().nullish().describe('Shipping street address'),
  shipping_city: z.string().nullish().describe('Shipping city'),
  shipping_state: z.string().nullish().describe('Shipping state / province'),
  shipping_postal_code: z.string().nullish().describe('Shipping postal / ZIP code'),
  shipping_country: z.string().nullish().describe('Shipping country'),
});
export type AccountLocationInformation = z.infer<typeof zAccountLocationInformation>;

export const zAccountContactInformation = z.object({
  lead_support_engineer_c: z.string().nullish().describe('Lead support engineer name (custom)'),
  product_sponsor_c: z.string().nullish().describe('Product sponsor name (custom)'),
  customer_success_manager_c: z.string().nullish().describe('Customer success manager name (custom)'),
  contacts: z.array(zAccountContact).describe('Associated contacts'),
});
export type AccountContactInformation = z.infer<typeof zAccountContactInformation>;

export const zAccountUsageInformation = z.object({
  actively_consuming_c: z.boolean().nullish().describe('Is actively consuming (custom)'),
  cloud_provider_c: z.string().nullish().describe('Cloud provider (custom)'),
  number_of_services_c: z.number().nullish().describe('Number of services (custom)'),
  size_of_services_c: z.string().nullish().describe('Size of services (custom)'),
  cloud_project_id_c: z.string().nullish().describe('Cloud project ID (custom)'),
  cloud_service_id_c: z.string().nullish().describe('Cloud service ID (custom)'),
  total_active_storage_c: z.number().nullish().describe('Total active storage (custom)'),
  total_active_cpu_c: z.number().nullish().describe('Total active CPU (custom)'),
  weekly_page_views_c: z.number().nullish().describe('Weekly page views (custom)'),
  cloud_trial_c: z.boolean().nullish().describe('Is / was a trial account (custom)'),
});
export type AccountUsageInformation = z.infer<typeof zAccountUsageInformation>;
