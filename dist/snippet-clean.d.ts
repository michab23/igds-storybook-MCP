/**
 * Clean Storybook "Show code" output into usage an agent can copy.
 *
 * Storybook's React source panel is produced by a JSX pretty-printer over the live element
 * tree, so it carries story scaffolding that is not component API: demo layout styles,
 * CSS-module class names with build hashes, DevTools placeholders for functions and refs,
 * and long runs of identical placeholder content. Agents copy snippets literally, so each
 * of these becomes dead or non-compliant code in the consumer's project.
 *
 * Pure string transforms over the printer's consistent output; no parsing of arbitrary JSX.
 */
export interface CleanedSnippet {
    code: string;
    /** Set when the snippet only demonstrates something agents must not copy. */
    drop?: string;
}
export declare function cleanSnippet(code: string, framework: 'react' | 'angular' | 'core-web', componentName?: string): CleanedSnippet;
//# sourceMappingURL=snippet-clean.d.ts.map