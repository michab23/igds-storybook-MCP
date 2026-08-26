# IGDS MCP Server

An MCP server that gives coding agents the **component contract** for the Israeli Government Design System (IGDS) — props, legal values, defaults, usage snippets and design rules — and nothing else.

No rendered HTML. No CSS. No Storybook chrome. A `get-component` call costs about **3–6 KB**, where the previous version returned up to **153 KB** for a single component.

> **Why not the official Storybook MCP?** It cannot serve IGDS consumers today: IGDS runs Storybook 10.3.5 / Angular, while the official MCP requires 10.5+, is React-only in preview, and attaches to a *local* dev server. See [docs/EVALUATION.md](docs/EVALUATION.md) for the full assessment and the conditions under which we should switch to it.

---

## What an agent gets

```
get-component("Button")
```

```markdown
# Button `<igds-button>`

The component allows the user to perform actions with one click
**Frameworks:** angular, react, core-web · **Category:** Buttons
**Import:** `import '@igds/core-web';`

## Props (14)

| prop | type | default | required | description |
|---|---|---|---|---|
| disabled | boolean | false |  | Disables interaction. |
| loading | boolean | false |  | Shows loading state and disables interaction while active. |
| size | 'small' \| 'medium' \| 'large' | medium |  | Button size. Defaults to 'medium'. |
| type | 'button' \| 'submit' \| 'reset' | button |  | Native button type. Defaults to 'button'. |
| variant | 'primary' \| 'secondary' \| 'alternative' \| 'link' \| 'link-inline' | primary |  | Visual style of the button. Defaults to 'primary'. |
...

## Events

| event | description |
|---|---|
| igds-click | payload: CustomEvent<{ value: { nativeEvent: PointerEvent } }> from ig |
...

## Usage — Default (core-web)
```html
<igds-button class="button" variant="primary" size="medium">
  כפתור ראשי
</igds-button>
```
```

The legal values, descriptions and events are real — from IGDS's own hand-written per-framework API tables where they exist, falling back to the component's manifest and finally to values mined from the design system's own stories — so an agent cannot invent a `variant` that does not exist.

```

## Quick Start

### Connect over stdio

Build once locally — this doesn't change per client, every one of them below just needs to point `node` at the resulting file:

```bash
git clone https://github.com/michab23/igds-storybook-MCP.git
cd igds-storybook-mcp
npm install
npm run build       # produces dist/index.js
```

Then use the generic config shape most MCP clients read directly:

```json
{
  "mcpServers": {
    "igds": {
      "command": "node",
      "args": ["<path-to-project>/dist/index.js"]
    }
  }
}
```

### Client-specific setup

A few tools use a different entry point or config shape instead of the generic block above:

**Claude Code**

```bash
claude mcp add igds --scope project -- node <path-to-project>/dist/index.js
```

`--scope project` writes the entry to `.mcp.json` in the current repo so teammates get it via version control; drop the flag for a personal-only entry, or use `--scope user` to make it available across every project.

**Gemini CLI** — add the same `mcpServers` block above to `.gemini/settings.json` (project) or `~/.gemini/settings.json` (user).

**OpenCode** — different shape: `mcp` instead of `mcpServers`, and `command` is an array. Add to `opencode.json` in the workspace root:

```json
{
  "mcp": {
    "igds": {
      "type": "local",
      "command": ["node", "<path-to-project>/dist/index.js"],
      "enabled": true
    }
  }
}
```

**Kiro** — same `mcpServers` shape as the generic block, plus two Kiro-specific fields. Add to `.kiro/settings/mcp.json` (workspace) or `~/.kiro/settings/mcp.json` (user):

```json
{
  "mcpServers": {
    "igds": {
      "command": "node",
      "args": ["<path-to-project>/dist/index.js"],
      "disabled": false,
      "autoApprove": []
    }
  }
}
```

`autoApprove` lists tool names Kiro should run without a confirmation prompt — leave it empty to confirm every call.

Use an absolute path for `<path-to-project>` in all of the above — a relative one resolves against whatever working directory each tool happens to launch from.

### Connect over HTTP

```bash
npm run http    # http://localhost:3000/mcp  (PORT to override)
```

Each session gets its own server instance, so concurrent clients are safe. `GET /health` reports version and live session count.

`/mcp` implements the MCP Streamable HTTP protocol, not a webpage — opening it directly in a browser shows `{"error":"Invalid or missing session ID"}`, which is expected since every request needs an `mcp-session-id` header obtained via an `initialize` POST. To exercise it:

- **MCP Inspector**: `npx @modelcontextprotocol/inspector --transport streamable-http http://localhost:3000/mcp`
- **A real MCP client** — point its config at the URL, e.g. `{ "mcpServers": { "igds": { "url": "http://localhost:3000/mcp" } } }`
- **`npm run verify:http`** — spins up its own instance and drives two full MCP sessions through it automatically

