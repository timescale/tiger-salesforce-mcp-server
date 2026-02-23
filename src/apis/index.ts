import { getCaseSummaryFactory } from './getCaseSummary.js';
import { getCaseDetailsFactory } from './getCaseDetails.js';
import { searchCaseSummaries } from './searchCaseSummaries.js';

export const apiFactories = [
  getCaseSummaryFactory,
  getCaseDetailsFactory,
  searchCaseSummaries,
] as const;
