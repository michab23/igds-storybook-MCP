import { StorybookFramework, ComponentDocs, ComponentSource, StoryVariant, StorybookEntry, StorybookIndex } from './types.js';
interface CachedData {
    angular: Record<string, ComponentDocs>;
    react: Record<string, ComponentDocs>;
    'core-web': Record<string, ComponentDocs>;
    indexes: Record<StorybookFramework, StorybookIndex>;
    sourceCode: Record<StorybookFramework, Record<string, ComponentSource>>;
    storyExamples: Record<StorybookFramework, Record<string, StoryVariant[]>>;
    scrapedAt: string;
}
export declare class CachedDataLoader {
    private data;
    isAvailable(): boolean;
    load(): CachedData;
    getComponents(framework: StorybookFramework): Map<string, ComponentDocs>;
    getComponent(framework: StorybookFramework, componentName: string): ComponentDocs | undefined;
    getSource(framework: StorybookFramework, componentName: string): ComponentSource | undefined;
    getStories(framework: StorybookFramework, componentName: string): StoryVariant[] | undefined;
    listComponents(framework: StorybookFramework): string[];
    searchComponents(query: string): ComponentDocs[];
    getStoryEntry(framework: StorybookFramework, storyId: string): StorybookEntry | undefined;
    getAllEntries(framework: StorybookFramework): Record<string, StorybookEntry>;
    getStats(): Record<StorybookFramework, {
        docs: number;
        source: number;
        stories: number;
    }>;
    getScrapedAt(): string;
}
export {};
//# sourceMappingURL=cached-loader.d.ts.map