/**
 * Offline extraction of agent-useful facts from the rendered HTML captured by the
 * story scraper.
 *
 * The requirement forbids exposing rendered HTML to agents, but the captured light DOM
 * is still the closest thing we have to the authored story template: it carries the real
 * attribute values the design system uses. So we mine it here, at build time, and emit
 * only distilled facts (observed attribute values + a compact usage snippet). The HTML
 * itself never reaches a tool response.
 */
export interface MinedAttribute {
    /** Every distinct value observed across all stories, in first-seen order. */
    values: string[];
    /** True when the attribute appeared with no value (`disabled`), i.e. a boolean flag. */
    booleanish: boolean;
    /** Number of stories the attribute appeared in — a rough confidence signal. */
    occurrences: number;
}
/** tag name -> attribute name -> observed usage */
export type MinedTags = Map<string, Map<string, MinedAttribute>>;
/**
 * Angular renders `[notificationButtonVariant]` and web components render
 * `notification-button-variant` for the same API. Canonicalise to kebab-case so the two
 * do not show up as separate props.
 */
export declare function canonicalAttributeName(name: string): string;
/**
 * Angular and React bind properties in JS, so their light DOM often carries framework
 * bookkeeping attributes instead of the authored ones. We keep whatever survives and let
 * the caller merge across frameworks.
 */
export declare function mineAttributes(html: string, into?: MinedTags): MinedTags;
/**
 * Key used to match names that describe the same API across sources:
 * `notificationButtonVariant`, `notification-button-variant` and the browser-lowercased
 * `notificationbuttonvariant` all collapse to `notificationbuttonvariant`.
 */
export declare function attributeKey(name: string): string;
/**
 * Serialised HTML loses camelCase, so the same prop can be mined under both a hyphenated
 * and a squashed spelling. Merge those, keeping the hyphenated name — it is the spelling
 * that actually works in markup.
 */
export declare function mergeSquashedAttributes(mined: MinedTags): MinedTags;
/**
 * Decide whether a mined attribute's observed values form a closed vocabulary worth
 * telling the agent about, as opposed to free text (labels, hrefs, titles).
 */
export declare function looksLikeEnum(values: string[]): boolean;
/**
 * Slice out the top-level `<igds-*>` subtrees, drop framework bookkeeping, and re-indent.
 * Returns a snippet an agent can copy, or undefined when nothing usable was found.
 */
export declare function toUsageSnippet(html: string, maxElements?: number): string | undefined;
//# sourceMappingURL=light-dom.d.ts.map