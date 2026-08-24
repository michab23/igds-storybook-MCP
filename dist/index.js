#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { registerAllTools } from './tools.js';
import { SERVER_INFO } from './server-info.js';
import { AgentDocsStore } from './agent-docs.js';
const server = new McpServer(SERVER_INFO);
registerAllTools(server);
async function main() {
    const store = new AgentDocsStore();
    if (!store.isAvailable()) {
        // stdout is the protocol channel; diagnostics must go to stderr.
        console.error('WARNING: data/igds-agent-docs.json is missing. Run "npm run build:docs".');
    }
    await server.connect(new StdioServerTransport());
    console.error(`IGDS MCP server ${SERVER_INFO.version} running (stdio)`);
}
main().catch((error) => {
    console.error('Failed to start IGDS MCP server:', error);
    process.exit(1);
});
//# sourceMappingURL=index.js.map