# Tiger Salesforce MCP Server

A wrapper around our Salesforce database, which contains embedded case summaries. This provides some focused tools to LLMs via the [Model Context Protocol](https://modelcontextprotocol.io/introduction).

The raw data is sourced from Salesforce via a [Fivetran connection](https://fivetran.com/dashboard/connections/apparel_slider/status?groupId=harsh_overturned&service=salesforce&syncChartPeriod=1%20Day). This populates a schema in a TimescaleDB database. A separate process generates LLM summaries of the support cases, and then embeddings of those summaries. This service searches those summaries.

## API

All methods are exposed as MCP tools and REST API endpoints.

### Salesforce Case Summary Semantic Search

Searches the Salesforce case summaries for relevant entries based on a semantic embedding of the search prompt.

**Tool name**
: `semanticSearchSalesforceCaseSummaries`

**API endpoint**
: `GET /api/semantic-search/salesforce-case-summaries`

#### Input

(use query parameters for REST API)

```jsonc
{
  "prompt": "Why can't I connect to my database?",
  "limit": 10, // optional, default is 10
}
```

#### Output

```jsonc
{
  "results": [
    {
      "case_id": "500Nv000005HMfaIAG",
      "summary": "# Some content ...",
      "distance": 0.40739564321624144,
    },
    // more results...
  ],
}
```

(the REST API returns a JSON array, just the content of the `results` field above)

## Development

Cloning and running the server locally.

```bash
git clone --recurse-submodules git@github.com:timescale/tiger-salesforce-mcp-server.git
```

### Submodules

This project uses git submodules to include the mcp boilerplate code. If you cloned the repo without the `--recurse-submodules` flag, run the following command to initialize and update the submodules:

```bash
git submodule update --init --recursive
```

You may also need to run this command if you pull changes that update a submodule. You can simplify this process by changing you git configuration to automatically update submodules when you pull:

```bash
git config --global submodule.recurse true
```

### Building

Run `npm i` to install dependencies and build the project. Use `npm run watch` to rebuild on changes.

Create a `.env` file based on the `.env.sample` file.

```bash
cp .env.sample .env
```

### Testing

The MCP Inspector is very handy.

```bash
npm run inspector
```

| Field          | Value           |
| -------------- | --------------- |
| Transport Type | `STDIO`         |
| Command        | `node`          |
| Arguments      | `dist/index.js` |

#### Testing in Claude Desktop

Create/edit the file `~/Library/Application Support/Claude/claude_desktop_config.json` to add an entry like the following, making sure to use the absolute path to your local `tiger-salesforce-mcp-server` project, and real database credentials.

```json
{
  "mcpServers": {
    "tiger-salesforce": {
      "command": "node",
      "args": [
        "/absolute/path/to/tiger-salesforce-mcp-server/dist/index.js",
        "stdio"
      ],
      "env": {
        "PGHOST": "x.y.tsdb.cloud.timescale.com",
        "PGDATABASE": "tsdb",
        "PGPORT": "32467",
        "PGUSER": "readonly_mcp_user",
        "PGPASSWORD": "abc123",
        "OPENAI_API_KEY": "sk-svcacct"
      }
    }
  }
}
```

## Deployment

We use a Helm chart to deploy to Kubernetes. See the `chart/` directory for details.

The service is accessible to other services in the cluster via the DNS name `tiger-salesforce-mcp-server.savannah-system.svc.cluster.local`.

### Secrets

Run the following to create the necessary sealed secrets. Be sure to fill in the correct values.

```bash
kubectl -n savannah-system create secret generic tiger-salesforce-mcp-server-database \
  --dry-run=client \
  --from-literal=user="readonly_mcp_user" \
  --from-literal=password="abc123" \
  --from-literal=database="tsdb" \
  --from-literal=host="x.y.tsdb.cloud.timescale.com" \
  --from-literal=port="34240" \
  -o yaml | kubeseal -o yaml

kubectl -n savannah-system create secret generic tiger-salesforce-mcp-server-openai \
  --dry-run=client \
  --from-literal=apiKey="sk-svcacct-" \
  -o yaml | kubeseal -o yaml

kubectl -n savannah-system create secret generic tiger-salesforce-mcp-server-logfire \
  --dry-run=client \
  --from-literal=token="pylf_v1_us_" \
  -o yaml | kubeseal -o yaml
```

Update `./chart/values/dev.yaml` with the output.
