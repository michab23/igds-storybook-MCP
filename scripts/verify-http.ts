/**
 * Starts the HTTP server, drives two concurrent MCP sessions against it, and shuts it down.
 *
 * The regression this guards: a single shared McpServer connected to every session's
 * transport. The second connect replaces the first, and concurrent clients then talk over
 * each other's channel — which only shows up when two clients are actually connected.
 *
 * Run: npm run verify:http
 */

import { spawn } from 'child_process';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const PORT = process.env.PORT || '3999';
const URL_ = new URL(`http://localhost:${PORT}/mcp`);

async function waitForServer(attempts = 30): Promise<void> {
  for (let i = 0; i < attempts; i++) {
    try {
      const response = await fetch(`http://localhost:${PORT}/health`);
      if (response.ok) return;
    } catch {
      // Not up yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  throw new Error(`Server did not start on port ${PORT}`);
}

async function session(label: string, component: string): Promise<string> {
  const client = new Client({ name: label, version: '1.0.0' });
  await client.connect(new StreamableHTTPClientTransport(URL_));

  const result = (await client.callTool({
    name: 'get-component',
    arguments: { component },
  })) as { content?: { text?: string }[] };

  await client.close();
  return (result.content?.[0]?.text ?? '').split('\n')[0];
}

async function main(): Promise<void> {
  const server = spawn(process.execPath, ['dist/http-server.js'], {
    env: { ...process.env, PORT },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let failures = 0;
  try {
    await waitForServer();

    const [a, b] = await Promise.all([session('A', 'Button'), session('B', 'Card')]);

    const aOk = a.includes('Button');
    const bOk = b.includes('Card');
    console.log(`${aOk ? 'PASS' : 'FAIL'}  session A got Button — ${a}`);
    console.log(`${bOk ? 'PASS' : 'FAIL'}  session B got Card — ${b}`);
    if (!aOk) failures++;
    if (!bOk) failures++;

    const health = await (await fetch(`http://localhost:${PORT}/health`)).json();
    const bothTracked = health.sessions >= 2;
    console.log(`${bothTracked ? 'PASS' : 'FAIL'}  both sessions tracked — ${health.sessions}`);
    if (!bothTracked) failures++;
  } finally {
    // Wait for the child to actually exit; tearing down mid-kill trips a libuv assertion
    // on Windows.
    server.kill();
    await new Promise((resolve) => server.once('exit', resolve));
  }

  console.log(failures ? `\n${failures} check(s) failed.` : '\nAll HTTP checks passed.');
  process.exitCode = failures ? 1 : 0;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
