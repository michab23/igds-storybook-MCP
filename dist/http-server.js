import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import express from 'express';
import { randomUUID } from 'crypto';
import { registerAllTools } from './tools.js';
const app = express();
app.use(express.json({ limit: '10mb' }));
const server = new McpServer({
    name: 'igds-storybook',
    version: '1.1.0',
});
// Register all tools
registerAllTools(server);
const transports = new Map();
app.all('/mcp', async (req, res) => {
    const sessionId = req.headers['mcp-session-id'];
    if (req.method === 'POST') {
        let transport;
        if (sessionId && transports.has(sessionId)) {
            transport = transports.get(sessionId);
        }
        else {
            const newSessionId = randomUUID();
            transport = new StreamableHTTPServerTransport({
                sessionIdGenerator: () => newSessionId,
            });
            transports.set(newSessionId, transport);
            await server.connect(transport);
        }
        await transport.handleRequest(req, res, req.body);
    }
    else if (req.method === 'GET') {
        if (!sessionId || !transports.has(sessionId)) {
            res.status(400).json({ error: 'Invalid or missing session ID' });
            return;
        }
        const transport = transports.get(sessionId);
        await transport.handleRequest(req, res);
    }
    else if (req.method === 'DELETE') {
        if (sessionId && transports.has(sessionId)) {
            const transport = transports.get(sessionId);
            await transport.close();
            transports.delete(sessionId);
        }
        res.status(200).json({ ok: true });
    }
});
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`MCP server running on http://localhost:${PORT}/mcp`);
});
//# sourceMappingURL=http-server.js.map