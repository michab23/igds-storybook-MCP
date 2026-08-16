import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { StorybookFramework, ComponentDocs, ComponentSource, StoryVariant, StorybookEntry, StorybookIndex, ZeroheightData } from './types.js';

const DATA_DIR = join(process.cwd(), 'data');
const DATA_FILE = join(DATA_DIR, 'igds-storybook-data.json');
const ZEROHEIGHT_DATA_FILE = join(DATA_DIR, 'zeroheight-data.json');

interface CachedData {
  angular: Record<string, ComponentDocs>;
  react: Record<string, ComponentDocs>;
  'core-web': Record<string, ComponentDocs>;
  indexes: Record<StorybookFramework, StorybookIndex>;
  sourceCode: Record<StorybookFramework, Record<string, ComponentSource>>;
  storyExamples: Record<StorybookFramework, Record<string, StoryVariant[]>>;
  scrapedAt: string;
}

export class CachedDataLoader {
  private data: CachedData | null = null;
  private zeroheightData: ZeroheightData | null = null;

  isAvailable(): boolean {
    return existsSync(DATA_FILE);
  }

  load(): CachedData {
    if (this.data) {
      return this.data;
    }

    if (!this.isAvailable()) {
      throw new Error('No cached data found. Run "npm run scrape" first.');
    }

    const raw = readFileSync(DATA_FILE, 'utf-8');
    this.data = JSON.parse(raw) as CachedData;
    
    // Ensure storyExamples exists
    if (!this.data.storyExamples) {
      this.data.storyExamples = { angular: {}, react: {}, 'core-web': {} };
    }
    
    // Merge source code and story examples into component docs
    if (this.data.sourceCode || this.data.storyExamples) {
      for (const framework of ['angular', 'react', 'core-web'] as StorybookFramework[]) {
        const frameworkData = this.data[framework];
        const sourceData = this.data.sourceCode?.[framework] || {};
        const storyData = this.data.storyExamples?.[framework] || {};
        
        for (const [name, docs] of Object.entries(frameworkData)) {
          // Try to match by component name
          const source = sourceData[name] || 
            Object.values(sourceData).find(s => s.className === name);
          if (source) {
            docs.source = source;
          }
          
          // Add story examples
          const stories = storyData[name];
          if (stories && docs.stories) {
            docs.stories = stories;
          }
        }
      }
    }
    
    return this.data;
  }

  getComponents(framework: StorybookFramework): Map<string, ComponentDocs> {
    const data = this.load();
    const frameworkData = data[framework];
    return new Map(Object.entries(frameworkData));
  }

  getComponent(framework: StorybookFramework, componentName: string): ComponentDocs | undefined {
    const data = this.load();
    return data[framework][componentName];
  }

  getSource(framework: StorybookFramework, componentName: string): ComponentSource | undefined {
    const data = this.load();
    return data.sourceCode?.[framework]?.[componentName];
  }

  getStories(framework: StorybookFramework, componentName: string): StoryVariant[] | undefined {
    const data = this.load();
    return data.storyExamples?.[framework]?.[componentName];
  }

  listComponents(framework: StorybookFramework): string[] {
    const data = this.load();
    return Object.keys(data[framework]);
  }

  searchComponents(query: string): ComponentDocs[] {
    const data = this.load();
    const results: ComponentDocs[] = [];
    const lowerQuery = query.toLowerCase();

    for (const framework of ['angular', 'react', 'core-web'] as StorybookFramework[]) {
      for (const [name, docs] of Object.entries(data[framework])) {
        if (name.toLowerCase().includes(lowerQuery)) {
          results.push(docs);
        }
      }
    }

    return results;
  }

  getStoryEntry(framework: StorybookFramework, storyId: string): StorybookEntry | undefined {
    const data = this.load();
    return data.indexes[framework]?.entries[storyId];
  }

  getAllEntries(framework: StorybookFramework): Record<string, StorybookEntry> {
    const data = this.load();
    return data.indexes[framework]?.entries || {};
  }

  getStats(): Record<StorybookFramework, { docs: number; source: number; stories: number }> {
    const data = this.load();
    const stats = {} as Record<StorybookFramework, { docs: number; source: number; stories: number }>;
    
    for (const fw of ['angular', 'react', 'core-web'] as StorybookFramework[]) {
      const storyData = data.storyExamples?.[fw] || {};
      let totalStories = 0;
      for (const stories of Object.values(storyData)) {
        totalStories += stories.length;
      }
      
      stats[fw] = {
        docs: Object.keys(data[fw]).length,
        source: Object.keys(data.sourceCode?.[fw] || {}).length,
        stories: totalStories,
      };
    }
    
    return stats;
  }

  getScrapedAt(): string {
    const data = this.load();
    return data.scrapedAt;
  }

  isZeroheightAvailable(): boolean {
    return existsSync(ZEROHEIGHT_DATA_FILE);
  }

  loadZeroheight(): ZeroheightData | null {
    if (this.zeroheightData) {
      return this.zeroheightData;
    }

    if (!this.isZeroheightAvailable()) {
      return null;
    }

    const raw = readFileSync(ZEROHEIGHT_DATA_FILE, 'utf-8');
    this.zeroheightData = JSON.parse(raw) as ZeroheightData;
    return this.zeroheightData;
  }

  getZeroheightComponent(storybookName: string): any | undefined {
    const zhData = this.loadZeroheight();
    if (!zhData) return undefined;

    // Search by name or cross-reference
    for (const component of Object.values(zhData.components)) {
      if (component.name === storybookName) {
        return component;
      }
      if (component.storybookCrossRef) {
        for (const ref of Object.values(component.storybookCrossRef)) {
          if (ref === storybookName) {
            return component;
          }
        }
      }
    }

    return undefined;
  }

  getZeroheightStats(): { components: number; pages: number; categories: number } | null {
    const zhData = this.loadZeroheight();
    if (!zhData) return null;

    return {
      components: Object.keys(zhData.components).length,
      pages: Object.keys(zhData.pages).length,
      categories: zhData.categories.length,
    };
  }
}
