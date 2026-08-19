import { Connection } from 'jsforce';

import { log } from '@tigerdata/mcp-boilerplate';
import {
  Account,
  AccountContact,
  accountContactFields,
  accountCoreFields,
  accountLocationFields,
  accountPlanDetailsFields,
  AccountQueryById,
  accountRevenueFields,
  accountUsageFields,
  CaseAttachment,
  caseDetailsFields,
  CaseRow,
  Churn,
  churnFields,
  Email,
  emailFields,
  zAccount,
} from '../types.js';

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
  client: Connection,
  caseIdOrNumber: string,
): Promise<CaseRow | null> => {
  const isNumber = !!caseIdOrNumber.match(/^\d+$/);
  try {
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

export const getAccountDetails = async (
  client: Connection,
  params: AccountQueryById,
): Promise<Partial<Account> | null> => {
  const {
    accountId,
    includeContacts,
    includeChurnInformation,
    includePlanDetails,
    includeInternalContacts,
    includeLocation,
    includeRevenue,
    includeUsage,
  } = params;
  try {
    const fields = [
      ...accountCoreFields,
      ...(includePlanDetails ? accountPlanDetailsFields : []),
      ...(includeLocation ? accountLocationFields : []),
      ...(includeRevenue ? accountRevenueFields : []),
      ...(includeUsage ? accountUsageFields : []),
    ];
    const result = await client.query(
      `SELECT ${[
        ...getSalesforceFields(fields),
        ...(includeInternalContacts
          ? [
              'Lead_Support_Engineer__r.Name',
              'Product_Sponsor__r.Name',
              'Customer_Success_Manager__r.Name',
              'Owner.Name',
            ]
          : []),
      ].join(',')} FROM Account WHERE Id = '${accountId}' LIMIT 1`,
    );

    if (result.records.length === 0) {
      log.info('Could not find account via Salesforce API', { accountId });
      return null;
    }
    const raw = result.records[0];
    const account = zAccount.partial().parse({
      ...convertSOQLObject<Account>(raw as Record<string, unknown>),
      ...(includeInternalContacts
        ? {
            lead_support_engineer_name: raw.Lead_Support_Engineer__r?.Name,
            product_sponsor_name: raw.Product_Sponser__r?.Name,
            customer_success_manager_name:
              raw.Customer_Success_Manager__r?.Name,
            account_executive_name: raw.Owner?.Name,
          }
        : {}),
    });

    if (includeChurnInformation) {
      const churnResult = await client.query(
        `SELECT ${getSalesforceFields(churnFields).join(',')} FROM Churn__c WHERE Account__c = '${accountId}'`,
      );

      account.churn = churnResult.records.map((x) =>
        convertSOQLObject<Churn>(x),
      );
    }

    if (includeContacts) {
      const contactResult = await client.query(
        `SELECT ${getSalesforceFields(accountContactFields).join(',')} FROM Contact WHERE AccountId = '${accountId}'`,
      );
      account.contacts = contactResult.records.map((x) =>
        convertSOQLObject<AccountContact>(x),
      );
    }

    return account;
  } catch (e) {
    throw new Error('Failed to query the Salesforce API for account details', {
      cause: e,
    });
  }
};

export const getCaseEmails = async (
  client: Connection,
  caseId: string,
): Promise<Email[] | null> => {
  try {
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

// Attachments smaller than this and typed as an image are treated as
// signature/inline-graphic noise. Real screenshots are almost always
// well above this threshold.
const SIGNATURE_IMAGE_MAX_BYTES = 10 * 1024;

const EXT_TO_MIME: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
};

// Modern Salesforce Files linked to `parentId` via ContentDocumentLink.
// ContentDocumentLink requires a single-value equality on LinkedEntityId —
// `IN (...)` silently returns 0 rows, so callers must loop.
const fetchContentDocumentLinkAttachments = async (
  client: Connection,
  parentId: string,
): Promise<CaseAttachment[]> => {
  const result = await client.query(
    `SELECT ContentDocumentId,
        ContentDocument.Title,
        ContentDocument.FileExtension,
        ContentDocument.FileType,
        ContentDocument.ContentSize,
        ContentDocument.LatestPublishedVersionId,
        ContentDocument.CreatedDate
      FROM ContentDocumentLink
      WHERE LinkedEntityId = '${parentId}'`,
  );

  const attachments: CaseAttachment[] = [];
  for (const record of result.records) {
    const doc =
      (record as Record<string, unknown>).ContentDocument as
        | Record<string, unknown>
        | null
        | undefined;
    const versionId = doc?.LatestPublishedVersionId as string | undefined;
    if (!versionId) continue;
    const extension = (doc?.FileExtension as string | null) ?? null;
    const fileType = (doc?.FileType as string | null) ?? null;
    const contentType =
      EXT_TO_MIME[(extension ?? '').toLowerCase()] ?? fileType ?? null;
    attachments.push({
      kind: 'file',
      download_id: versionId,
      parent_id: parentId,
      title: (doc?.Title as string | null) ?? null,
      file_extension: extension,
      content_type: contentType,
      size_bytes: (doc?.ContentSize as number | null) ?? null,
      created_date: (doc?.CreatedDate as string | null) ?? null,
    });
  }
  return attachments;
};

// Legacy Attachment sObjects (common on EmailMessages).
const fetchLegacyAttachments = async (
  client: Connection,
  parentIds: string[],
): Promise<CaseAttachment[]> => {
  if (parentIds.length === 0) return [];
  const inList = parentIds.join("','");
  const result = await client.query(
    `SELECT Id, ParentId, Name, ContentType, BodyLength, CreatedDate
      FROM Attachment
      WHERE ParentId IN ('${inList}')`,
  );

  return result.records.map((rawRecord) => {
    const record = rawRecord as Record<string, unknown>;
    const name = (record.Name as string | null) ?? null;
    const dotIndex = name ? name.lastIndexOf('.') : -1;
    const extension = dotIndex > 0 ? name!.slice(dotIndex + 1) : null;
    return {
      kind: 'attachment' as const,
      download_id: record.Id as string,
      parent_id: (record.ParentId as string | null) ?? '',
      title: name,
      file_extension: extension,
      content_type: (record.ContentType as string | null) ?? null,
      size_bytes: (record.BodyLength as number | null) ?? null,
      created_date: (record.CreatedDate as string | null) ?? null,
    };
  });
};

const isSignatureImage = (att: CaseAttachment): boolean => {
  const contentType = (att.content_type ?? '').toLowerCase();
  if (!contentType.startsWith('image/')) return false;
  return att.size_bytes != null && att.size_bytes < SIGNATURE_IMAGE_MAX_BYTES;
};

// Fetch all files reachable from a Case — modern Files + legacy Attachments,
// on both the Case itself and its EmailMessages. Dedupes by
// (title, size_bytes, content_type) and drops small inline images
// (signature glyphs) which are the dominant noise source on email cases.
export const getCaseAttachments = async (
  client: Connection,
  caseId: string,
): Promise<CaseAttachment[]> => {
  try {
    const raw: CaseAttachment[] = [];

    raw.push(...(await fetchContentDocumentLinkAttachments(client, caseId)));
    raw.push(...(await fetchLegacyAttachments(client, [caseId])));

    const emailResult = await client.query(
      `SELECT Id FROM EmailMessage WHERE ParentId = '${caseId}' AND HasAttachment = true`,
    );
    const emailIds = emailResult.records.map(
      (e) => (e as Record<string, unknown>).Id as string,
    );

    for (const eid of emailIds) {
      raw.push(...(await fetchContentDocumentLinkAttachments(client, eid)));
    }
    raw.push(...(await fetchLegacyAttachments(client, emailIds)));

    const filtered = raw.filter((a) => !isSignatureImage(a));

    const seen = new Set<string>();
    const deduped: CaseAttachment[] = [];
    for (const a of filtered) {
      const key = `${a.title ?? ''}|${a.size_bytes ?? ''}|${a.content_type ?? ''}`;
      if (seen.has(key)) continue;
      seen.add(key);
      deduped.push(a);
    }
    return deduped;
  } catch (e) {
    log.error(
      'Failed to query the Salesforce API for case attachments',
      e as Error,
      { caseId },
    );
    return [];
  }
};
