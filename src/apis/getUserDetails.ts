import { ApiFactory, InferSchema } from '@tigerdata/mcp-boilerplate';
import { z } from 'zod';
import { ServerContext, UserDetails, zUserDetails } from '../types.js';

const inputSchema = {
  user_id: z
    .string()
    .regex(
      /^[a-zA-Z0-9]{18}$/,
      'user_id must be an 18-character Salesforce user ID (e.g. "005Nv000007cRRNIA2")',
    )
    .describe(
      'The unique 18-character Salesforce user ID (e.g. "005Nv000007cRRNIA2")',
    ),
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
    description:
      'This retrieves details for a specific Salesforce user by their 18-character user ID.',
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
      throw new Error(
        `No user found with ID: ${user_id}. Please verify the user ID and try again.`,
      );
    }

    const [user] = result.rows;

    return { user };
  },
});
