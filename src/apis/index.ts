import { getCaseSummaryFactory } from './getCaseSummary.js';
import { getCaseDetailsFactory } from './getCaseDetails.js';
import { semanticSearchSalesforceCaseSummariesFactory } from './semanticSearchSalesforceCaseSummaries.js';

export const apiFactories = [
  getCaseSummaryFactory,
  getCaseDetailsFactory,
  semanticSearchSalesforceCaseSummariesFactory,
] as const;
