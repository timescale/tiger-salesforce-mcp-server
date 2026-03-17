import { Connection } from 'jsforce';

import { log } from '@tigerdata/mcp-boilerplate';
import { caseDetailsFields, CaseRow, Email, emailFields } from '../types.js';

const { SALESFORCE_CLIENT_ID, SALESFORCE_CLIENT_SECRET, SALESFORCE_DOMAIN } =
  process.env;

const salesforceUrl = `https://${SALESFORCE_DOMAIN}`;

export const getSalesforce = async (): Promise<Connection> => {
  const client = new Connection({
    instanceUrl: salesforceUrl,
    oauth2: {
      loginUrl: salesforceUrl,
      clientId: SALESFORCE_CLIENT_ID,
      clientSecret: SALESFORCE_CLIENT_SECRET,
    },
    version: '64.0',
  });
  await client.authorize({ grant_type: 'client_credentials' });
  return client;
};

// this converts the fields that the db schema uses into the
// salesforce equivalent
// for instance a_custom_field_c should be a_custom_field__c (extra underscore)
// and non_custom_field should be noncustomfield
// will also use the original field name as alias
const getSalesforceFields = (originalFields: string[]): string[] => {
  return originalFields.map((field) => {
    const normalizedField = field.match(/[^_](_c)$/)
      ? field.replace(/(_c)$/, '__c')
      : field.replaceAll('_', '');

    return normalizedField;
  });
};

// this converts SOQL fields into the expected fields
// for instance Custom_Field__C becomes custom_field_c
// and StandardField becomes standard_field
const convertSOQLObject = <T>(caseRecord: Record<string, unknown>): T => {
  const keys = Object.keys(caseRecord);
  const row: Record<string, unknown> = {};
  for (const key of keys) {
    if (key === 'attributes') continue;
    const caseRowField = (
      key.match(/__c$/)
        ? key.replace(/(__c)$/, '_c')
        : [...key]
            .map((char, index) =>
              index > 0 && char === char.toUpperCase() ? `_${char}` : char,
            )
            .join('')
    ).toLowerCase();
    row[caseRowField] = caseRecord[key];
  }

  return row as never as T;
};

export const getCaseDetails = async (
  caseIdOrNumber: string,
): Promise<CaseRow | null> => {
  const isNumber = !!caseIdOrNumber.match(/^\d+$/);
  try {
    const client = await getSalesforce();
    const fields = getSalesforceFields(caseDetailsFields);
    const result = await client.query(`SELECT ${fields.join(',')} 
FROM Case 
    WHERE ${isNumber ? `CaseNumber = '${caseIdOrNumber}'` : `ID = '${caseIdOrNumber}'`}
LIMIT 1`);

    if (result.records.length === 0) {
      log.info('Could not find case via Salesforce API', { caseIdOrNumber });
      return null;
    }

    return convertSOQLObject(result.records[0]);
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

export const getCaseEmails = async (
  salesforceClient: () => Promise<Connection>,
  caseId: string,
): Promise<Email[] | null> => {
  try {
    const client = await salesforceClient();
    const fields = getSalesforceFields(emailFields);
    const result = await client.query(`SELECT ${fields.join(',')}
        FROM EmailMessage
        WHERE ParentId = '${caseId}'
        ORDER BY CreatedDate DESC`);

    if (result.records.length === 0) {
      log.info('Could not find case emails via Salesforce API', { caseId });
      return null;
    }

    return result.records.map((email) => convertSOQLObject(email));
  } catch (e) {
    log.error(
      'Failed to query the Salesforce API for case emails',
      e as Error,
      {
        caseId,
      },
    );

    return null;
  }
};
