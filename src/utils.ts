import { CaseSummary } from './types.js';

export const addUrlToCaseSummary = (caseSummary: CaseSummary): CaseSummary => {
  if (!process.env.SALESFORCE_DOMAN) {
    return caseSummary;
  }

  caseSummary.url = `https://${process.env.SALESFORCE_DOMAIN}/lightning/r/Case/${caseSummary.case_id}/view`;
  return caseSummary;
};
