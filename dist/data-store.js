import { fetchIndex, getComponentsFromIndex } from './scrapers/index-scraper.js';
import { scrapeComponentDocs, closeBrowser } from './scrapers/docs-scraper.js';
export class DataStore {
    data = new Map();
    indexes = new Map();
    loading = new Map();
    async loadFramework(framework) {
        if (this.loading.has(framework)) {
            return this.loading.get(framework);
        }
        const loadPromise = this._loadFramework(framework);
        this.loading.set(framework, loadPromise);
        return loadPromise;
    }
    async _loadFramework(framework) {
        console.error(`Loading ${framework} storybook...`);
        // Fetch index
        const index = await fetchIndex(framework);
        this.indexes.set(framework, index.entries);
        // Get unique component names
        const components = getComponentsFromIndex(index);
        console.error(`Found ${components.size} components for ${framework}`);
        const componentDocs = new Map();
        for (const [componentName, entries] of components) {
            const docsEntry = entries.find(e => e.type === 'docs');
            if (docsEntry) {
                try {
                    const docs = await scrapeComponentDocs(framework, docsEntry.id, componentName);
                    componentDocs.set(componentName, docs);
                    console.error(`  Scraped: ${componentName}`);
                }
                catch (error) {
                    console.error(`  Failed to scrape ${componentName}:`, error);
                }
            }
        }
        this.data.set(framework, componentDocs);
        console.error(`Loaded ${componentDocs.size} components for ${framework}`);
    }
    async loadAll() {
        const frameworks = ['angular', 'react', 'core-web'];
        await Promise.all(frameworks.map(f => this.loadFramework(f)));
        await closeBrowser();
    }
    getComponent(framework, componentName) {
        return this.data.get(framework)?.get(componentName);
    }
    listComponents(framework) {
        return Array.from(this.data.get(framework)?.keys() || []);
    }
    searchComponents(query) {
        const results = [];
        const lowerQuery = query.toLowerCase();
        for (const framework of ['angular', 'react', 'core-web']) {
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
    getStoryEntry(framework, storyId) {
        return this.indexes.get(framework)?.[storyId];
    }
    getAllEntries(framework) {
        return this.indexes.get(framework) || {};
    }
    isLoaded(framework) {
        return this.data.has(framework);
    }
    getStats() {
        const stats = {};
        for (const framework of ['angular', 'react', 'core-web']) {
            stats[framework] = this.data.get(framework)?.size || 0;
        }
        return stats;
    }
}
//# sourceMappingURL=data-store.js.map