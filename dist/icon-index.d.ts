/**
 * Map from a hash of an icon's SVG markup to its @igds/icons export name.
 *
 * Story snippets inline icons as raw path markup (`icon: '<path d="M20 3C21.04…"/>'`),
 * which is unreadable and inflates snippets past their budget. The index lets the build
 * replace that markup with the named export an agent should import instead.
 *
 * Only hashes are stored: the IGDS packages declare no license, so this repo does not
 * redistribute the icon artwork itself. Regenerate with `npm run build:icons -- <path>`.
 */
export interface IconIndex {
    _comment?: string;
    /** @igds/icons version the hashes were computed from. */
    version: string;
    icons: Record<string, string>;
}
/** Markup as it appears in a JS string, a JSX attribute or HTML (entity-encoded) → canonical form. */
export declare function normalizeIconMarkup(markup: string): string;
export declare function hashIconMarkup(markup: string): string;
export declare function iconLookup(index: IconIndex | null): (markup: string) => string | undefined;
//# sourceMappingURL=icon-index.d.ts.map