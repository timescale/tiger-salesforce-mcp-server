import { ApiFactory, InferSchema } from '@tigerdata/mcp-boilerplate';
import {
  EntityTypeToPrefixLookup,
  ServerContext,
  UserDetails,
  zUserDetails,
  zUserId,
} from '../types.js';

const inputSchema = {
  user_id: zUserId,
} as const;

const userDetailsFields = zUserDetails.keyof().options;

const outputSchema = {
  user: zUserDetails,
} as const;

export const getUserDetailsFactory: ApiFactory<
  ServerContext,
  typeof inputSchema,
  typeof outputSchema
> = ({ pgPool }) => ({
  name: 'get_user_details',
  method: 'get',
  route: '/user-details',
  config: {
    title: 'Get Salesforce User Details',
    description: `Retrieve details for a specific Salesforce user by their 15- or 18-character User ID (starts with ${EntityTypeToPrefixLookup['user']}). Note: a case's OwnerId may be a Group/Queue (starts with ${EntityTypeToPrefixLookup['group']}) rather than a User — those are not valid inputs to this tool.`,
    inputSchema,
    outputSchema,
  },
  fn: async ({ user_id }): Promise<InferSchema<typeof outputSchema>> => {
    const result = await pgPool.query<UserDetails>(
      /* sql */ `
SELECT
  ${userDetailsFields.map((field) => `u.${field}`).join('\n  , ')}
FROM salesforce.user u
WHERE u.id = $1
`,
      [user_id],
    );

    if (result.rows.length === 0) {
      throw new Error(`No user found with ID: ${user_id}.`);
    }

    const [user] = result.rows;

    return { user };
  },
});
