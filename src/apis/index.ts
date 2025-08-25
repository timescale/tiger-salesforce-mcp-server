import { getCaseSummaryFactory } from './getCaseSummary.js';
import { semanticSearchSalesforceCaseSummariesFactory } from './semanticSearchSalesforceCaseSummaries.js';

export const apiFactories = [
  getCaseSummaryFactory,
  semanticSearchSalesforceCaseSummariesFactory,
] as const;
