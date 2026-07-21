import { StorybookFramework, ComponentDocs } from '../types.js';
export declare function closeBrowser(): Promise<void>;
export declare function scrapeComponentDocs(framework: StorybookFramework, componentId: string, componentName: string): Promise<ComponentDocs>;
export declare function scrapeAllComponents(framework: StorybookFramework, components: Map<string, {
    id: string;
    name: string;
}[]>): Promise<Map<string, ComponentDocs>>;
//# sourceMappingURL=docs-scraper.d.ts.map