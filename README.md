# IGDS Storybook MCP Server

MCP server for the Israeli Government Design System (IGDS) component documentation. Provides access to Storybook component data and Zeroheight design system documentation.

## Overview

This server exposes **17 tools** for querying IGDS components across:

- **Storybook**: Angular, React, Core-Web frameworks with source code, props, and rendered examples
- **Zeroheight**: Design guidelines, usage documentation, accessibility info, and images

## Quick Start

```bash
# Install dependencies
npm install

# Scrape all data (Storybook + Zeroheight)
npm run scrape

# Build and run
npm run build
npm run start
```

## MCP Tools

### Storybook Tools

| Tool | Description |
|------|-------------|
| `load-storybook` | Load Storybook data for a framework |
| `list-components` | List components for a framework |
| `get-component` | Get component docs with argTypes |
| `get-component-source` | Get source code structure |
| `get-component-css` | Get CSS styles |
| `get-component-stories` | Get all story variants |
| `get-story-examples` | Get rendered HTML examples |
| `get-story` | Get story entry by ID |
| `search-components` | Search across frameworks |
| `compare-component` | Compare across Angular/React/Core-Web |

### Zeroheight Tools

| Tool | Description |
|------|-------------|
| `zeroheight-list-categories` | List component categories |
| `zeroheight-list-components` | List components (optionally by category) |
| `zeroheight-get-component` | Get full component documentation |
| `zeroheight-get-section` | Get design/code/usage/accessibility section |
| `zeroheight-search` | Search Zeroheight content |
| `zeroheight-get-storybook-ref` | Get Storybook cross-references |

### Utility

| Tool | Description |
|------|-------------|
| `get-stats` | Get data statistics |

## Data Sources

### Storybook

Scrapes from `https://igds-storybook.globalbit.dev/develop/`:

- **Angular**: 48 components, 473 stories, 75 source classes
- **React**: 48 components, 425 stories, 68 source classes
- **Core-Web**: 49 components, 435 stories, 53 source classes

### Zeroheight

Scrapes from `https://igds.gov.il/4988d5140/`:

- **7 categories**: Buttons, Input & Selection, Indicator & Status, Content Display, Navigation, Messaging, Data & Tables
- **50+ components** with Design, Code, Usage, Accessibility sections
- **1000+ images** downloaded locally
- **Bidirectional cross-references** to Storybook components

## Architecture

```
┌─────────────────────────────────────────────────────┐
│  Scraping (npm run scrape)                          │
│                                                     │
│  1. Storybook index.json → Component list           │
│  2. Playwright → argTypes, descriptions             │
│  3. Bundle parser → Source code extraction           │
│  4. Playwright → Story examples (HTML)              │
│  5. Zeroheight scraper → Design docs + images       │
│  6. Cross-reference mapping                         │
│                                                     │
│  Output: data/*.json                                │
└──────────────────────┬──────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────┐
│  MCP Server (17 tools via stdio)                    │
│                                                     │
│  CachedDataLoader ← igds-storybook-data.json        │
│  ZeroheightLoader  ← zeroheight-data.json           │
│                                                     │
│  Returns JSON via MCP protocol                      │
└─────────────────────────────────────────────────────┘
```

## Development

```bash
npm run build    # Compile TypeScript
npm run dev      # Run in development mode
npm run scrape   # Scrape all data (takes ~15-20 minutes)
```

## Data Files

| File | Description |
|------|-------------|
| `data/igds-storybook-data.json` | Storybook components, source code, stories |
| `data/zeroheight-data.json` | Zeroheight docs with cross-references |
| `data/images/zeroheight/` | Downloaded component images |

## License

ISC
