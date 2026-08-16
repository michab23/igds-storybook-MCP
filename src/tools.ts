import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { CachedDataLoader } from './cached-loader.js';
import { DataStore } from './data-store.js';
import { StorybookFramework, ComponentDocs } from './types.js';
import { ZeroheightLoader } from './zeroheight-loader.js';

export function registerAllTools(server: McpServer): void {
  const cachedLoader = new CachedDataLoader();
  const liveStore = new DataStore();
  const zeroheightLoader = new ZeroheightLoader();
  let useCache = false;
  let useZeroheight = false;

  if (cachedLoader.isAvailable()) {
    useCache = true;
  }
  if (zeroheightLoader.isAvailable()) {
    useZeroheight = true;
  }

  // Tool: Load storybook data
  server.tool(
    'load-storybook',
    'Load IGDS Storybook data for a specific framework or all frameworks',
    {
      framework: z.enum(['angular', 'react', 'core-web']).optional().describe('Framework to load (omit for all)'),
    },
    async ({ framework }) => {
      if (useCache) {
        const stats = cachedLoader.getStats();
        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              message: 'Using cached storybook data',
              scrapedAt: cachedLoader.getScrapedAt(),
              stats,
            }, null, 2),
          }],
        };
      }
      
      if (framework) {
        await liveStore.loadFramework(framework as StorybookFramework);
      } else {
        await liveStore.loadAll();
      }
      
      const stats = liveStore.getStats();
      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            message: 'Loaded storybook data',
            stats,
          }, null, 2),
        }],
      };
    }
  );

  // Tool: List components
  server.tool(
    'list-components',
    'List all available IGDS components for a specific framework',
    {
      framework: z.enum(['angular', 'react', 'core-web']).describe('Framework to list components for'),
    },
    async ({ framework }) => {
      const components = useCache
        ? cachedLoader.listComponents(framework as StorybookFramework)
        : liveStore.listComponents(framework as StorybookFramework);
      
      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            framework,
            count: components.length,
            components,
          }, null, 2),
        }],
      };
    }
  );

  // Tool: Get component
  server.tool(
    'get-component',
    'Get detailed documentation for a specific IGDS component',
    {
      framework: z.enum(['angular', 'react', 'core-web']).describe('Framework'),
      componentName: z.string().describe('Component name'),
    },
    async ({ framework, componentName }) => {
      const component = useCache
        ? cachedLoader.getComponent(framework as StorybookFramework, componentName)
        : liveStore.getComponent(framework as StorybookFramework, componentName);
      
      if (!component) {
        return {
          content: [{
            type: 'text' as const,
            text: `Component "${componentName}" not found in ${framework} framework.`,
          }],
          isError: true,
        };
      }
      
      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify(component, null, 2),
        }],
      };
    }
  );

  // Tool: Get component source
  server.tool(
    'get-component-source',
    'Get source code structure for a component (properties, CSS, defaults). Requires cached data.',
    {
      framework: z.enum(['angular', 'react', 'core-web']).describe('Framework'),
      componentName: z.string().describe('Component name'),
    },
    async ({ framework, componentName }) => {
      if (!useCache) {
        return {
          content: [{
            type: 'text' as const,
            text: 'Source code requires cached data. Run "npm run scrape" first.',
          }],
          isError: true,
        };
      }
      
      const source = cachedLoader.getSource(framework as StorybookFramework, componentName);
      
      if (!source) {
        return {
          content: [{
            type: 'text' as const,
            text: `Source code for "${componentName}" not found in ${framework}.`,
          }],
          isError: true,
        };
      }
      
      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify(source, null, 2),
        }],
      };
    }
  );

  // Tool: Search components
  server.tool(
    'search-components',
    'Search for IGDS components across all frameworks',
    {
      query: z.string().describe('Search query'),
    },
    async ({ query }) => {
      const results = useCache
        ? cachedLoader.searchComponents(query)
        : liveStore.searchComponents(query);
      
      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            query,
            count: results.length,
            results: results.map(c => ({
              framework: c.framework,
              name: c.componentName,
              title: c.title,
            })),
          }, null, 2),
        }],
      };
    }
  );

  // Tool: Get story
  server.tool(
    'get-story',
    'Get a specific story entry by its ID',
    {
      framework: z.enum(['angular', 'react', 'core-web']).describe('Framework'),
      storyId: z.string().describe('Story ID'),
    },
    async ({ framework, storyId }) => {
      const entry = useCache
        ? cachedLoader.getStoryEntry(framework as StorybookFramework, storyId)
        : liveStore.getStoryEntry(framework as StorybookFramework, storyId);
      
      if (!entry) {
        return {
          content: [{
            type: 'text' as const,
            text: `Story "${storyId}" not found in ${framework} storybook.`,
          }],
          isError: true,
        };
      }
      
      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify(entry, null, 2),
        }],
      };
    }
  );

  // Tool: Compare component
  server.tool(
    'compare-component',
    'Compare a component across Angular, React, and Core-Web frameworks',
    {
      componentName: z.string().describe('Component name to compare'),
    },
    async ({ componentName }) => {
      if (!useCache) {
        await liveStore.loadAll();
      }
      
      const comparison: Record<string, ComponentDocs | undefined> = {};
      for (const fw of ['angular', 'react', 'core-web'] as StorybookFramework[]) {
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
            type: 'text' as const,
            text: `Component "${componentName}" not found in any framework.`,
          }],
          isError: true,
        };
      }
      
      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            componentName,
            available,
            comparison,
          }, null, 2),
        }],
      };
    }
  );

  // Tool: Get component stories
  server.tool(
    'get-component-stories',
    'Get all story variants for a component',
    {
      framework: z.enum(['angular', 'react', 'core-web']).describe('Framework'),
      componentName: z.string().describe('Component name'),
    },
    async ({ framework, componentName }) => {
      const component = useCache
        ? cachedLoader.getComponent(framework as StorybookFramework, componentName)
        : liveStore.getComponent(framework as StorybookFramework, componentName);
      
      if (!component) {
        return {
          content: [{
            type: 'text' as const,
            text: `Component "${componentName}" not found in ${framework}.`,
          }],
          isError: true,
        };
      }
      
      const stories = useCache
        ? cachedLoader.getStories(framework as StorybookFramework, componentName)
        : component.stories;
      
      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            framework,
            componentName,
            storyCount: stories?.length || 0,
            stories: stories || [],
          }, null, 2),
        }],
      };
    }
  );

  // Tool: Get component CSS
  server.tool(
    'get-component-css',
    'Get CSS styles for a component. Requires cached data.',
    {
      framework: z.enum(['angular', 'react', 'core-web']).describe('Framework'),
      componentName: z.string().describe('Component name'),
    },
    async ({ framework, componentName }) => {
      if (!useCache) {
        return {
          content: [{
            type: 'text' as const,
            text: 'CSS styles require cached data. Run "npm run scrape" first.',
          }],
          isError: true,
        };
      }
      
      const source = cachedLoader.getSource(framework as StorybookFramework, componentName);
      
      if (!source || !source.cssStyles.length) {
        return {
          content: [{
            type: 'text' as const,
            text: `No CSS styles found for "${componentName}" in ${framework}.`,
          }],
          isError: true,
        };
      }
      
      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            framework,
            componentName,
            tagName: source.tagName,
            cssStyles: source.cssStyles,
          }, null, 2),
        }],
      };
    }
  );

  // Tool: Get story examples
  server.tool(
    'get-story-examples',
    'Get rendered HTML examples from Storybook stories for a component',
    {
      framework: z.enum(['angular', 'react', 'core-web']).describe('Framework to search'),
      componentName: z.string().describe('Component name'),
      storyName: z.string().optional().describe('Specific story name (optional, returns all if omitted)'),
    },
    async ({ framework, componentName, storyName }) => {
      let stories;
      if (useCache) {
        stories = cachedLoader.getStories(framework as StorybookFramework, componentName);
      } else {
        const data = (liveStore as any).data;
        stories = data?.storyExamples?.[framework]?.[componentName];
      }
      
      if (!stories || stories.length === 0) {
        return {
          content: [{
            type: 'text' as const,
            text: `No story examples found for "${componentName}" in ${framework}.`,
          }],
          isError: true,
        };
      }
      
      const filtered = storyName 
        ? stories.filter((s: any) => s.name.toLowerCase().includes(storyName.toLowerCase()))
        : stories;
      
      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            framework,
            componentName,
            stories: filtered.map((s: any) => ({
              name: s.name,
              url: s.url,
              renderedHtml: s.renderedHtml,
              sourceCode: s.sourceCode,
            })),
          }, null, 2),
        }],
      };
    }
  );

  // Tool: Get storybook stats
  server.tool(
    'get-stats',
    'Get statistics about loaded storybook data',
    {},
    async () => {
      const stats = useCache
        ? cachedLoader.getStats()
        : liveStore.getStats();
      
      let totalStories = 0;
      for (const fw of ['angular', 'react', 'core-web'] as StorybookFramework[]) {
        const fwStats = stats[fw];
        if (typeof fwStats === 'object' && 'stories' in fwStats) {
          totalStories += fwStats.stories;
        }
      }
      
      const result: any = {
        mode: useCache ? 'cached' : 'live',
        totalComponents: Object.values(stats).reduce((sum, s) => {
          if (typeof s === 'object' && 'docs' in s) return sum + s.docs;
          return sum;
        }, 0),
        totalStories,
        stats,
      };
      
      if (useZeroheight) {
        try {
          const zhStats = zeroheightLoader.getStats();
          result.zeroheight = zhStats;
        } catch (e) {
          // Zeroheight data not available
        }
      }
      
      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify(result, null, 2),
        }],
      };
    }
  );

  // Zeroheight Tools

  server.tool(
    'zeroheight-list-categories',
    'List all component categories from Zeroheight design system documentation',
    {},
    async () => {
      if (!useZeroheight) {
        return {
          content: [{
            type: 'text' as const,
            text: 'Zeroheight data not available. Run "npm run scrape" first.',
          }],
          isError: true,
        };
      }
      
      const categories = zeroheightLoader.listCategories();
      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({ categories }, null, 2),
        }],
      };
    }
  );

  server.tool(
    'zeroheight-list-components',
    'List components from Zeroheight (optionally filtered by category)',
    {
      category: z.string().optional().describe('Filter by category name'),
    },
    async ({ category }) => {
      if (!useZeroheight) {
        return {
          content: [{
            type: 'text' as const,
            text: 'Zeroheight data not available. Run "npm run scrape" first.',
          }],
          isError: true,
        };
      }
      
      const components = zeroheightLoader.listComponents(category);
      return {
        content: [{
          type: 'text' as const,
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
    }
  );

  server.tool(
    'zeroheight-get-component',
    'Get full component documentation from Zeroheight',
    {
      componentName: z.string().describe('Component name'),
    },
    async ({ componentName }) => {
      if (!useZeroheight) {
        return {
          content: [{
            type: 'text' as const,
            text: 'Zeroheight data not available. Run "npm run scrape" first.',
          }],
          isError: true,
        };
      }
      
      const component = zeroheightLoader.getComponent(componentName);
      if (!component) {
        return {
          content: [{
            type: 'text' as const,
            text: `Component "${componentName}" not found in Zeroheight.`,
          }],
          isError: true,
        };
      }
      
      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify(component, null, 2),
        }],
      };
    }
  );

  server.tool(
    'zeroheight-get-section',
    'Get a specific section (design/code/usage/accessibility) for a component',
    {
      componentName: z.string().describe('Component name'),
      section: z.enum(['design', 'code', 'usage', 'accessibility']).describe('Section to retrieve'),
    },
    async ({ componentName, section }) => {
      if (!useZeroheight) {
        return {
          content: [{
            type: 'text' as const,
            text: 'Zeroheight data not available. Run "npm run scrape" first.',
          }],
          isError: true,
        };
      }
      
      const sectionData = zeroheightLoader.getComponentSection(componentName, section);
      if (!sectionData) {
        return {
          content: [{
            type: 'text' as const,
            text: `Section "${section}" not found for component "${componentName}".`,
          }],
          isError: true,
        };
      }
      
      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            component: componentName,
            section,
            ...sectionData,
          }, null, 2),
        }],
      };
    }
  );

  server.tool(
    'zeroheight-search',
    'Search across all Zeroheight content',
    {
      query: z.string().describe('Search query'),
    },
    async ({ query }) => {
      if (!useZeroheight) {
        return {
          content: [{
            type: 'text' as const,
            text: 'Zeroheight data not available. Run "npm run scrape" first.',
          }],
          isError: true,
        };
      }
      
      const results = zeroheightLoader.searchComponents(query);
      return {
        content: [{
          type: 'text' as const,
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
    }
  );

  server.tool(
    'zeroheight-get-storybook-ref',
    'Get Storybook cross-references for a Zeroheight component',
    {
      componentName: z.string().describe('Zeroheight component name'),
    },
    async ({ componentName }) => {
      if (!useZeroheight) {
        return {
          content: [{
            type: 'text' as const,
            text: 'Zeroheight data not available. Run "npm run scrape" first.',
          }],
          isError: true,
        };
      }
      
      const ref = zeroheightLoader.getStorybookRef(componentName);
      if (!ref) {
        return {
          content: [{
            type: 'text' as const,
            text: `No Storybook reference found for "${componentName}".`,
          }],
          isError: true,
        };
      }
      
      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            componentName,
            storybook: ref,
          }, null, 2),
        }],
      };
    }
  );
}
