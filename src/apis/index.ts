import { getCaseSummaryFactory } from './getCaseSummary.js';
import { getCaseDetailsFactory } from './getCaseDetails.js';
import { searchCaseSummariesFactory } from './searchCaseSummaries.js';
import { getAccountDetailsFactory } from './getAccountDetails.js';

export const apiFactories = [
  getCaseSummaryFactory,
  getCaseDetailsFactory,
  searchCaseSummariesFactory,
  getAccountDetailsFactory,
] as const;
