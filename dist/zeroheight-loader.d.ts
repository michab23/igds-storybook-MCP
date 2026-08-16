import { ZeroheightComponent, ZeroheightPage, ZeroheightData } from './types.js';
export declare class ZeroheightLoader {
    private data;
    isAvailable(): boolean;
    load(): ZeroheightData;
    listCategories(): string[];
    listComponents(category?: string): ZeroheightComponent[];
    getComponent(name: string): ZeroheightComponent | undefined;
    getComponentSection(name: string, section: 'design' | 'code' | 'usage' | 'accessibility'): import("./types.js").ZeroheightSection | undefined;
    searchComponents(query: string): ZeroheightComponent[];
    getStorybookRef(name: string): Record<string, string> | undefined;
    findComponentByStorybookName(storybookName: string, framework: 'angular' | 'react' | 'core-web'): ZeroheightComponent | undefined;
    getPage(name: string): ZeroheightPage | undefined;
    listPages(): ZeroheightPage[];
    getStats(): {
        components: number;
        pages: number;
        categories: number;
        images: number;
    };
    getScrapedAt(): string;
}
//# sourceMappingURL=zeroheight-loader.d.ts.map