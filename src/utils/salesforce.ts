import { Connection, Record as SalesforceRecord } from 'jsforce';

import { log } from '@tigerdata/mcp-boilerplate';
import { caseDetailsFields, CaseRow } from '../types.js';

const { SALESFORCE_CLIENT_ID, SALESFORCE_CLIENT_SECRET, SALESFORCE_DOMAIN } =
  process.env;

if (!SALESFORCE_CLIENT_ID || !SALESFORCE_CLIENT_SECRET || !SALESFORCE_DOMAIN) {
  throw new Error(
    'Salesforce client ID, secret, and domain must be set in environment variables.',
  );
}

const salesforceUrl = `https://${SALESFORCE_DOMAIN}`;

const salesforce = new Connection({
  instanceUrl: salesforceUrl,
  oauth2: {
    loginUrl: salesforceUrl,
    clientId: SALESFORCE_CLIENT_ID,
    clientSecret: SALESFORCE_CLIENT_SECRET,
  },
  version: '64.0',
});

let initialized = false;

export const getSalesforce = async (): Promise<Connection> => {
  if (initialized) {
    return salesforce;
  }
  log.info('🔐 Authenticating with Salesforce...');
  await salesforce.authorize({
    grant_type: 'client_credentials',
  });

  log.info('✅ Successfully authenticated with Salesforce');
  initialized = true;
  return salesforce;
};

// this converts the fields that the db schema uses into the
// salesforce equivalent
// for instance a_custom_field_c should be a_custom_field__c (extra underscore)
// and non_custom_field should be noncustomfield
// will also use the original field name as alias
const getSalesforceFields = (): string[] => {
  return caseDetailsFields.map((field) => {
    const normalizedField = field.match(/[^_](_c)$/)
      ? field.replace(/(_c)$/, '__c')
      : field.replace('_', '');

    return normalizedField;
  });
};

const convertSOQLCase = (caseRecord: SalesforceRecord): CaseRow => {
  const keys = Object.keys(caseRecord);
  const caseRow: Record<string, string> = {};
  for (const key of keys) {
    const caseRowField = (
      key.match(/__c$/)
        ? key.replace(/(__c)$/, '_c')
        : [...key]
            .map((char, index) =>
              index > 0 && char === char.toUpperCase() ? `_${char}` : char,
            )
            .join('')
    ).toLowerCase();
    caseRow[caseRowField] = caseRecord[key];
  }

  return caseRow as never as CaseRow;
};

export const getCaseDetails = async (
  caseIdOrNumber: string,
): Promise<CaseRow | null> => {
  const isNumber = !!caseIdOrNumber.match(/^\d*$/);
  try {
    const client = await getSalesforce();
    const fields = getSalesforceFields();
    const result = await client.query(`SELECT ${fields.join(',')} 
FROM Case 
    WHERE ${isNumber ? `CaseNumber = '${caseIdOrNumber}'` : `ID = '${caseIdOrNumber}'`}
LIMIT 1`);

    if (result.records.length === 0) {
      log.info('Could not find case via Salesforce API', { caseIdOrNumber });
      return null;
    }

    return convertSOQLCase(result.records[0]);
  } catch (e) {
    log.error(
      'Failed to query the Salesforce API for case details',
      e as Error,
      {
        caseIdOrNumber,
      },
    );

    return null;
  }
};
