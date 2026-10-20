import { ZeroheightComponent, ZeroheightPage, ZeroheightData } from '../types.js';
export declare function getBrowser(): Promise<any>;
export declare function closeBrowser(): Promise<void>;
export declare function scrapeZeroheightNavigation(): Promise<{
    pages: ZeroheightPage[];
    categories: string[];
}>;
export declare function scrapeZeroheightComponents(): Promise<ZeroheightComponent[]>;
export declare function scrapeComponentSections(component: ZeroheightComponent): Promise<ZeroheightComponent>;
/**
 * The section tabs of THIS component: links under its own path (`/p/06a72e-table/b/…`).
 * Every zeroheight page also carries a site-wide sidebar listing Design/Code/Usage/
 * Accessibility for every component, Button's first, so matching link text alone picked
 * another component's sections.
 */
export declare function findSectionLinks(componentUrl: string): Promise<Record<string, string>>;
/**
 * Wait for the section's own content, then return only it. Tab content renders after
 * `networkidle`; the old fixed 2 s wait often captured the navigation and nothing else.
 */
/** The one-line description zeroheight shows under the title, just above the tab bar. */
export declare function readPageSummary(componentName: string): Promise<string | undefined>;
export declare function readSectionText(timeoutMs?: number): Promise<string>;
export declare function scrapeZeroheightPage(pageUrl: string): Promise<ZeroheightPage | null>;
export declare function scrapeAllZeroheight(): Promise<ZeroheightData>;
//# sourceMappingURL=zeroheight-scraper.d.ts.map