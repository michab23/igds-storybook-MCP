/**
 * Verification gate for the IGDS MCP server.
 *
 * Checks the two constraints the server exists to satisfy:
 *   1. Agent-only content — no rendered HTML, CSS or site chrome anywhere in what we serve.
 *   2. Context discipline — every tool response stays within its budget.
 *
 * Run: npm run verify
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { registerAllTools } from '../src/tools.js';
import { AgentDocsStore } from '../src/agent-docs.js';
import { SERVER_INFO } from '../src/server-info.js';

/** Worst measured `get-component` response before this work, in characters. */
const BASELINE_WORST_RESPONSE = 153_245;

const MAX_RESPONSE = 6_000;
const MAX_TOOLS = 6;

const BANNED_SUBSTRINGS = [
  'renderedHtml',
  'cssStyles',
  '<storybook-root',
  '_ngcontent',
  'Skip to content',
  // Storybook's own "Show code" panel for a story can carry inline demo CSS; usage
  // snippets are markup only, so this must never survive into the served artifact.
  '<style',
];

let failures = 0;

function check(ok: boolean, label: string, detail = ''): void {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
}

async function main(): Promise<void> {
  const store = new AgentDocsStore();
  if (!store.isAvailable()) {
    console.error('data/igds-agent-docs.json is missing. Run "npm run build:docs" first.');
    process.exit(1);
  }

  // --- 1. The served artifact carries no presentation noise -------------------------
  const artifact = readFileSync(join(process.cwd(), 'data', 'igds-agent-docs.json'), 'utf-8');
  for (const banned of BANNED_SUBSTRINGS) {
    check(!artifact.includes(banned), `artifact is free of "${banned}"`);
  }

  const components = store.list();
  const withProps = components.filter((component) => component.props.length);
  const withUsage = components.filter((component) => component.usage.length);
  const withValues = components.filter((component) =>
    component.props.some((prop) => prop.values?.length)
  );

  check(components.length > 40, 'component coverage', `${components.length} components`);
  check(
    withProps.length >= components.length - 2,
    'components have props',
    `${withProps.length}/${components.length}`
  );
  check(
    withUsage.length >= components.length - 2,
    'components have a usage snippet',
    `${withUsage.length}/${components.length}`
  );
  check(
    withValues.length > components.length / 3,
    'components document legal values',
    `${withValues.length}/${components.length}`
  );

  // --- 2. Tool surface and response budgets ----------------------------------------
  const server = new McpServer(SERVER_INFO);
  registerAllTools(server);

  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'verify', version: '1.0.0' });
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);

  const { tools } = await client.listTools();
  const toolCost = tools.reduce((total, tool) => total + JSON.stringify(tool).length, 0);
  check(tools.length <= MAX_TOOLS, 'tool count', `${tools.length} tools`);
  check(toolCost < 6_000, 'tool-definition context cost', `${toolCost} chars`);

  const callTool = async (name: string, args: Record<string, unknown>): Promise<string> => {
    const result = (await client.callTool({ name, arguments: args })) as {
      content?: { text?: string }[];
    };
    return result.content?.[0]?.text ?? '';
  };

  const sizes: number[] = [];
  let worst = { name: '', size: 0 };
  let leaked = '';

  for (const component of components) {
    const text = await callTool('get-component', { component: component.name });
    sizes.push(text.length);
    if (text.length > worst.size) worst = { name: component.name, size: text.length };

    for (const banned of BANNED_SUBSTRINGS) {
      if (text.includes(banned)) leaked = `${component.name}: ${banned}`;
    }
  }

  sizes.sort((a, b) => a - b);
  const p95 = sizes[Math.floor(sizes.length * 0.95)];

  check(!leaked, 'no tool response leaks presentation noise', leaked);
  check(worst.size <= MAX_RESPONSE, 'largest get-component response', `${worst.size} chars (${worst.name})`);
  console.log(
    `      p50 ${sizes[Math.floor(sizes.length * 0.5)]} · p95 ${p95} · max ${worst.size} chars ` +
      `(was ${BASELINE_WORST_RESPONSE.toLocaleString()} — ${Math.round(BASELINE_WORST_RESPONSE / worst.size)}x smaller)`
  );

  // --- 3. The paths an agent actually walks ----------------------------------------
  const search = await callTool('search-components', { query: 'dropdown' });
  check(/Dropdown/.test(search), 'search finds a known component');
  check(search.length < 2_500, 'search stays small', `${search.length} chars`);

  const missing = await callTool('get-component', { component: 'NoSuchComponent' });
  check(/search-components/.test(missing), 'unknown component points at search');

  const examples = await callTool('get-component-examples', { component: 'Button', limit: 2 });
  check(/igds-button/.test(examples), 'examples return real markup');

  const guidance = await callTool('get-design-guidance', { component: 'Button' });
  check(/Accessibility|When not to use/.test(guidance), 'guidance returns design rules');

  await client.close();

  console.log(failures ? `\n${failures} check(s) failed.` : '\nAll checks passed.');
  process.exit(failures ? 1 : 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
