import { ApiFactory, InferSchema, log } from '@tigerdata/mcp-boilerplate';
import { z } from 'zod';
import { ServerContext } from '../types.js';

const inputSchema = {
  kind: z
    .enum(['file', 'attachment'])
    .describe(
      'The attachment source type as reported by the Case-details fetch. `file` = modern Salesforce Files (ContentVersion, id starts with "068"). `attachment` = legacy Attachment sObject (id starts with "00P"), common on EmailMessages synced from mail servers.',
    ),
  download_id: z
    .string()
    .regex(
      /^[a-zA-Z0-9]{15}([a-zA-Z0-9]{3})?$/,
      'download_id must be a 15- or 18-character Salesforce Id',
    )
    .describe(
      'The Salesforce Id to download. For `kind=file` this is a ContentVersion Id (068...). For `kind=attachment` this is an Attachment Id (00P...). Both are returned as `download_id` on each attachment.',
    ),
} as const;

const outputSchema = {
  kind: z.enum(['file', 'attachment']),
  download_id: z.string(),
  content_type: z
    .string()
    .nullish()
    .describe(
      'The Content-Type header returned by Salesforce for the file body, if present.',
    ),
  size_bytes: z
    .number()
    .describe('Length of the decoded file body in bytes.'),
  body_base64: z
    .string()
    .describe(
      'The file body, base64-encoded. Decode before use — the file may be binary.',
    ),
} as const;

export const downloadCaseAttachmentFactory: ApiFactory<
  ServerContext,
  typeof inputSchema,
  typeof outputSchema
> = ({ salesforceClientFactory }) => ({
  name: 'download_case_attachment',
  method: 'get',
  route: '/case-attachment',
  config: {
    title: 'Download Salesforce Case Attachment',
    description:
      "Download the raw bytes of a file reachable from a Salesforce Case. Pass the `kind` and `download_id` returned by a Case-details fetch — modern Files use ContentVersion Ids (kind=file); legacy Attachments (common on emails) use Attachment Ids (kind=attachment). The body is returned base64-encoded.",
    inputSchema,
    outputSchema,
  },
  fn: async ({
    kind,
    download_id,
  }): Promise<InferSchema<typeof outputSchema>> => {
    const client = await salesforceClientFactory();
    const { instanceUrl, accessToken, version } = client;
    if (!instanceUrl || !accessToken) {
      throw new Error(
        'Salesforce client is missing instanceUrl or accessToken.',
      );
    }

    const path =
      kind === 'file'
        ? `/services/data/v${version}/sobjects/ContentVersion/${download_id}/VersionData`
        : `/services/data/v${version}/sobjects/Attachment/${download_id}/Body`;

    const response = await fetch(`${instanceUrl}${path}`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: '*/*',
      },
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      log.error('Failed to download Salesforce attachment', undefined, {
        kind,
        downloadId: download_id,
        status: response.status,
        detail: detail.slice(0, 500),
      });
      throw new Error(
        `Failed to download attachment ${download_id} (kind=${kind}): ${response.status} ${response.statusText}`,
      );
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    return {
      kind,
      download_id,
      content_type: response.headers.get('content-type'),
      size_bytes: buffer.byteLength,
      body_base64: buffer.toString('base64'),
    };
  },
});
