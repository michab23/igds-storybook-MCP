import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import express from 'express';
import { randomUUID } from 'crypto';
import { registerAllTools } from './tools.js';
import { SERVER_INFO } from './server-info.js';
const app = express();
app.use(express.json({ limit: '4mb' }));
/**
 * One McpServer per session. A single shared instance cannot be connected to more than one
 * transport — the second connect replaces the first, and concurrent clients then talk over
 * each other's channel.
 */
const sessions = new Map();
async function createSession() {
    // The id is fixed up front: `transport.sessionId` is only populated once the transport
    // has handled `initialize`, which is too late to register the session.
    const sessionId = randomUUID();
    const server = new McpServer(SERVER_INFO);
    registerAllTools(server);
    const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => sessionId,
    });
    transport.onclose = () => {
        sessions.delete(sessionId);
    };
    await server.connect(transport);
    const session = { server, transport };
    sessions.set(sessionId, session);
    return session;
}
app.all('/mcp', async (req, res) => {
    const sessionId = req.headers['mcp-session-id'];
    try {
        if (req.method === 'POST') {
            const session = (sessionId ? sessions.get(sessionId) : undefined) ?? (await createSession());
            await session.transport.handleRequest(req, res, req.body);
            return;
        }
        const session = sessionId ? sessions.get(sessionId) : undefined;
        if (!session) {
            res.status(400).json({ error: 'Invalid or missing session ID' });
            return;
        }
        if (req.method === 'GET') {
            await session.transport.handleRequest(req, res);
            return;
        }
        if (req.method === 'DELETE') {
            await session.transport.close();
            await session.server.close();
            sessions.delete(sessionId);
            res.status(200).json({ ok: true });
            return;
        }
        res.status(405).json({ error: `Method ${req.method} not allowed` });
    }
    catch (error) {
        console.error('MCP request failed:', error);
        if (!res.headersSent)
            res.status(500).json({ error: 'Internal server error' });
    }
});
app.get('/health', (_req, res) => {
    res.json({ ok: true, sessions: sessions.size, ...SERVER_INFO });
});
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`IGDS MCP server on http://localhost:${PORT}/mcp`);
});
//# sourceMappingURL=http-server.js.map