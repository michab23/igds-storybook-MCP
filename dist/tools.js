import { z } from 'zod';
import { AgentDocsStore, bindingSyntaxFor, resolveEventName, resolvePropName, renderType, } from './agent-docs.js';
import { DEFAULT_BUDGET, SMALL_BUDGET, codeBlock, join, limited, section, table, withinBudget, } from './format.js';
const frameworkSchema = z.enum(['angular', 'react', 'core-web']);
/**
 * Tool responses are markdown, never rendered HTML or CSS. Each description says what the
 * tool does *not* return, so agents stop looking for markup that is deliberately absent.
 */
export function registerAllTools(server) {
    const store = new AgentDocsStore();
    const unavailable = () => ({
        content: [
            {
                type: 'text',
                text: 'IGDS docs are not built yet. Run "npm run build:docs" (after "npm run scrape") to generate data/igds-agent-docs.json.',
            },
        ],
        isError: true,
    });
    const ok = (text) => ({ content: [{ type: 'text', text }] });
    const notFound = (name, framework) => ({
        content: [
            {
                type: 'text',
                text: framework
                    ? `No IGDS component "${name}" for ${framework}. Use search-components to find the right name.`
                    : `No IGDS component "${name}". Use search-components to find the right name.`,
            },
        ],
        isError: true,
    });
    // --- search-components -----------------------------------------------------------
    server.tool('search-components', 'Find IGDS components by name, purpose, prop or prop value. Returns names and one-line summaries only — no props, code or markup. Follow up with get-component for the one you need.', {
        query: z.string().describe('What you are looking for, e.g. "dropdown", "primary button", "rtl"'),
        framework: frameworkSchema.optional().describe('Restrict to components available for this framework'),
    }, async ({ query, framework }) => {
        if (!store.isAvailable())
            return unavailable();
        const results = store.search(query, framework);
        if (!results.length) {
            const all = store.list({ framework: framework });
            return ok(`No IGDS component matches "${query}". ${all.length} components are available — call list-components to see them.`);
        }
        const { items, omitted } = limited(results, 15);
        const rows = items.map(({ component, reason }) => [
            component.name,
            component.tag,
            component.summary?.slice(0, 80),
            reason,
        ]);
        const body = join(`Matches for "${query}" (${results.length}):`, table(['component', 'tag', 'summary', 'matched on'], rows), omitted ? `_${omitted} more matches not shown — refine the query._` : undefined, 'Next: `get-component` for the API, `get-component-examples` for code.');
        return ok(withinBudget(body, SMALL_BUDGET, 'Refine the query to see fewer, more relevant matches.'));
    });
    // --- list-components -------------------------------------------------------------
    server.tool('list-components', 'List IGDS components, optionally filtered by framework or category. Returns an index (name, tag, summary) — not props or code.', {
        framework: frameworkSchema.optional().describe('Only components available for this framework'),
        category: z.string().optional().describe('Only components in this design-system category'),
    }, async ({ framework, category }) => {
        if (!store.isAvailable())
            return unavailable();
        const components = store.list({ framework: framework, category });
        if (!components.length) {
            return ok(`No components matched. Known categories: ${store.categories().join(', ') || 'none recorded'}.`);
        }
        const rows = components.map((component) => [
            component.name,
            component.tag,
            component.category,
            component.summary?.slice(0, 70),
        ]);
        const scope = [framework, category].filter(Boolean).join(' / ') || 'all frameworks';
        const body = join(`${components.length} IGDS components (${scope}):`, table(['component', 'tag', 'category', 'summary'], rows), 'Next: `get-component` for props and usage.');
        return ok(withinBudget(body, DEFAULT_BUDGET, 'Filter by framework or category to see the rest.'));
    });
    // --- get-component ---------------------------------------------------------------
    server.tool('get-component', 'Get the API contract for one IGDS component: import, tag, every prop with its type, legal values and default, plus one usage snippet. This is the tool to call before writing IGDS code. Returns no rendered HTML and no CSS.', {
        component: z.string().describe('Component name or tag, e.g. "Button" or "igds-button"'),
        framework: frameworkSchema.optional().describe('Target framework — affects prop naming and import'),
        detail: z
            .enum(['compact', 'full'])
            .optional()
            .describe('compact (default) trims prop descriptions; full keeps them'),
    }, async ({ component, framework, detail }) => {
        if (!store.isAvailable())
            return unavailable();
        const found = store.get(component, framework);
        if (!found)
            return notFound(component, framework);
        const target = framework ?? found.frameworks[0];
        const body = renderComponent(found, target, detail === 'full');
        return ok(withinBudget(body, DEFAULT_BUDGET, `Call get-component-examples("${found.name}") for more usage, or get-design-guidance("${found.name}") for design rules.`));
    });
    // --- get-component-examples ------------------------------------------------------
    server.tool('get-component-examples', 'Get usage code snippets for an IGDS component, taken from the design system\'s own stories. Returns code only — no rendered DOM, no CSS.', {
        component: z.string().describe('Component name or tag'),
        framework: frameworkSchema.optional().describe('Prefer snippets for this framework'),
        variant: z.string().optional().describe('Filter to stories whose name contains this text'),
        limit: z.number().int().min(1).max(10).optional().describe('Maximum snippets (default 3)'),
    }, async ({ component, framework, variant, limit }) => {
        if (!store.isAvailable())
            return unavailable();
        const found = store.get(component);
        if (!found)
            return notFound(component);
        let snippets = found.usage;
        if (framework)
            snippets = snippets.filter((snippet) => snippet.framework === framework);
        if (variant) {
            const wanted = variant.toLowerCase();
            snippets = snippets.filter((snippet) => snippet.story.toLowerCase().includes(wanted));
        }
        if (!snippets.length) {
            const available = found.usage.map((snippet) => snippet.story).join(', ');
            return ok(`No usage snippet for ${found.name}${variant ? ` matching "${variant}"` : ''}. ` +
                (available ? `Available stories: ${available}.` : `Storybook: ${firstRef(found)}`));
        }
        const { items } = limited(snippets, limit ?? 3);
        const body = join(`# ${found.name} usage`, ...items.map((snippet) => join(`**${snippet.story}** (${snippet.framework})`, codeBlock(snippet.code))), `Props and legal values: \`get-component("${found.name}")\`.`);
        return ok(withinBudget(body, DEFAULT_BUDGET, `Use limit or variant to narrow the snippets.`));
    });
    // --- get-design-guidance ---------------------------------------------------------
    server.tool('get-design-guidance', 'Get design-system guidance for an IGDS component: when to use it, when not to, accessibility requirements and RTL notes. Prose only — call get-component for the API.', {
        component: z.string().describe('Component name or tag'),
    }, async ({ component }) => {
        if (!store.isAvailable())
            return unavailable();
        const found = store.get(component);
        if (!found)
            return notFound(component);
        const guidance = found.guidance;
        if (!guidance) {
            return ok(`No design guidance recorded for ${found.name}.` +
                (found.refs.zeroheight ? ` Design docs: ${found.refs.zeroheight}` : ''));
        }
        const body = join(`# ${found.name} — design guidance`, found.summary, section('When to use', guidance.whenToUse), section('When not to use', guidance.whenNotToUse), section('Accessibility', guidance.a11y?.map((item) => `- ${item}`).join('\n')), section('RTL', guidance.rtl), found.refs.zeroheight ? `Source: ${found.refs.zeroheight}` : undefined);
        return ok(withinBudget(body, SMALL_BUDGET, `Full docs: ${found.refs.zeroheight || firstRef(found)}`));
    });
    // --- resource: freshness metadata ------------------------------------------------
    // A resource rather than a tool: it costs no tool-list context on every request.
    server.resource('igds-docs-metadata', 'igds://meta', { description: 'When the IGDS docs were scraped and built, and known gaps', mimeType: 'application/json' }, async () => ({
        contents: [
            {
                uri: 'igds://meta',
                mimeType: 'application/json',
                text: JSON.stringify(store.isAvailable() ? store.meta() : { available: false }, null, 2),
            },
        ],
    }));
}
function firstRef(component) {
    return Object.values(component.refs.storybook)[0] || '';
}
function renderComponent(component, framework, full) {
    const heading = `# ${component.name}${component.tag ? ` \`<${component.tag}>\`` : ''}`;
    const facts = [
        component.summary,
        `**Frameworks:** ${component.frameworks.join(', ')}${component.category ? ` · **Category:** ${component.category}` : ''}`,
        component.imports?.[framework]
            ? `**Import:** \`${component.imports[framework]}\``
            : '**Import:** not published for IGDS — resolve the package from your project setup.',
    ]
        .filter(Boolean)
        .join('\n');
    // Mark props we only ever saw in markup. They are real, but the component never declared
    // them, so an agent should treat them as less certain than the rest.
    const hasObserved = component.props.some((prop) => prop.provenance === 'observed');
    const propRows = component.props.map((prop) => [
        resolvePropName(prop, framework) + (prop.provenance === 'observed' ? ' †' : ''),
        renderType(prop),
        prop.default,
        prop.required ? 'yes' : '',
        full ? prop.description : prop.description?.slice(0, 60),
    ]);
    const propsTable = table(['prop', 'type', 'default', 'required', 'description'], propRows);
    const naming = [
        bindingSyntaxFor(framework),
        hasObserved ? '_† observed in stories, not declared by the component._' : '',
    ]
        .filter(Boolean)
        .join('\n');
    const eventsTable = component.events?.length
        ? table(['event', 'description'], component.events.map((event) => [resolveEventName(event, framework), full ? event.description : event.description?.slice(0, 70)]))
        : undefined;
    const usage = component.usage.find((snippet) => snippet.framework === framework) || component.usage[0];
    // Composition children an agent needs in order to write the parent at all.
    const subComponents = (component.subComponents || []).map((child) => join(`### \`<${child.tag}>\``, child.imports?.[framework] ? `\`${child.imports[framework]}\`` : undefined, table(['prop', 'type', 'default'], child.props.map((prop) => [
        resolvePropName(prop, framework),
        renderType(prop),
        prop.default,
    ])), child.events?.length ? `Events: ${child.events.map((event) => `\`${resolveEventName(event, framework)}\``).join(', ')}` : undefined));
    return join(heading, facts, component.props.length ? join(`## Props (${component.props.length})`, propsTable, naming) : undefined, eventsTable ? join(`## Events`, eventsTable) : undefined, subComponents.length ? join('## Child elements', ...subComponents) : undefined, usage ? section(`Usage — ${usage.story} (${usage.framework})`, codeBlock(usage.code)) : undefined, component.guidance
        ? `_Design rules and accessibility: \`get-design-guidance("${component.name}")\`._`
        : undefined, component.refs.storybook[framework]
        ? `Storybook: ${component.refs.storybook[framework]}`
        : undefined);
}
//# sourceMappingURL=tools.js.map