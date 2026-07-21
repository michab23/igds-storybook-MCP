import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
const DATA_DIR = join(process.cwd(), 'data');
const DATA_FILE = join(DATA_DIR, 'igds-storybook-data.json');
export class CachedDataLoader {
    data = null;
    isAvailable() {
        return existsSync(DATA_FILE);
    }
    load() {
        if (this.data) {
            return this.data;
        }
        if (!this.isAvailable()) {
            throw new Error('No cached data found. Run "npm run scrape" first.');
        }
        const raw = readFileSync(DATA_FILE, 'utf-8');
        this.data = JSON.parse(raw);
        // Ensure storyExamples exists
        if (!this.data.storyExamples) {
            this.data.storyExamples = { angular: {}, react: {}, 'core-web': {} };
        }
        // Merge source code and story examples into component docs
        if (this.data.sourceCode || this.data.storyExamples) {
            for (const framework of ['angular', 'react', 'core-web']) {
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
    getComponents(framework) {
        const data = this.load();
        const frameworkData = data[framework];
        return new Map(Object.entries(frameworkData));
    }
    getComponent(framework, componentName) {
        const data = this.load();
        return data[framework][componentName];
    }
    getSource(framework, componentName) {
        const data = this.load();
        return data.sourceCode?.[framework]?.[componentName];
    }
    getStories(framework, componentName) {
        const data = this.load();
        return data.storyExamples?.[framework]?.[componentName];
    }
    listComponents(framework) {
        const data = this.load();
        return Object.keys(data[framework]);
    }
    searchComponents(query) {
        const data = this.load();
        const results = [];
        const lowerQuery = query.toLowerCase();
        for (const framework of ['angular', 'react', 'core-web']) {
            for (const [name, docs] of Object.entries(data[framework])) {
                if (name.toLowerCase().includes(lowerQuery)) {
                    results.push(docs);
                }
            }
        }
        return results;
    }
    getStoryEntry(framework, storyId) {
        const data = this.load();
        return data.indexes[framework]?.entries[storyId];
    }
    getAllEntries(framework) {
        const data = this.load();
        return data.indexes[framework]?.entries || {};
    }
    getStats() {
        const data = this.load();
        const stats = {};
        for (const fw of ['angular', 'react', 'core-web']) {
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
    getScrapedAt() {
        const data = this.load();
        return data.scrapedAt;
    }
}
//# sourceMappingURL=cached-loader.js.map