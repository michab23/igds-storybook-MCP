import { StorybookFramework, ComponentDocs, StorybookEntry } from './types.js';
import { fetchIndex, getComponentsFromIndex } from './scrapers/index-scraper.js';
import { scrapeComponentDocs, closeBrowser } from './scrapers/docs-scraper.js';

export class DataStore {
  private data: Map<StorybookFramework, Map<string, ComponentDocs>> = new Map();
  private indexes: Map<StorybookFramework, Record<string, StorybookEntry>> = new Map();
  private loading: Map<StorybookFramework, Promise<void>> = new Map();

  async loadFramework(framework: StorybookFramework): Promise<void> {
    if (this.loading.has(framework)) {
      return this.loading.get(framework)!;
    }

    const loadPromise = this._loadFramework(framework);
    this.loading.set(framework, loadPromise);
    return loadPromise;
  }

  private async _loadFramework(framework: StorybookFramework): Promise<void> {
    console.error(`Loading ${framework} storybook...`);
    
    // Fetch index
    const index = await fetchIndex(framework);
    this.indexes.set(framework, index.entries);
    
    // Get unique component names
    const components = getComponentsFromIndex(index);
    console.error(`Found ${components.size} components for ${framework}`);
    
    const componentDocs = new Map<string, ComponentDocs>();
    
    for (const [componentName, entries] of components) {
      const docsEntry = entries.find(e => e.type === 'docs');
      if (docsEntry) {
        try {
          const docs = await scrapeComponentDocs(framework, docsEntry.id, componentName);
          componentDocs.set(componentName, docs);
          console.error(`  Scraped: ${componentName}`);
        } catch (error) {
          console.error(`  Failed to scrape ${componentName}:`, error);
        }
      }
    }
    
    this.data.set(framework, componentDocs);
    console.error(`Loaded ${componentDocs.size} components for ${framework}`);
  }

  async loadAll(): Promise<void> {
    const frameworks: StorybookFramework[] = ['angular', 'react', 'core-web'];
    await Promise.all(frameworks.map(f => this.loadFramework(f)));
    await closeBrowser();
  }

  getComponent(framework: StorybookFramework, componentName: string): ComponentDocs | undefined {
    return this.data.get(framework)?.get(componentName);
  }

  listComponents(framework: StorybookFramework): string[] {
    return Array.from(this.data.get(framework)?.keys() || []);
  }

  searchComponents(query: string): ComponentDocs[] {
    const results: ComponentDocs[] = [];
    const lowerQuery = query.toLowerCase();
    
    for (const framework of ['angular', 'react', 'core-web'] as StorybookFramework[]) {
      const components = this.data.get(framework);
      if (components) {
        for (const [name, docs] of components) {
          if (name.toLowerCase().includes(lowerQuery)) {
            results.push(docs);
          }
        }
      }
    }
    
    return results;
  }

  getStoryEntry(framework: StorybookFramework, storyId: string): StorybookEntry | undefined {
    return this.indexes.get(framework)?.[storyId];
  }

  getAllEntries(framework: StorybookFramework): Record<string, StorybookEntry> {
    return this.indexes.get(framework) || {};
  }

  isLoaded(framework: StorybookFramework): boolean {
    return this.data.has(framework);
  }

  getStats(): Record<StorybookFramework, number> {
    const stats = {} as Record<StorybookFramework, number>;
    for (const framework of ['angular', 'react', 'core-web'] as StorybookFramework[]) {
      stats[framework] = this.data.get(framework)?.size || 0;
    }
    return stats;
  }
}
