import { getCaseSummaryFactory } from './getCaseSummary.js';
import { getCaseDetailsFactory } from './getCaseDetails.js';
import { downloadCaseAttachmentFactory } from './downloadCaseAttachment.js';
import { searchCaseSummariesFactory } from './searchCaseSummaries.js';
import { searchCasesFactory } from './searchCases.js';
import { searchChurnInformationFactory } from './searchChurnInformation.js';
import { getAccountDetailsFactory } from './getAccountDetails.js';
import { getAccountsFactory } from './getAccounts.js';
import { getUserDetailsFactory } from './getUserDetails.js';

export const apiFactories = [
  getCaseSummaryFactory,
  getCaseDetailsFactory,
  downloadCaseAttachmentFactory,
  searchCaseSummariesFactory,
  searchCasesFactory,
  searchChurnInformationFactory,
  getAccountDetailsFactory,
  getAccountsFactory,
  getUserDetailsFactory,
] as const;
