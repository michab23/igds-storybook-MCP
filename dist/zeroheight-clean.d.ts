/**
 * Zeroheight pages were captured as full-page text, so every section carries the site
 * navigation, the tab strip and the sidebar component list before any real content. This
 * module reduces that to the few facts an agent can act on: what the component is for,
 * when not to use it, accessibility requirements, and RTL notes.
 *
 * Chrome is detected statistically (lines that recur across most pages) rather than from a
 * hardcoded list, so it keeps working when the site's navigation changes.
 */
import { AgentGuidance } from './agent-docs.js';
import { ZeroheightSectionName } from './types.js';
export interface CleanedSections {
    summary?: string;
    /** Section name -> cleaned body. Sections with identical bodies are collapsed. */
    bodies: Partial<Record<ZeroheightSectionName, string>>;
}
/**
 * Collect the lines that recur across pages. Pass every section body of every component.
 */
export declare function buildChromeLines(allSectionContents: string[]): Set<string>;
export declare function cleanSection(content: string, chrome: Set<string>, componentName: string): {
    summary?: string;
    body: string;
};
export declare function cleanComponentSections(sections: Partial<Record<ZeroheightSectionName, {
    content: string;
}>>, chrome: Set<string>, componentName: string): CleanedSections;
export declare function extractGuidance(cleaned: CleanedSections): AgentGuidance | undefined;
//# sourceMappingURL=zeroheight-clean.d.ts.map