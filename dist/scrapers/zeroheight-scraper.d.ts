import { ZeroheightComponent, ZeroheightPage, ZeroheightData } from '../types.js';
export declare function closeBrowser(): Promise<void>;
export declare function scrapeZeroheightNavigation(): Promise<{
    pages: ZeroheightPage[];
    categories: string[];
}>;
export declare function scrapeZeroheightComponents(): Promise<ZeroheightComponent[]>;
export declare function scrapeComponentSections(component: ZeroheightComponent): Promise<ZeroheightComponent>;
export declare function scrapeZeroheightPage(pageUrl: string): Promise<ZeroheightPage | null>;
export declare function scrapeAllZeroheight(): Promise<ZeroheightData>;
//# sourceMappingURL=zeroheight-scraper.d.ts.map