### Suggested agent workflow

1. `search-components` to find the right component.
2. `get-component` before writing any markup — use only props and values it lists.
3. `get-component-examples` if you need more than the canonical snippet.
4. `get-design-guidance` when accessibility or RTL matters.

---

## Available Tools

Five tools, ~3 KB of tool definitions total.

| Tool | Parameters | Returns |
|------|-----------|---------|
| `search-components` | `query`, `framework?` | Matching component names + why they matched. References only — never bodies. |
| `list-components` | `framework?`, `category?` | Index of components: name, tag, category, summary. |
| `get-component` | `component`, `framework?`, `detail?` | The API contract: props with types, legal values, defaults, plus one usage snippet. |
| `get-component-examples` | `component`, `framework?`, `variant?`, `limit?` | Usage code snippets from the design system's stories. Code only. |
| `get-design-guidance` | `component` | When to use, when not to, accessibility requirements, RTL notes. |

Freshness metadata (`scrapedAt`, `builtAt`, known gaps) is exposed as the MCP **resource** `igds://meta`, so it costs no tool-list context.

---

## Architecture

The component data behind these tools ships pre-built in the npm package (`data/igds-agent-docs.json`) — there's nothing for a consumer to fetch or generate. It's produced once, offline, by the maintainers from a scrape of IGDS's own Storybook and Zeroheight sites, then distilled down to just the API contract:

```
igds-storybook.globalbit.dev  ──►  data/igds-agent-docs.json  ──►  the 5 tools above
   + zeroheight docs               (~500 KB, committed & published)
```

Rendered HTML is captured in that process only to mine the real attribute vocabulary and distil usage snippets — it is never served to an agent. `npm run verify` enforces that.

Import statement shapes (`import { Button } from '@igds/react'` vs. `import '@igds/core-web'` vs. Angular's per-component deep imports) are configured in [data/packages.json](data/packages.json) from the IGDS monorepo's publish targets, and confirmed against real IGDS usage samples rather than assumed.

## Project layout

| Path | Purpose |
|------|---------|
| `src/agent-docs.ts` | The agent-facing model and the store tools read from. |
| `src/tools.ts` | The five MCP tools. |
| `src/format.ts` | Markdown rendering and context budgets. |
| `src/index.ts`, `src/http-server.ts` | stdio and HTTP entry points. |
| `src/build-agent-docs.ts` | Raw scrape → agent docs transform (maintainer use only). |
| `src/light-dom.ts` | Mines attribute vocabulary and usage snippets from captured markup. |
| `src/zeroheight-clean.ts` | Strips site chrome from Zeroheight text, extracts guidance. |
| `src/scrape-all.ts`, `src/scrapers/` | Scraping pipeline (maintainer use only). |
| `docs/EVALUATION.md` | Official-MCP and Graphify assessment. |

---

## Development

```bash
npm run verify
```

Checks that the served artifact contains no `renderedHtml`, `cssStyles`, `<storybook-root`, `_ngcontent` or site navigation; that components have props, usage and legal values; that the tool surface stays small; and that every `get-component` response stays within budget.

Current measurements:

| Metric | Value |
|--------|-------|
| Components | 50 |
| With props / usage | 49 / 50 |
| With documented legal values | 40 |
| With documented events | 38 |
| `get-component` p50 / p95 / max | 2,720 / 4,818 / 5,678 chars |
| Worst case vs. previous version | 5,678 vs. 153,245 chars (**27× smaller**) |
| Child elements attached to parents | 12 |
| Tool definitions | 5 tools, 3,125 chars |

Numbers are from a full live scrape of all three frameworks, not a partial or synthetic run.

| Command | Purpose |
|---------|---------|
| `npm run verify` | Content and context-budget gates (see above). |
| `npm run verify:http` | Starts the HTTP server and drives two concurrent sessions. |
| `npm run inspector` | MCP Inspector over stdio. |

Refreshing `data/igds-agent-docs.json` from a new IGDS release is a maintainer task, not part of normal setup — see `src/scrape-all.ts` and `src/build-agent-docs.ts` if you're doing that.

## License

ISC
