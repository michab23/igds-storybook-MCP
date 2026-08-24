/**
 * The agent-facing document model — the only shape MCP tools are allowed to return.
 *
 * Deliberately absent: rendered HTML, CSS, images, Storybook chrome. The requirement is
 * that a coding agent gets the component *contract* and nothing else, in as few tokens as
 * the contract can honestly be expressed.
 */
import { readFileSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
export const FRAMEWORKS = ['angular', 'react', 'core-web'];
// Resolved from this module, not the working directory: when the server runs via `npx`
// the cwd is the consumer's project, which has no data/ directory of ours.
const MODULE_DIR = dirname(fileURLToPath(import.meta.url));
const DATA_FILE = process.env.IGDS_DOCS_FILE || join(MODULE_DIR, '..', 'data', 'igds-agent-docs.json');
/**
 * Derive the conventional per-framework spelling of a kebab-case name.
 *
 * Only core-web takes kebab-case HTML attributes. React props and Angular `@Input()`
 * bindings are both camelCase — an Angular template binds `[multiExpand]`, and
 * `multi-expand` would not bind at all.
 */
export function propNameFor(name, framework) {
    if (framework === 'core-web')
        return name;
    return name.replace(/-([a-z0-9])/g, (_match, char) => char.toUpperCase());
}
/**
 * The name to actually write for this prop in this framework: IGDS's own documented
 * spelling when we have one (which can be irregular, like React's literal `multiexpand`),
 * otherwise the conventional derivation.
 */
export function resolvePropName(prop, framework) {
    return prop.names?.[framework] || propNameFor(prop.name, framework);
}
/**
 * The name to actually listen for in this framework: IGDS's own documented spelling for
 * it (React's synthetic `onIgdsToggle` vs. everyone else's raw `igds-toggle`), or the
 * canonical name when no framework-specific spelling was captured.
 */
export function resolveEventName(event, framework) {
    return event.names?.[framework] || event.name;
}
/** How props and events are written in each target, shown alongside the props table. */
export function bindingSyntaxFor(framework) {
    switch (framework) {
        case 'angular':
            return '_Angular: bind as `[propName]="value"` (camelCase) or a plain attribute for literals; events as `(igds-event)="handler()"`._';
        case 'react':
            return '_React: props are camelCase._';
        case 'core-web':
            return '_Set as HTML attributes (kebab-case)._';
    }
}
/** Render a prop's type for display, folding a closed vocabulary into a union. */
/**
 * A closed vocabulary can be large enough to blow the response budget on its own — IGDS's
 * icon-name prop alone has 400+ legal values. Inlining all of them would crowd out usage
 * snippets and other props for one giant table row; cap it and say how many were omitted.
 */
const MAX_INLINE_VALUES = 20;
export function renderType(prop) {
    if (prop.values?.length) {
        const shown = prop.values.slice(0, MAX_INLINE_VALUES).map((value) => `'${value}'`);
        const omitted = prop.values.length - shown.length;
        return omitted > 0 ? `${shown.join(' | ')} | …(${omitted} more)` : shown.join(' | ');
    }
    return prop.type;
}
export class AgentDocsStore {
    docs = null;
    isAvailable() {
        return existsSync(DATA_FILE);
    }
    load() {
        if (this.docs)
            return this.docs;
        if (!this.isAvailable()) {
            throw new Error('No agent docs found at data/igds-agent-docs.json. Run "npm run build:docs" (or "npm run scrape" first).');
        }
        this.docs = JSON.parse(readFileSync(DATA_FILE, 'utf-8'));
        return this.docs;
    }
    /** Case-insensitive lookup that also accepts the tag name (`igds-button`). */
    get(name, framework) {
        const docs = this.load();
        const wanted = name.trim().toLowerCase();
        const match = docs.components[name] ||
            Object.values(docs.components).find((component) => component.name.toLowerCase() === wanted ||
                component.tag?.toLowerCase() === wanted ||
                component.tag?.toLowerCase() === `igds-${wanted}`);
        if (!match)
            return undefined;
        if (framework && !match.frameworks.includes(framework))
            return undefined;
        return match;
    }
    list(options = {}) {
        const docs = this.load();
        return Object.values(docs.components)
            .filter((component) => !options.framework || component.frameworks.includes(options.framework))
            .filter((component) => !options.category || component.category?.toLowerCase() === options.category.toLowerCase())
            .sort((a, b) => a.name.localeCompare(b.name));
    }
    /**
     * Returns references with a short reason for the match — never component bodies. Callers
     * follow up with `get-component` for the one they want.
     */
    search(query, framework) {
        const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
        if (!terms.length)
            return [];
        const results = [];
        for (const component of this.list({ framework })) {
            const name = component.name.toLowerCase();
            const tag = component.tag?.toLowerCase() || '';
            const summary = component.summary?.toLowerCase() || '';
            const category = component.category?.toLowerCase() || '';
            const propNames = component.props.map((prop) => prop.name.toLowerCase());
            const values = component.props.flatMap((prop) => prop.values || []).map((v) => v.toLowerCase());
            let score = 0;
            let reason = '';
            for (const term of terms) {
                if (name === term) {
                    score += 100;
                    reason ||= 'name';
                }
                else if (name.includes(term) || tag.includes(term)) {
                    score += 50;
                    reason ||= 'name';
                }
                else if (category.includes(term)) {
                    score += 20;
                    reason ||= `category: ${component.category}`;
                }
                else if (summary.includes(term)) {
                    score += 15;
                    reason ||= 'summary';
                }
                else if (propNames.some((prop) => prop.includes(term))) {
                    score += 10;
                    reason ||= `prop: ${propNames.find((prop) => prop.includes(term))}`;
                }
                else if (values.includes(term)) {
                    score += 8;
                    reason ||= `value: ${term}`;
                }
            }
            if (score > 0)
                results.push({ component, reason, score });
        }
        return results
            .sort((a, b) => b.score - a.score || a.component.name.localeCompare(b.component.name))
            .map(({ component, reason }) => ({ component, reason }));
    }
    categories() {
        return this.load().categories;
    }
    meta() {
        const docs = this.load();
        return {
            scrapedAt: docs.scrapedAt,
            builtAt: docs.builtAt,
            components: Object.keys(docs.components).length,
            notes: docs.notes,
        };
    }
}
//# sourceMappingURL=agent-docs.js.map