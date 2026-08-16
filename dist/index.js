#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { CachedDataLoader } from './cached-loader.js';
import { DataStore } from './data-store.js';
import { ZeroheightLoader } from './zeroheight-loader.js';
const cachedLoader = new CachedDataLoader();
const liveStore = new DataStore();
const zeroheightLoader = new ZeroheightLoader();
let useCache = false;
let useZeroheight = false;
const server = new McpServer({
    name: 'igds-storybook',
    version: '1.1.0',
});
// Check for cached data on startup
if (cachedLoader.isAvailable()) {
    useCache = true;
    console.error('Using cached storybook data');
}
// Check for Zeroheight data on startup
if (zeroheightLoader.isAvailable()) {
    useZeroheight = true;
    console.error('Using cached Zeroheight data');
}
// Tool: Load storybook data
server.tool('load-storybook', 'Load IGDS Storybook data for a specific framework or all frameworks', {
    framework: z.enum(['angular', 'react', 'core-web']).optional().describe('Framework to load (omit for all)'),
}, async ({ framework }) => {
    if (useCache) {
        const stats = cachedLoader.getStats();
        return {
            content: [{
                    type: 'text',
                    text: JSON.stringify({
                        message: 'Using cached storybook data',
                        scrapedAt: cachedLoader.getScrapedAt(),
                        stats,
                    }, null, 2),
                }],
        };
    }
    if (framework) {
        await liveStore.loadFramework(framework);
    }
    else {
        await liveStore.loadAll();
    }
    const stats = liveStore.getStats();
    return {
        content: [{
                type: 'text',
                text: JSON.stringify({
                    message: 'Storybook data loaded via live scraping',
                    stats,
                }, null, 2),
            }],
    };
});
// Tool: List components
server.tool('list-components', 'List all available IGDS components for a framework', {
    framework: z.enum(['angular', 'react', 'core-web']).describe('Framework to list components for'),
}, async ({ framework }) => {
    const fw = framework;
    const components = useCache
        ? cachedLoader.listComponents(fw)
        : await (async () => {
            await liveStore.loadFramework(fw);
            return liveStore.listComponents(fw);
        })();
    return {
        content: [{
                type: 'text',
                text: JSON.stringify({
                    framework,
                    count: components.length,
                    components,
                }, null, 2),
            }],
    };
});
// Tool: Get component details
server.tool('get-component', 'Get detailed documentation for a specific IGDS component including argTypes and source code', {
    framework: z.enum(['angular', 'react', 'core-web']).describe('Framework'),
    componentName: z.string().describe('Component name (e.g., "Accordion", "Button")'),
}, async ({ framework, componentName }) => {
    const fw = framework;
    const docs = useCache
        ? cachedLoader.getComponent(fw, componentName)
        : await (async () => {
            await liveStore.loadFramework(fw);
            return liveStore.getComponent(fw, componentName);
        })();
    if (!docs) {
        return {
            content: [{
                    type: 'text',
                    text: `Component "${componentName}" not found in ${framework} storybook.`,
                }],
            isError: true,
        };
    }
    return {
        content: [{
                type: 'text',
                text: JSON.stringify(docs, null, 2),
            }],
    };
});
// Tool: Get component source code
server.tool('get-component-source', 'Get the source code structure for a component (properties, CSS, defaults)', {
    framework: z.enum(['angular', 'react', 'core-web']).describe('Framework'),
    componentName: z.string().describe('Component name (e.g., "Accordion", "Button")'),
}, async ({ framework, componentName }) => {
    const fw = framework;
    if (!useCache) {
        return {
            content: [{
                    type: 'text',
                    text: 'Source code data requires cached data. Run "npm run scrape" first.',
                }],
            isError: true,
        };
    }
    const source = cachedLoader.getSource(fw, componentName);
    if (!source) {
        return {
            content: [{
                    type: 'text',
                    text: `Source code for "${componentName}" not found in ${framework}.`,
                }],
            isError: true,
        };
    }
    return {
        content: [{
                type: 'text',
                text: JSON.stringify(source, null, 2),
            }],
    };
});
// Tool: Search components
server.tool('search-components', 'Search for IGDS components across all frameworks', {
    query: z.string().describe('Search query (matches component names)'),
}, async ({ query }) => {
    const results = useCache
        ? cachedLoader.searchComponents(query)
        : liveStore.searchComponents(query);
    return {
        content: [{
                type: 'text',
                text: JSON.stringify({
                    query,
                    count: results.length,
                    results: results.map(r => ({
                        framework: r.framework,
                        componentName: r.componentName,
                        url: r.url,
                    })),
                }, null, 2),
            }],
    };
});
// Tool: Get component by story ID
server.tool('get-story', 'Get story entry details by its ID', {
    framework: z.enum(['angular', 'react', 'core-web']).describe('Framework'),
    storyId: z.string().describe('Story ID (e.g., "accordion--default")'),
}, async ({ framework, storyId }) => {
    const fw = framework;
    const entry = useCache
        ? cachedLoader.getStoryEntry(fw, storyId)
        : await (async () => {
            await liveStore.loadFramework(fw);
            return liveStore.getStoryEntry(fw, storyId);
        })();
    if (!entry) {
        return {
            content: [{
                    type: 'text',
                    text: `Story "${storyId}" not found in ${framework} storybook.`,
                }],
            isError: true,
        };
    }
    return {
        content: [{
                type: 'text',
                text: JSON.stringify(entry, null, 2),
            }],
    };
});
// Tool: Compare component across frameworks
server.tool('compare-component', 'Compare a component across Angular, React, and Core-Web frameworks', {
    componentName: z.string().describe('Component name to compare'),
}, async ({ componentName }) => {
    if (!useCache) {
        await liveStore.loadAll();
    }
    const comparison = {};
    for (const fw of ['angular', 'react', 'core-web']) {
        comparison[fw] = useCache
            ? cachedLoader.getComponent(fw, componentName)
            : liveStore.getComponent(fw, componentName);
    }
    const available = Object.entries(comparison)
        .filter(([, docs]) => docs !== undefined)
        .map(([framework]) => framework);
    if (available.length === 0) {
        return {
            content: [{
                    type: 'text',
                    text: `Component "${componentName}" not found in any framework.`,
                }],
            isError: true,
        };
    }
    return {
        content: [{
                type: 'text',
                text: JSON.stringify({
                    componentName,
                    availableIn: available,
                    comparison,
                }, null, 2),
            }],
    };
});
// Tool: Get all stories for a component
server.tool('get-component-stories', 'Get all story variants for a component', {
    framework: z.enum(['angular', 'react', 'core-web']).describe('Framework'),
    componentName: z.string().describe('Component name'),
}, async ({ framework, componentName }) => {
    const fw = framework;
    const docs = useCache
        ? cachedLoader.getComponent(fw, componentName)
        : await (async () => {
            await liveStore.loadFramework(fw);
            return liveStore.getComponent(fw, componentName);
        })();
    if (!docs) {
        return {
            content: [{
                    type: 'text',
                    text: `Component "${componentName}" not found in ${framework} storybook.`,
                }],
            isError: true,
        };
    }
    const entries = useCache
        ? cachedLoader.getAllEntries(fw)
        : liveStore.getAllEntries(fw);
    const componentEntries = Object.values(entries).filter(e => e.title.toLowerCase().includes(componentName.toLowerCase()));
    return {
        content: [{
                type: 'text',
                text: JSON.stringify({
                    framework,
                    componentName,
                    stories: docs.stories,
                    allEntries: componentEntries.map(e => ({
                        id: e.id,
                        name: e.name,
                        type: e.type,
                        url: `https://igds-storybook.globalbit.dev/develop/${framework}/?path=/story/${e.id}`,
                    })),
                }, null, 2),
            }],
    };
});
// Tool: Get component CSS
server.tool('get-component-css', 'Get CSS styles for a component', {
    framework: z.enum(['angular', 'react', 'core-web']).describe('Framework'),
    componentName: z.string().describe('Component name'),
}, async ({ framework, componentName }) => {
    const fw = framework;
    if (!useCache) {
        return {
            content: [{
                    type: 'text',
                    text: 'CSS data requires cached data. Run "npm run scrape" first.',
                }],
            isError: true,
        };
    }
    const source = cachedLoader.getSource(fw, componentName);
    if (!source || !source.cssStyles.length) {
        return {
            content: [{
                    type: 'text',
                    text: `No CSS styles found for "${componentName}" in ${framework}.`,
                }],
            isError: true,
        };
    }
    return {
        content: [{
                type: 'text',
                text: JSON.stringify({
                    framework,
                    componentName,
                    tagName: source.tagName,
                    cssStyles: source.cssStyles,
                }, null, 2),
            }],
    };
});
// Tool: Get story examples for a component
server.tool('get-story-examples', 'Get rendered HTML examples from Storybook stories for a component', {
    framework: z.enum(['angular', 'react', 'core-web']).describe('Framework to search'),
    componentName: z.string().describe('Component name'),
    storyName: z.string().optional().describe('Specific story name (optional, returns all if omitted)'),
}, async ({ framework, componentName, storyName }) => {
    let stories;
    if (useCache) {
        stories = cachedLoader.getStories(framework, componentName);
    }
    else {
        const data = liveStore.data;
        stories = data?.storyExamples?.[framework]?.[componentName];
    }
    if (!stories || stories.length === 0) {
        return {
            content: [{
                    type: 'text',
                    text: `No story examples found for "${componentName}" in ${framework}.`,
                }],
            isError: true,
        };
    }
    // Filter by story name if specified
    const filtered = storyName
        ? stories.filter((s) => s.name.toLowerCase().includes(storyName.toLowerCase()))
        : stories;
    return {
        content: [{
                type: 'text',
                text: JSON.stringify({
                    framework,
                    componentName,
                    stories: filtered.map((s) => ({
                        name: s.name,
                        url: s.url,
                        renderedHtml: s.renderedHtml,
                        sourceCode: s.sourceCode,
                    })),
                }, null, 2),
            }],
    };
});
// Tool: Get storybook stats
server.tool('get-stats', 'Get statistics about loaded storybook data', {}, async () => {
    const stats = useCache
        ? cachedLoader.getStats()
        : liveStore.getStats();
    // Count total stories
    let totalStories = 0;
    for (const fw of ['angular', 'react', 'core-web']) {
        const fwStats = stats[fw];
        if (typeof fwStats === 'object' && 'stories' in fwStats) {
            totalStories += fwStats.stories;
        }
    }
    const result = {
        mode: useCache ? 'cached' : 'live',
        totalComponents: Object.values(stats).reduce((sum, s) => {
            if (typeof s === 'object' && 'docs' in s)
                return sum + s.docs;
            return sum;
        }, 0),
        totalStories,
        stats,
    };
    // Add Zeroheight stats if available
    if (useZeroheight) {
        try {
            const zhStats = zeroheightLoader.getStats();
            result.zeroheight = zhStats;
        }
        catch (e) {
            // Zeroheight data not available
        }
    }
    return {
        content: [{
                type: 'text',
                text: JSON.stringify(result, null, 2),
            }],
    };
});
// Zeroheight Tools
// Tool: List Zeroheight categories
server.tool('zeroheight-list-categories', 'List all component categories from Zeroheight design system documentation', {}, async () => {
    if (!useZeroheight) {
        return {
            content: [{
                    type: 'text',
                    text: 'Zeroheight data not available. Run "npm run scrape" first.',
                }],
            isError: true,
        };
    }
    const categories = zeroheightLoader.listCategories();
    return {
        content: [{
                type: 'text',
                text: JSON.stringify({ categories }, null, 2),
            }],
    };
});
// Tool: List Zeroheight components
server.tool('zeroheight-list-components', 'List components from Zeroheight (optionally filtered by category)', {
    category: z.string().optional().describe('Filter by category name'),
}, async ({ category }) => {
    if (!useZeroheight) {
        return {
            content: [{
                    type: 'text',
                    text: 'Zeroheight data not available. Run "npm run scrape" first.',
                }],
            isError: true,
        };
    }
    const components = zeroheightLoader.listComponents(category);
    return {
        content: [{
                type: 'text',
                text: JSON.stringify({
                    category: category || 'all',
                    count: components.length,
                    components: components.map(c => ({
                        name: c.name,
                        category: c.category,
                        url: c.url,
                        storybookRef: c.storybookCrossRef,
                    })),
                }, null, 2),
            }],
    };
});
// Tool: Get Zeroheight component
server.tool('zeroheight-get-component', 'Get full component documentation from Zeroheight', {
    componentName: z.string().describe('Component name'),
}, async ({ componentName }) => {
    if (!useZeroheight) {
        return {
            content: [{
                    type: 'text',
                    text: 'Zeroheight data not available. Run "npm run scrape" first.',
                }],
            isError: true,
        };
    }
    const component = zeroheightLoader.getComponent(componentName);
    if (!component) {
        return {
            content: [{
                    type: 'text',
                    text: `Component "${componentName}" not found in Zeroheight.`,
                }],
            isError: true,
        };
    }
    return {
        content: [{
                type: 'text',
                text: JSON.stringify(component, null, 2),
            }],
    };
});
// Tool: Get Zeroheight section
server.tool('zeroheight-get-section', 'Get a specific section (design/code/usage/accessibility) for a component', {
    componentName: z.string().describe('Component name'),
    section: z.enum(['design', 'code', 'usage', 'accessibility']).describe('Section to retrieve'),
}, async ({ componentName, section }) => {
    if (!useZeroheight) {
        return {
            content: [{
                    type: 'text',
                    text: 'Zeroheight data not available. Run "npm run scrape" first.',
                }],
            isError: true,
        };
    }
    const sectionData = zeroheightLoader.getComponentSection(componentName, section);
    if (!sectionData) {
        return {
            content: [{
                    type: 'text',
                    text: `Section "${section}" not found for component "${componentName}".`,
                }],
            isError: true,
        };
    }
    return {
        content: [{
                type: 'text',
                text: JSON.stringify({
                    component: componentName,
                    section,
                    ...sectionData,
                }, null, 2),
            }],
    };
});
// Tool: Search Zeroheight
server.tool('zeroheight-search', 'Search across all Zeroheight content', {
    query: z.string().describe('Search query'),
}, async ({ query }) => {
    if (!useZeroheight) {
        return {
            content: [{
                    type: 'text',
                    text: 'Zeroheight data not available. Run "npm run scrape" first.',
                }],
            isError: true,
        };
    }
    const results = zeroheightLoader.searchComponents(query);
    return {
        content: [{
                type: 'text',
                text: JSON.stringify({
                    query,
                    count: results.length,
                    results: results.map(c => ({
                        name: c.name,
                        category: c.category,
                        url: c.url,
                        storybookRef: c.storybookCrossRef,
                    })),
                }, null, 2),
            }],
    };
});
// Tool: Get Storybook cross-reference
server.tool('zeroheight-get-storybook-ref', 'Get Storybook cross-references for a Zeroheight component', {
    componentName: z.string().describe('Zeroheight component name'),
}, async ({ componentName }) => {
    if (!useZeroheight) {
        return {
            content: [{
                    type: 'text',
                    text: 'Zeroheight data not available. Run "npm run scrape" first.',
                }],
            isError: true,
        };
    }
    const ref = zeroheightLoader.getStorybookRef(componentName);
    if (!ref) {
        return {
            content: [{
                    type: 'text',
                    text: `No Storybook reference found for "${componentName}".`,
                }],
            isError: true,
        };
    }
    return {
        content: [{
                type: 'text',
                text: JSON.stringify({
                    componentName,
                    storybook: ref,
                }, null, 2),
            }],
    };
});
async function main() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error('IGDS Storybook MCP server running');
}
main().catch(console.error);
//# sourceMappingURL=index.js.map