#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { registerAllTools } from './tools.js';
import { ZeroheightLoader } from './zeroheight-loader.js';
const server = new McpServer({
    name: 'igds-storybook',
    version: '1.1.0',
});
// Register all tools
registerAllTools(server);
// Check for Zeroheight data on startup
const zeroheightLoader = new ZeroheightLoader();
if (zeroheightLoader.isAvailable()) {
    console.error('Using cached Zeroheight data');
}
async function main() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error('IGDS Storybook MCP server running');
}
main().catch(console.error);
//# sourceMappingURL=index.js.map