# IGDS MCP Server

An MCP server that gives coding agents the **component contract** for the Israeli Government Design System (IGDS) — props, legal values, defaults, usage snippets and design rules — and nothing else.

No rendered HTML. No CSS. No Storybook chrome. A `get-component` call costs about **3–6 KB**, where the previous version returned up to **153 KB** for a single component.

> **Why not the official Storybook MCP?** It cannot serve IGDS consumers today: IGDS runs Storybook 10.3.5 / Angular, while the official MCP requires 10.5+, is React-only in preview, and attaches to a *local* dev server. See [docs/EVALUATION.md](docs/EVALUATION.md) for the full assessment and the conditions under which we should switch to it.

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

## Tools

Five tools, ~3 KB of tool definitions total.

| Tool | Parameters | Returns |
|------|-----------|---------|
| `search-components` | `query`, `framework?` | Matching component names + why they matched. References only — never bodies. |
| `list-components` | `framework?`, `category?` | Index of components: name, tag, category, summary. |
| `get-component` | `component`, `framework?`, `detail?` | The API contract: props with types, legal values, defaults, plus one usage snippet. |
| `get-component-examples` | `component`, `framework?`, `variant?`, `limit?` | Usage code snippets from the design system's stories. Code only. |
| `get-design-guidance` | `component` | When to use, when not to, accessibility requirements, RTL notes. |

Freshness metadata (`scrapedAt`, `builtAt`, known gaps) is exposed as the MCP **resource** `igds://meta`, so it costs no tool-list context.

### Suggested agent workflow

1. `search-components` to find the right component.
2. `get-component` before writing any markup — use only props and values it lists.
3. `get-component-examples` if you need more than the canonical snippet.
4. `get-design-guidance` when accessibility or RTL matters.

## Setup

```bash
npm install
npm run build       # compile TypeScript to dist/
npm run build:docs  # produce data/igds-agent-docs.json from the raw scrape
```

### Connect over stdio

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

Or, once published, without cloning:

```json
{
  "mcpServers": {
    "igds": { "command": "npx", "args": ["-y", "igds-storybook-mcp"] }
  }
}
```

### Connect over HTTP

```bash
npm run http    # http://localhost:3000/mcp  (PORT to override)
```

Each session gets its own server instance, so concurrent clients are safe. `GET /health` reports version and live session count.

**Opening `http://localhost:3000/mcp` directly in a browser will show `{"error":"Invalid or missing session ID"}` — this is correct, not a bug.** `/mcp` implements the MCP Streamable HTTP protocol, not a webpage: every request needs an `mcp-session-id` header, obtained by first `POST`ing an `initialize` message, which a browser navigation never does. To actually exercise it:

- **MCP Inspector** (visual, no client setup needed): `npx @modelcontextprotocol/inspector --transport streamable-http http://localhost:3000/mcp`
- **A real MCP client** — point its config at the URL, e.g. `{ "mcpServers": { "igds": { "url": "http://localhost:3000/mcp" } } }`
- **`GET /health`** for a plain-JSON liveness check — works in a browser since it isn't part of the MCP protocol
- **`npm run verify:http`** — spins up its own instance and drives two full MCP sessions through it automatically

## Data pipeline

```
scrape  ──►  data/igds-storybook-data.json   (raw source of record, ~4.6 MB)
             data/zeroheight-data.json
   │
   └─ build:docs ──►  data/igds-agent-docs.json   (what the tools serve, ~500 KB)
```

| Command | Purpose |
|---------|---------|
| `npm run scrape` | Re-scrape Storybook + Zeroheight into the raw files. Needs network. |
| `npm run build:docs` | Transform raw → agent docs. Offline. Reports coverage and fails on presentation leakage. |
| `npm run verify` | Content and context-budget gates (see below). |
| `npm run verify:http` | Starts the HTTP server and drives two concurrent sessions. |
| `npm run inspector` | MCP Inspector over stdio. |

Rendered HTML is still captured in the **raw** scrape — `build:docs` mines it to recover the real attribute vocabulary and to distil usage snippets — but it is never served to an agent. `npm run verify` enforces that.

### Import statements

Package names cannot be derived from the published Storybook — nothing in it names a package. They are configured instead, in [data/packages.json](data/packages.json), from the IGDS monorepo's nx publish targets, and both shapes below are confirmed against real IGDS sources (not assumed):

```json
{
  "core-web": "@igds/core-web",
  "react": "@igds/react",
  "angular": { "package": "@igds/angular", "import": "import { Igds{component} } from '{package}/{path}';" }
}
```

A value is either a plain package name — which uses the default import shape for that framework — or an object with an explicit `import` template supporting `{component}` (a valid PascalCase identifier derived from the display name, never the raw name itself — see below), `{package}`, `{tag}` (`igds-accordion-item`) and `{path}` (the tag without its `igds-` prefix, for deep subpath imports). Re-run `npm run build:docs` after editing.

- **Angular** deep-imports a standalone `Igds`-prefixed component per subpath — `import { IgdsAccordionItem } from '@igds/angular/accordion-item';` — which the consumer then lists in its own `imports: [...]`. Confirmed from a real IGDS usage sample.
- **React** imports the plain PascalCase symbol from the package root — `import { Accordion } from '@igds/react';` — no deep subpath. Confirmed independently from the React docs page's own text: *"The Accordion component from `@igds/react`..."*
- **core-web** uses a side-effect import for the self-registering custom elements — `import '@igds/core-web';`

Component display names can contain spaces or punctuation ("Date Picker", "Drag & Drop List") that are not valid in an import statement — `{component}` is always a sanitized PascalCase identifier (`DatePicker`, `DragDropList`), never the raw display name.

Two further published packages, `@igds/tokens` and `@igds/icons`, are not currently surfaced by any tool.

### Scraping notes

- The scrape needs network access to `igds-storybook.globalbit.dev`. Behind a TLS-intercepting proxy, set `NODE_EXTRA_CA_CERTS` to your corporate root certificate — the correct fix, since it keeps real certificate validation. If that certificate isn't available to you, `IGDS_SCRAPE_INSECURE_TLS=1` (paired with `NODE_TLS_REJECT_UNAUTHORIZED=0` for the plain `fetch()` calls) disables TLS verification for the scrape only; this is a real security regression on an untrusted network, so treat it as a last resort, not a default.
- `IGDS_SCRAPE_LIMIT=N` caps each framework to its first N components — useful for validating a change to the scraper end-to-end (a couple of minutes) before committing to a full run (roughly an hour). The scrape is incremental and resumable: running again without the limit fills in the rest rather than starting over.
- `data/images/` (95 MB of Zeroheight screenshots) is retained on disk for designers but is exposed by no tool.

## Verification

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

Numbers are from a full live scrape of all three frameworks (`npm run scrape`), not a partial or synthetic run.

## Project layout

| Path | Purpose |
|------|---------|
| `src/agent-docs.ts` | The agent-facing model and the store tools read from. |
| `src/build-agent-docs.ts` | Raw scrape → agent docs transform. |
| `src/light-dom.ts` | Mines attribute vocabulary and usage snippets from captured markup. |
| `src/zeroheight-clean.ts` | Strips site chrome from Zeroheight text, extracts guidance. |
| `src/tools.ts` | The five MCP tools. |
| `src/format.ts` | Markdown rendering and context budgets. |
| `src/scrape-all.ts`, `src/scrapers/` | Scraping pipeline. |
| `docs/EVALUATION.md` | Official-MCP and Graphify assessment. |

## License

ISC
