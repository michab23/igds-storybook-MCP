/**
 * The agent-facing document model — the only shape MCP tools are allowed to return.
 *
 * Deliberately absent: rendered HTML, CSS, images, Storybook chrome. The requirement is
 * that a coding agent gets the component *contract* and nothing else, in as few tokens as
 * the contract can honestly be expressed.
 */
export type Framework = 'angular' | 'react' | 'core-web';
export declare const FRAMEWORKS: Framework[];
/** Where a fact came from, so consumers can weigh it. */
export type Provenance = 'documented' | 'manifest' | 'argtypes' | 'observed';
export interface AgentProp {
    /** Canonical kebab-case name, used to derive a per-framework spelling when `names` lacks one. */
    name: string;
    /**
     * Literal spelling as documented for a specific framework, when it does not follow the
     * usual casing convention — e.g. IGDS documents React's `multiExpand` as `multiexpand`.
     * Only populated from `documented` provenance; other sources are trusted to follow the
     * ordinary per-framework convention that `propNameFor` derives.
     */
    names?: Partial<Record<Framework, string>>;
    type: string;
    /** Legal values, when the prop has a closed vocabulary. */
    values?: string[];
    default?: string;
    required?: boolean;
    description?: string;
    provenance: Provenance;
}
export interface AgentEvent {
    /** Canonical spelling, preferring the raw custom-event name (`igds-toggle`) when known. */
    name: string;
    /**
     * Literal spelling as documented for a specific framework, when it differs from the
     * canonical one — React exposes the same event as a synthetic `onIgdsToggle` prop, which
     * is not what an Angular `(igds-toggle)="handler()"` binding or a core-web
     * `addEventListener('igds-toggle', …)` call should use.
     */
    names?: Partial<Record<Framework, string>>;
    description?: string;
}
export interface AgentSlot {
    name: string;
    description?: string;
}
export interface UsageSnippet {
    story: string;
    framework: Framework;
    code: string;
}
export interface AgentGuidance {
    whenToUse?: string;
    whenNotToUse?: string;
    a11y?: string[];
    rtl?: string;
}
/**
 * A composition child: `<igds-accordion-item>` inside `<igds-accordion>`. Storybook
 * documents only the top-level component, but an agent cannot write the parent without
 * these, so they travel with it.
 */
export interface AgentSubComponent {
    name: string;
    tag: string;
    props: AgentProp[];
    events?: AgentEvent[];
    /** Child elements are deep-imported separately in Angular/React. */
    imports?: Partial<Record<Framework, string>>;
}
export interface AgentComponent {
    name: string;
    /** Custom element tag, e.g. `igds-button`. */
    tag?: string;
    category?: string;
    summary?: string;
    frameworks: Framework[];
    /** Import statements, when the operator has configured real package names. */
    imports?: Partial<Record<Framework, string>>;
    props: AgentProp[];
    events?: AgentEvent[];
    slots?: AgentSlot[];
    usage: UsageSnippet[];
    subComponents?: AgentSubComponent[];
    guidance?: AgentGuidance;
    refs: {
        storybook: Partial<Record<Framework, string>>;
        zeroheight?: string;
    };
}
export interface AgentDocs {
    /** Schema version of this artifact, not the server version. */
    schema: number;
    scrapedAt: string;
    builtAt: string;
    categories: string[];
    components: Record<string, AgentComponent>;
    /** Known gaps, surfaced to agents rather than hidden. */
    notes: string[];
}
/**
 * Derive the conventional per-framework spelling of a kebab-case name.
 *
 * Only core-web takes kebab-case HTML attributes. React props and Angular `@Input()`
 * bindings are both camelCase — an Angular template binds `[multiExpand]`, and
 * `multi-expand` would not bind at all.
 */
export declare function propNameFor(name: string, framework: Framework): string;
/**
 * The name to actually write for this prop in this framework: IGDS's own documented
 * spelling when we have one (which can be irregular, like React's literal `multiexpand`),
 * otherwise the conventional derivation.
 */
export declare function resolvePropName(prop: AgentProp, framework: Framework): string;
/**
 * The name to actually listen for in this framework: IGDS's own documented spelling for
 * it (React's synthetic `onIgdsToggle` vs. everyone else's raw `igds-toggle`), or the
 * canonical name when no framework-specific spelling was captured.
 */
export declare function resolveEventName(event: AgentEvent, framework: Framework): string;
/** How props and events are written in each target, shown alongside the props table. */
export declare function bindingSyntaxFor(framework: Framework): string;
export declare function renderType(prop: AgentProp): string;
export declare class AgentDocsStore {
    private docs;
    isAvailable(): boolean;
    load(): AgentDocs;
    /** Case-insensitive lookup that also accepts the tag name (`igds-button`). */
    get(name: string, framework?: Framework): AgentComponent | undefined;
    list(options?: {
        framework?: Framework;
        category?: string;
    }): AgentComponent[];
    /**
     * Returns references with a short reason for the match — never component bodies. Callers
     * follow up with `get-component` for the one they want.
     */
    search(query: string, framework?: Framework): {
        component: AgentComponent;
        reason: string;
    }[];
    categories(): string[];
    meta(): {
        scrapedAt: string;
        builtAt: string;
        components: number;
        notes: string[];
    };
}
//# sourceMappingURL=agent-docs.d.ts.map