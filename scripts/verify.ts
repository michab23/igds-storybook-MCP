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
import { AgentDocsStore, reactEventPropFor, resolveEventName } from '../src/agent-docs.js';
import { cleanSnippet } from '../src/snippet-clean.js';
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

  // --- 1b. Usage snippets are copyable, current API (#6, #7) ---------------------------
  const STORY_SCAFFOLDING: [string, RegExp][] = [
    ['DevTools function placeholder', /function\s*[A-Za-z0-9_$]*\s*\(\)\s*\{\s*\}/],
    ['DevTools circular ref', /\[Circular\]/],
    ['inline JSX style object', /\sstyle=\{\{/],
    ['inline HTML style', /\sstyle="/],
    ['CSS-module hashed class', /class(?:Name)?="[^"]*_[A-Za-z0-9-]*?_[a-z0-9]{5}_\d+/],
    ['React.Fragment key', /<React\.Fragment/],
    ['deprecated Icon name lookup (React)', /<Icon\b[^>]*\sname="/],
    ['cut-off tag at end of snippet', /<[A-Za-z][\w.-]*\s*$/],
  ];
  const scaffoldHits: string[] = [];
  for (const component of components) {
    for (const snippet of component.usage) {
      for (const [label, pattern] of STORY_SCAFFOLDING) {
        if (snippet.framework !== 'react' && label.includes('React')) continue;
        if (pattern.test(snippet.code)) scaffoldHits.push(`${component.name}/${snippet.story}: ${label}`);
      }
      if (/<igds-dynamic-icon\b/.test(snippet.code) && !/dynamic\s*icon/i.test(component.name)) {
        scaffoldHits.push(`${component.name}/${snippet.story}: igds-dynamic-icon`);
      }
    }
  }
  check(!scaffoldHits.length, 'usage snippets carry no story scaffolding or deprecated icons', scaffoldHits.slice(0, 3).join('; '));

  const cleaned = cleanSnippet(
    '<div\n  className="_box_ab12c_1"\n  style={{\n    padding: 24\n  }}\n>\n  <Button\n    ref={{\n      current: \'[Circular]\'\n    }}\n    onIgdsClick={function B5(){}}\n  >\n    <Icon name="chevron-down" />\n  </Button>\n</div>',
    'react'
  ).code;
  check(
    cleaned === "// import { chevronDown } from '@igds/icons';\n<div>\n  <Button\n    onIgdsClick={() => {}}\n  >\n    <Icon node={chevronDown} />\n  </Button>\n</div>",
    'cleanSnippet strips scaffolding and rewrites icons',
    JSON.stringify(cleaned)
  );
  const collapsed = cleanSnippet(['<ul>', ...Array.from({ length: 6 }, (_, i) => `  <li>${i}</li>`), '</ul>'].join('\n'), 'core-web').code;
  check(
    collapsed === '<ul>\n  <li>0</li>\n  <li>1</li>\n  <!-- … 4 more like the above -->\n</ul>',
    'cleanSnippet collapses repeated placeholder siblings',
    JSON.stringify(collapsed)
  );

  // --- 1c. Imports use per-component subpaths (#5) ------------------------------------
  const tagged = components.filter((component) => component.tag && component.imports?.react);
  const barrel = tagged.filter((component) => /from '@igds\/react';$/.test(component.imports?.react || ''));
  check(!barrel.length, 'React imports use per-component subpaths', barrel.map((c) => c.name).join(', '));
  const tableRow = store.get('Table')?.subComponents?.find((child) => child.tag === 'igds-table-row');
  check(
    tableRow?.imports?.react === "import { TableRow } from '@igds/react/table';",
    'child elements import from their parent subpath',
    tableRow?.imports?.react
  );

  // --- 1d. React event names are props, never raw DOM names (#9) ---------------------
  check(reactEventPropFor('igds-cell-link-click') === 'onIgdsCellLinkClick', 'React event prop derivation');
  const rawReactEvents = components.flatMap((component) =>
    [...(component.events || []), ...(component.subComponents || []).flatMap((child) => child.events || [])]
      .map((event) => resolveEventName(event, 'react'))
      .filter((name) => !/^on[A-Z]/.test(name))
      .map((name) => `${component.name}: ${name}`)
  );
  check(!rawReactEvents.length, 'React event names resolve to onIgds* props', rawReactEvents.slice(0, 3).join('; '));

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

  // #8: story-only controls never pose as declared API.
  const isLtrProps = components.filter((component) => component.props.some((prop) => prop.name === 'is-ltr'));
  check(!isLtrProps.length, 'Storybook isLtr control is not served as a prop', isLtrProps.map((c) => c.name).join(', '));
  const searchField = await callTool('get-component', { component: 'Search Field', framework: 'react' });
  check(
    /\| withoutSuggestions † \|/.test(searchField) && /\| fullWidth † \|/.test(searchField) && /\| placeholder \|/.test(searchField),
    'undeclared props are marked †, declared ones are not'
  );

  // #14: every component answer says which IGDS data it reflects.
  check(
    /_Data: IGDS Storybook `develop` \(scraped \d{4}-\d{2}-\d{2}\); imports and event names verified against IGDS 0\.1\.37\./.test(searchField),
    'get-component states its data source and verified IGDS version'
  );
  check(store.meta().source?.verifiedAgainst === '0.1.37', 'igds://meta carries the verified IGDS version');

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
