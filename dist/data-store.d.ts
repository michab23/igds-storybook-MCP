import { StorybookFramework, ComponentDocs, StorybookEntry } from './types.js';
export declare class DataStore {
    private data;
    private indexes;
    private loading;
    loadFramework(framework: StorybookFramework): Promise<void>;
    private _loadFramework;
    loadAll(): Promise<void>;
    getComponent(framework: StorybookFramework, componentName: string): ComponentDocs | undefined;
    listComponents(framework: StorybookFramework): string[];
    searchComponents(query: string): ComponentDocs[];
    getStoryEntry(framework: StorybookFramework, storyId: string): StorybookEntry | undefined;
    getAllEntries(framework: StorybookFramework): Record<string, StorybookEntry>;
    isLoaded(framework: StorybookFramework): boolean;
    getStats(): Record<StorybookFramework, number>;
}
//# sourceMappingURL=data-store.d.ts.map