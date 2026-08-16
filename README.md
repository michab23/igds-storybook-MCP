# IGDS Storybook MCP Server

MCP server for the Israeli Government Design System (IGDS) component documentation. Provides access to Storybook component data and Zeroheight design system documentation.

## Overview

This server exposes **17 tools** for querying IGDS components across:

- **Storybook**: Angular, React, Core-Web frameworks with source code, props, and rendered examples
- **Zeroheight**: Design guidelines, usage documentation, accessibility info, and images

## Installation

```bash
npm install
```

## Running the Server

```bash
# Build TypeScript
npm run build

# Start the MCP server
npm run start
```

The server runs via stdio transport and connects to MCP clients.

## Using with Claude Desktop

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "igds-storybook": {
      "command": "node",
      "args": ["<path-to-project>/dist/index.js"]
    }
  }
}
```

Replace `<path-to-project>` with the actual path to this project on your machine.

## Using with MCP Inspector

```bash
npx @modelcontextprotocol/inspector --transport stdio -- node dist/index.js
```

## Running over HTTP/SSE

To expose the MCP server over HTTP/SSE instead of stdio:

```bash
# Install dependencies for HTTP transport
npm install @modelcontextprotocol/sdk express

# Run with HTTP transport
npx tsx -e "
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import express from 'express';

const app = express();
app.use(express.json());

const server = new McpServer({ name: 'igds-storybook', version: '1.0.0' });

// ... (register tools from src/index.ts)

app.get('/sse', async (req, res) => {
  const transport = new SSEServerTransport('/messages', res);
  await server.connect(transport);
});

app.post('/messages', async (req, res) => {
  // Handle messages
});

app.listen(3000, () => console.log('MCP server running on http://localhost:3000'));
"
```

Then connect to `http://localhost:3000/sse` from your MCP client.

## MCP Tools

### Storybook Tools

| Tool | Description | Parameters |
|------|-------------|------------|
| `load-storybook` | Load Storybook data for a framework | `framework?`: angular/react/core-web |
| `list-components` | List components for a framework | `framework`: angular/react/core-web |
| `get-component` | Get component docs with argTypes | `framework`, `componentName` |
| `get-component-source` | Get source code structure (properties, CSS, defaults) | `framework`, `componentName` |
| `get-component-css` | Get CSS styles | `framework`, `componentName` |
| `get-component-stories` | Get all story variants | `framework`, `componentName` |
| `get-story-examples` | Get rendered HTML examples | `framework`, `componentName`, `storyName?` |
| `get-story` | Get story entry by ID | `framework`, `storyId` |
| `search-components` | Search across frameworks | `query` |
| `compare-component` | Compare across Angular/React/Core-Web | `componentName` |

### Zeroheight Tools

| Tool | Description | Parameters |
|------|-------------|------------|
| `zeroheight-list-categories` | List component categories | (none) |
| `zeroheight-list-components` | List components | `category?` |
| `zeroheight-get-component` | Get full component documentation | `componentName` |
| `zeroheight-get-section` | Get design/code/usage/accessibility section | `componentName`, `section` |
| `zeroheight-search` | Search Zeroheight content | `query` |
| `zeroheight-get-storybook-ref` | Get Storybook cross-references | `componentName` |

### Utility

| Tool | Description | Parameters |
|------|-------------|------------|
| `get-stats` | Get data statistics | (none) |

## Data Included

### Storybook (145 components)

- **Angular**: 48 components, 473 stories, 75 source classes
- **React**: 48 components, 425 stories, 68 source classes
- **Core-Web**: 49 components, 435 stories, 53 source classes

### Zeroheight (50+ components)

- **7 categories**: Buttons, Input & Selection, Indicator & Status, Content Display, Navigation, Messaging, Data & Tables
- **Sections**: Design, Code, Usage, Accessibility for each component
- **1000+ images** downloaded locally
- **Bidirectional cross-references** to Storybook components

## Data Files

| File | Description |
|------|-------------|
| `data/igds-storybook-data.json` | Storybook components, source code, stories |
| `data/zeroheight-data.json` | Zeroheight docs with cross-references |
| `data/images/zeroheight/` | Downloaded component images |

## License

ISC
