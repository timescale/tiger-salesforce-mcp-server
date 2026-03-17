import { Pool } from 'pg';

import { ServerContext } from './types.js';
import { Connection } from 'jsforce';
import { getSalesforce } from './utils/salesforce.js';

const { SALESFORCE_CLIENT_ID, SALESFORCE_CLIENT_SECRET, SALESFORCE_DOMAIN } =
  process.env;

export const serverInfo = {
  name: 'tiger-salesforce',
  version: '1.1.0',
} as const;

const pgPool = new Pool();

let salesforceClientFactory: (() => Promise<Connection>) | null = null;
if (!SALESFORCE_CLIENT_ID || !SALESFORCE_CLIENT_SECRET || !SALESFORCE_DOMAIN) {
  throw new Error(
    'Salesforce client ID, secret, and domain are not set. Will not use Salesforce API as fallback.',
  );
} else {
  salesforceClientFactory = getSalesforce;
}

export const context: ServerContext = { pgPool, salesforceClientFactory };
