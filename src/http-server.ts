import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import express from 'express';
import { CachedDataLoader } from './cached-loader.js';
import { ZeroheightLoader } from './zeroheight-loader.js';
import { StorybookFramework } from './types.js';
import { z } from 'zod';

const app = express();
app.use(express.json());

const cachedLoader = new CachedDataLoader();
const zeroheightLoader = new ZeroheightLoader();

const server = new McpServer({
  name: 'igds-storybook',
  version: '1.0.0',
});

// Register all tools from src/index.ts
// (Copy tool registrations here or import them)

app.get('/sse', async (req, res) => {
  const transport = new SSEServerTransport('/messages', res);
  await server.connect(transport);
});

app.post('/messages', async (req, res) => {
  // Handle messages
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`MCP server running on http://localhost:${PORT}/sse`);
});
