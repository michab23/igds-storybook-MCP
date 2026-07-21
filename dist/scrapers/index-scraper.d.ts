import { StorybookFramework, StorybookIndex, StorybookEntry } from '../types.js';
export declare function fetchIndex(framework: StorybookFramework): Promise<StorybookIndex>;
export declare function getComponentsFromIndex(index: StorybookIndex): Map<string, StorybookEntry[]>;
export declare function getDocsEntry(entries: StorybookEntry[]): StorybookEntry | undefined;
export declare function getStoryEntries(entries: StorybookEntry[]): StorybookEntry[];
//# sourceMappingURL=index-scraper.d.ts.map