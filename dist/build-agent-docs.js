/**
 * Builds data/igds-agent-docs.json — the lean, agent-facing artifact the MCP tools serve.
 *
 * Input is the raw scrape (data/igds-storybook-data.json + data/zeroheight-data.json),
 * which stays the source of record. This step is a pure transform: it distils the parts a
 * coding agent needs and drops rendered HTML, CSS and site chrome entirely.
 *
 * Run: npm run build:docs
 */
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { FRAMEWORKS, } from './agent-docs.js';
import { attributeKey, looksLikeEnum, mergeSquashedAttributes, mineAttributes, toUsageSnippet, } from './light-dom.js';
import { buildChromeLines, cleanComponentSections, extractGuidance } from './zeroheight-clean.js';
import { getZeroheightComponentName } from './scrapers/cross-reference.js';
import { parseLiteralUnion } from './scrapers/storybook-api.js';
const DATA_DIR = join(process.cwd(), 'data');
const STORYBOOK_FILE = join(DATA_DIR, 'igds-storybook-data.json');
const ZEROHEIGHT_FILE = join(DATA_DIR, 'zeroheight-data.json');
const PACKAGES_FILE = join(DATA_DIR, 'packages.json');
const OUTPUT_FILE = join(DATA_DIR, 'igds-agent-docs.json');
const SCHEMA_VERSION = 1;
/** Frameworks whose light DOM keeps authored attributes, best first. */
const SNIPPET_PREFERENCE = ['core-web', 'angular', 'react'];
// One guaranteed slot per framework, plus headroom for a couple of extra variety snippets.
const MAX_USAGE_SNIPPETS = 5;
function kebab(name) {
    return name
        .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
        .replace(/\s+/g, '-')
        .toLowerCase();
}
/**
 * Grouping key for matching the same component across frameworks that title it
 * differently. This has to be more than case/whitespace-insensitive: Angular's Storybook
 * titles frequently use the bare class name ("CheckboxGroup", "DatePicker") while React
 * and core-web use a human-readable title ("Checkbox Group", "Date Picker") for the exact
 * same component — so all non-alphanumeric characters are stripped, not just collapsed.
 */
function normalizeComponentKey(name) {
    return name.replace(/[^a-z0-9]/gi, '').toLowerCase();
}
/**
 * Pick the display name IGDS most likely intended. A genuine multi-word Title Case name
 * ("Date Picker") reads better than the spaceless class-name-style title some frameworks
 * use instead ("DatePicker") for the same component, so it wins when available; otherwise
 * fall back to any Title Case variant, then to the alphabetically-first for determinism.
 */
function pickCanonicalName(variants) {
    const isTitleCase = (variant) => variant.split(/\s+/).every((word) => !/[a-zA-Z]/.test(word) || /^[A-Z]/.test(word));
    const multiWordTitleCase = variants.find((variant) => /\s/.test(variant) && isTitleCase(variant));
    if (multiWordTitleCase)
        return multiWordTitleCase;
    return variants.find(isTitleCase) || [...variants].sort()[0];
}
/** Re-key a framework's component bucket from whatever raw title it used onto the
 *  canonical name chosen for that component. */
function reKeyByCanonical(bucket, canonicalByRawName) {
    const out = {};
    for (const [rawName, value] of Object.entries(bucket || {})) {
        out[canonicalByRawName.get(rawName) || rawName] = value;
    }
    return out;
}
/**
 * A valid PascalCase JS/TS identifier for a component's display name — "Date Picker" ->
 * "DatePicker", "Drag & Drop List" -> "DragDropList". Import statements substitute this,
 * never the raw display name, which can contain spaces or punctuation that would produce
 * syntactically invalid code (`import { Date Picker } from ...` does not parse).
 */
function toPascalIdentifier(name) {
    return name
        .replace(/[^a-zA-Z0-9]+/g, ' ')
        .trim()
        .split(/\s+/)
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join('');
}
const PRIMITIVE_TYPES = ['string', 'boolean', 'number', 'object', 'array', 'function'];
/**
 * The raw scrape sometimes concatenates a JSDoc description with its type
 * ("Icon in active statestring") or carries React's flattened tsType names
 * ("ReactReactNode"). Recover both halves rather than showing either as a type.
 */
function splitTypeAndDescription(raw) {
    if (!raw)
        return {};
    const value = raw.trim();
    if (!value || value === '-' || value === 'unknown')
        return {};
    const lower = value.toLowerCase();
    if (PRIMITIVE_TYPES.includes(lower))
        return { type: lower };
    if (lower === 'bool')
        return { type: 'boolean' };
    // "string | undefined" -> "string"
    const withoutUndefined = value.replace(/\s*\|\s*undefined\s*$/i, '').trim();
    if (PRIMITIVE_TYPES.includes(withoutUndefined.toLowerCase())) {
        return { type: withoutUndefined.toLowerCase() };
    }
    // "Icon in active statestring" -> description "Icon in active state", type "string"
    // "Requiredstring"               -> required flag, type "string"
    for (const primitive of PRIMITIVE_TYPES) {
        if (lower.endsWith(primitive) && value.length > primitive.length) {
            const prefix = value.slice(0, value.length - primitive.length).trim();
            if (!prefix)
                continue;
            if (/^required$/i.test(prefix))
                return { type: primitive, required: true };
            if (/\s/.test(prefix))
                return { type: primitive, description: prefix };
        }
    }
    // React docgen flattens nested tsTypes: "ReactReactNode" -> "ReactNode".
    const deduped = value.replace(/^React(React)+/, 'React');
    if (/^[A-Za-z][\w.<>|[\]]*$/.test(deduped))
        return { type: deduped };
    // Anything else is prose that landed in the type field.
    return { description: value };
}
/**
 * Defaults are only useful if an agent can write them. Minified references to internal
 * constants (`heart_filled.Z`, `IGDS_CARD_DIRECTIONS.horizontal`) are not, unless they
 * resolve to a known legal value.
 */
function cleanDefault(raw, values) {
    if (!raw)
        return undefined;
    const value = raw.trim();
    if (!value || value === '-' || value === 'undefined' || value === 'void 0')
        return undefined;
    if (value.length > 40)
        return undefined;
    if (/^(true|false)$/.test(value))
        return value;
    if (/^-?\d+(\.\d+)?$/.test(value))
        return value;
    const unquoted = value.replace(/^['"]|['"]$/g, '');
    // `IGDS_CARD_DIRECTIONS.horizontal` -> `horizontal`, but only if it is a real value.
    const tail = unquoted.includes('.') ? unquoted.split('.').pop() : unquoted;
    if (values?.length) {
        if (values.includes(unquoted))
            return unquoted;
        if (values.includes(tail))
            return tail;
        return undefined;
    }
    // Without a vocabulary to check against, keep plain literals and drop code references.
    if (/^[\w֐-׿ ]+$/.test(unquoted) && !unquoted.includes('.'))
        return unquoted;
    return undefined;
}
const DEFAULT_IMPORT_TEMPLATES = {
    // React wrappers export named components.
    react: "import { {component} } from '{package}';",
    // Lit custom elements register themselves; a side-effect import is what you write.
    'core-web': "import '{package}';",
    // Standalone Angular components, deep-imported per component and then listed in the
    // consuming component's `imports: [...]` array. Confirmed from an IGDS usage sample.
    angular: "import { Igds{component} } from '{package}/{path}';",
};
function renderImport(entry, framework, componentName, tag) {
    if (!entry)
        return undefined;
    const packageName = typeof entry === 'string' ? entry : entry.package;
    if (!packageName)
        return undefined;
    const template = (typeof entry === 'string' ? undefined : entry.import) || DEFAULT_IMPORT_TEMPLATES[framework];
    // Deep-import subpath: the tag without its igds- prefix (accordion-item).
    const path = (tag || '').replace(/^igds-/, '');
    return template
        .replace(/\{component\}/g, componentName)
        .replace(/\{package\}/g, packageName)
        .replace(/\{tag\}/g, tag || '')
        .replace(/\{path\}/g, path);
}
/** Every documented group found across all frameworks for one docs page. */
function collectDocumentedGroups(raw, docsPageKey) {
    const out = [];
    for (const framework of FRAMEWORKS) {
        for (const group of raw.documentedApi?.[framework]?.[docsPageKey] || []) {
            out.push({ framework, group });
        }
    }
    return out;
}
/**
 * Narrow a flat list of documented groups down to the (at most one per framework) group
 * that documents a specific component or child element. React names groups in PascalCase
 * ("AccordionItem"); core-web names them by tag ("igds-accordion-item"); a docs page can
 * document several components, so the caller must say which one it wants.
 */
function pickDocumentedGroups(entries, matches) {
    const result = {};
    for (const { framework, group } of entries) {
        if (result[framework])
            continue;
        if (matches(group.component))
            result[framework] = group;
    }
    return result;
}
/** Higher rank overrides lower rank; equal rank overrides in processing order (last wins). */
const PROVENANCE_RANK = {
    documented: 3,
    manifest: 2,
    argtypes: 1,
    observed: 0,
};
/**
 * Merge everything known about one component's props from the four available signals,
 * keyed so that `notificationButtonVariant` and `notification-button-variant` land together.
 *
 * `documentedByFramework` is IGDS's own hand-written per-framework API table for this exact
 * component or child element (see `pickDocumentedGroups`) — the highest-trust source, since
 * it is prose IGDS wrote about this component, not something inferred from its bundle.
 */
function buildProps(componentName, tag, raw, mined, documentedByFramework) {
    const byKey = new Map();
    const upsert = (name, patch) => {
        const key = attributeKey(name);
        const existing = byKey.get(key);
        const patchRank = PROVENANCE_RANK[patch.provenance];
        if (!existing) {
            byKey.set(key, {
                name: kebab(name),
                names: patch.names,
                type: patch.type || 'string',
                values: patch.values,
                rawDefault: patch.rawDefault,
                required: patch.required,
                description: patch.description,
                provenance: patch.provenance,
            });
            return;
        }
        const existingRank = PROVENANCE_RANK[existing.provenance];
        // Prefer the hyphenated spelling for the canonical name — it is what works in core-web
        // markup. Serialised HTML is lowercased (`multiExpand` -> `multiexpand`), so a name from
        // any higher-or-equal-trust source is allowed to fix the casing an `observed` one lost.
        if (name.includes('-') && !existing.name.includes('-'))
            existing.name = name;
        if (patchRank > 0 && existing.provenance === 'observed')
            existing.name = kebab(name);
        if (patch.names)
            existing.names = { ...existing.names, ...patch.names };
        // A higher-or-equal-trust source may correct type/description/required; a lower-trust
        // one may only fill gaps. An empty `image-alt=""` observed in a story must never turn a
        // declared string prop into a boolean.
        if (patchRank >= existingRank) {
            existing.provenance = patch.provenance;
            if (patch.type)
                existing.type = patch.type;
            if (patch.description)
                existing.description = patch.description;
            if (patch.required !== undefined)
                existing.required = patch.required;
        }
        else {
            existing.description ??= patch.description;
            existing.required ??= patch.required;
        }
        if (patch.values?.length && (!existing.values?.length || patchRank >= existingRank)) {
            existing.values = patch.values;
        }
        existing.rawDefault ??= patch.rawDefault;
    };
    // 1. IGDS's own hand-written per-framework API tables — highest trust, and the only
    // source that knows a prop can be spelled differently per framework (React's documented
    // `multiexpand` vs. the same concept elsewhere).
    if (documentedByFramework) {
        for (const framework of FRAMEWORKS) {
            const group = documentedByFramework[framework];
            if (!group)
                continue;
            for (const prop of group.props) {
                if (!prop.name)
                    continue;
                // Re-derive from the raw type text rather than trusting `prop.options`: a scraper
                // fix can correct how a *new* scrape parses "'primary' | 'secondary'" vs. "string |
                // undefined", but an already-saved raw file still has whatever the scraper computed
                // at capture time. The type string itself is unaffected by that, so re-parsing it
                // here keeps the artifact correct without requiring a fresh scrape.
                const values = parseLiteralUnion(prop.type);
                const type = values?.length ? 'string' : splitTypeAndDescription(prop.type).type || prop.type?.trim() || 'string';
                upsert(prop.name, {
                    type,
                    values,
                    description: prop.description,
                    required: prop.required,
                    names: { [framework]: prop.name },
                    provenance: 'documented',
                });
            }
        }
    }
    // 2. Declared component source (custom-elements manifest / docgen / Angular class).
    for (const framework of FRAMEWORKS) {
        const source = raw.sourceCode?.[framework]?.[componentName];
        if (!source)
            continue;
        for (const property of source.properties || []) {
            const { type, description, required } = splitTypeAndDescription(property.type);
            // core-web IS the custom element: it takes the HTML attribute. React and Angular
            // bind to the JS/TS class property, which can have different casing (Angular's
            // `multiExpand` reflects to the HTML attribute `multiexpand`; binding the attribute
            // spelling in a template does not work).
            const literalName = framework === 'core-web' ? property.attribute || kebab(property.name) : property.name;
            upsert(property.attribute || property.name, {
                type: type || 'string',
                rawDefault: property.defaultValue ?? source.constructorDefaults?.[property.name],
                description: property.description || description,
                required: property.required ?? required,
                names: literalName ? { [framework]: literalName } : undefined,
                provenance: 'manifest',
            });
        }
    }
    // 3. Storybook argTypes — currently thin, but authoritative once the docs scraper is fixed.
    for (const framework of FRAMEWORKS) {
        for (const argType of raw[framework]?.[componentName]?.argTypes || []) {
            if (!argType?.name)
                continue;
            // `description` frequently holds the type rather than prose; split it apart.
            const fromType = splitTypeAndDescription(argType.type);
            const fromDescription = splitTypeAndDescription(argType.description);
            upsert(argType.name, {
                type: fromType.type || fromDescription.type || 'string',
                values: argType.options,
                rawDefault: argType.defaultValue,
                required: argType.required ?? fromType.required ?? fromDescription.required,
                description: fromType.description || fromDescription.description,
                names: { [framework]: argType.name },
                provenance: 'argtypes',
            });
        }
    }
    // 4. Values actually used in the design system's own stories.
    const attributes = tag ? mined.get(tag) : undefined;
    if (attributes) {
        for (const [name, observed] of attributes) {
            const isEnum = looksLikeEnum(observed.values);
            upsert(name, {
                type: !observed.values.length && observed.booleanish ? 'boolean' : 'string',
                values: isEnum ? observed.values : undefined,
                provenance: 'observed',
            });
        }
    }
    return [...byKey.values()]
        .map(({ rawDefault, ...prop }) => {
        const resolved = cleanDefault(rawDefault, prop.values);
        return resolved ? { ...prop, default: resolved } : prop;
    })
        .sort((a, b) => a.name.localeCompare(b.name));
}
/**
 * Reduce an event name to a merge key that collapses framework-specific spellings of the
 * same underlying event: React's synthetic `onIgdsToggle` and the raw `igds-toggle` custom
 * event both reduce to `igdstoggle`.
 */
function eventKey(name) {
    return name.replace(/^on(?=[A-Z])/, '').replace(/[^a-z0-9]/gi, '').toLowerCase();
}
/**
 * Merge event documentation across frameworks. IGDS's documented tables are trusted first;
 * the custom-elements manifest (currently only populated from the core-web bundle) fills in
 * whatever the documented tables missed. The same underlying event can be spelled
 * differently per framework, so each framework's literal spelling is kept in `names` for
 * `resolveEventName` to pick the right one at render time.
 */
function buildEvents(documentedByFramework, raw, componentName) {
    const byKey = new Map();
    // Defense in depth: manifest generators occasionally lose a real event name and leave a
    // generic placeholder in its place (seen from IGDS's own core-web bundle: an event
    // literally named "name", inherited from a shared base class). Reject anything that
    // isn't a plausible identifier for what it claims to be.
    const BOGUS_EVENT_NAMES = new Set(['name', 'type', 'value', 'id', 'event']);
    const upsert = (name, description, framework) => {
        if (!name || BOGUS_EVENT_NAMES.has(name.toLowerCase()))
            return;
        const key = eventKey(name);
        const names = framework ? { [framework]: name } : undefined;
        const existing = byKey.get(key);
        if (!existing) {
            byKey.set(key, { name, description, names });
            return;
        }
        // The raw custom-event spelling (has a hyphen) is the canonical one — it is what
        // core-web and Angular actually listen for; React's `onXxx` is a derived convention.
        if (name.includes('-') && !existing.name.includes('-'))
            existing.name = name;
        existing.description ??= description;
        if (names)
            existing.names = { ...existing.names, ...names };
    };
    for (const [framework, group] of Object.entries(documentedByFramework || {})) {
        for (const event of group?.events || [])
            upsert(event.name, event.description, framework);
    }
    for (const framework of FRAMEWORKS) {
        for (const event of raw.sourceCode?.[framework]?.[componentName]?.events || []) {
            // core-web IS the custom element: its manifest event name is the raw DOM event name.
            upsert(event.name, event.description, framework === 'core-web' ? framework : undefined);
        }
    }
    const events = [...byKey.values()];
    return events.length ? events : undefined;
}
/**
 * Storybook's own "Show code" panel for a story can include the story's demo CSS inline
 * (core-web stories in particular render `<style>...</style>` next to the markup). That is
 * presentation, not API usage, and must never reach an agent — strip it before the snippet
 * is used at all.
 */
function stripPresentationChrome(code) {
    let result = code.replace(/<style[\s\S]*?<\/style>/gi, '').trim();
    // Storybook wraps every story in a demo harness div that is not part of the component's
    // API. Unwrap it only when it is the sole element bounding the whole snippet — a safe
    // condition to check with a regex, unlike matching arbitrary nested divs.
    const wrapper = result.match(/^<div class="storybook-page-story"[^>]*>([\s\S]*)<\/div>\s*$/);
    if (wrapper)
        result = wrapper[1].trim();
    // Storybook's own "Show code" panel leaves blank lines (sometimes with trailing
    // whitespace, so a bare /\n{2,}/ would miss them) where lit-html's `<!--?lit$...$-->`
    // markers used to sit — pure noise, not meaningful structure in the source.
    return result.replace(/\n[ \t]*(?:\n[ \t]*)+/g, '\n').trim();
}
function buildUsage(componentName, raw) {
    const snippets = [];
    const seen = new Set();
    const tryAdd = (framework, story) => {
        const rawCode = story.sourceCode?.trim();
        const code = rawCode ? stripPresentationChrome(rawCode) : toUsageSnippet(story.renderedHtml || '');
        if (!code)
            return false;
        // Different stories often render the same markup; keep the vocabulary, not the repeats.
        const signature = code.replace(/\s+/g, '');
        if (seen.has(signature))
            return false;
        seen.add(signature);
        snippets.push({ story: story.name || story.id, framework, code });
        return true;
    };
    // Pass 1: guarantee one usable snippet per framework that has stories at all. Without
    // this, a component with many core-web/angular story variants could fill the whole
    // budget before react is even considered — and a caller asking for React usage needs
    // real JSX, not whichever framework happened to go first.
    for (const framework of SNIPPET_PREFERENCE) {
        for (const story of raw.storyExamples?.[framework]?.[componentName] || []) {
            if (tryAdd(framework, story))
                break;
        }
    }
    // Pass 2: fill any remaining budget with additional variety, in preference order.
    for (const framework of SNIPPET_PREFERENCE) {
        if (snippets.length >= MAX_USAGE_SNIPPETS)
            break;
        for (const story of raw.storyExamples?.[framework]?.[componentName] || []) {
            if (snippets.length >= MAX_USAGE_SNIPPETS)
                break;
            tryAdd(framework, story);
        }
    }
    return snippets;
}
function main() {
    if (!existsSync(STORYBOOK_FILE)) {
        console.error(`Missing ${STORYBOOK_FILE}. Run "npm run scrape" first.`);
        process.exit(1);
    }
    let raw = JSON.parse(readFileSync(STORYBOOK_FILE, 'utf-8'));
    const zeroheight = existsSync(ZEROHEIGHT_FILE)
        ? JSON.parse(readFileSync(ZEROHEIGHT_FILE, 'utf-8'))
        : null;
    const packages = existsSync(PACKAGES_FILE)
        ? JSON.parse(readFileSync(PACKAGES_FILE, 'utf-8'))
        : {};
    // Mine attribute vocabulary once, across every story of every framework.
    const mined = new Map();
    for (const framework of FRAMEWORKS) {
        for (const stories of Object.values(raw.storyExamples?.[framework] || {})) {
            for (const story of stories)
                mineAttributes(story.renderedHtml || '', mined);
        }
    }
    mergeSquashedAttributes(mined);
    const chrome = zeroheight
        ? buildChromeLines(Object.values(zeroheight.components).flatMap((component) => Object.values(component.sections)
            .map((section) => section?.content)
            .filter((content) => Boolean(content))))
        : new Set();
    // IGDS's own Storybook titles the same component differently per framework — e.g.
    // Angular's docs page says "Date Picker", core-web's says "Date picker". Left alone, that
    // produces two separate, each-incomplete top-level components instead of one component
    // available in three frameworks. Group every raw name across all frameworks by a
    // case/whitespace-insensitive key, pick one canonical display name per group, and re-key
    // the entire raw scrape onto it — so every downstream lookup (props, stories, docs
    // tables, refs) sees one consistent name regardless of which framework it came from.
    const canonicalByRawName = new Map();
    {
        const groups = new Map();
        for (const framework of FRAMEWORKS) {
            for (const rawName of Object.keys(raw[framework] || {})) {
                const key = normalizeComponentKey(rawName);
                const variants = groups.get(key) || [];
                if (!variants.includes(rawName))
                    variants.push(rawName);
                groups.set(key, variants);
            }
        }
        for (const variants of groups.values()) {
            const canonical = pickCanonicalName(variants);
            for (const variant of variants)
                canonicalByRawName.set(variant, canonical);
        }
    }
    const normalizedRaw = {
        angular: reKeyByCanonical(raw.angular, canonicalByRawName),
        react: reKeyByCanonical(raw.react, canonicalByRawName),
        'core-web': reKeyByCanonical(raw['core-web'], canonicalByRawName),
        sourceCode: {
            angular: reKeyByCanonical(raw.sourceCode?.angular, canonicalByRawName),
            react: reKeyByCanonical(raw.sourceCode?.react, canonicalByRawName),
            'core-web': reKeyByCanonical(raw.sourceCode?.['core-web'], canonicalByRawName),
        },
        storyExamples: {
            angular: reKeyByCanonical(raw.storyExamples?.angular, canonicalByRawName),
            react: reKeyByCanonical(raw.storyExamples?.react, canonicalByRawName),
            'core-web': reKeyByCanonical(raw.storyExamples?.['core-web'], canonicalByRawName),
        },
        documentedApi: {
            angular: reKeyByCanonical(raw.documentedApi?.angular, canonicalByRawName),
            react: reKeyByCanonical(raw.documentedApi?.react, canonicalByRawName),
            'core-web': reKeyByCanonical(raw.documentedApi?.['core-web'], canonicalByRawName),
        },
        scrapedAt: raw.scrapedAt,
    };
    raw = normalizedRaw;
    const names = new Set(canonicalByRawName.values());
    const components = {};
    const categories = new Set();
    for (const name of [...names].sort()) {
        const frameworks = FRAMEWORKS.filter((framework) => raw[framework]?.[name]);
        const declaredTag = FRAMEWORKS.map((framework) => raw.sourceCode?.[framework]?.[name]?.tagName).find(Boolean);
        // Prefer a tag we have actually seen in markup. Some components squash their name
        // (SpinBox renders as <igds-spinbox>, not <igds-spin-box>), so try both spellings
        // before falling back to whatever the bundle declared.
        const candidates = [`igds-${kebab(name)}`, `igds-${name.toLowerCase().replace(/\s+/g, '')}`, declaredTag];
        const tag = candidates.find((candidate) => candidate && mined.has(candidate)) || declaredTag;
        const zeroheightName = getZeroheightComponentName(name);
        const zeroheightComponent = zeroheightName ? zeroheight?.components[zeroheightName] : undefined;
        let summary;
        let guidance;
        if (zeroheightComponent) {
            const cleaned = cleanComponentSections(zeroheightComponent.sections, chrome, zeroheightComponent.name);
            summary = cleaned.summary;
            guidance = extractGuidance(cleaned);
            if (zeroheightComponent.category)
                categories.add(zeroheightComponent.category);
        }
        const storybookRefs = {};
        for (const framework of frameworks) {
            const url = raw[framework]?.[name]?.url;
            if (url)
                storybookRefs[framework] = url;
        }
        const identifier = toPascalIdentifier(name);
        const imports = {};
        for (const framework of frameworks) {
            const statement = renderImport(packages[framework], framework, identifier, tag);
            if (statement)
                imports[framework] = statement;
        }
        // IGDS documents a docs page's own component under its PascalCase name (react) or its
        // tag (core-web); Angular pages currently have no such table at all.
        const documentedEntries = collectDocumentedGroups(raw, name);
        const parentGroups = pickDocumentedGroups(documentedEntries, (component) => component.toLowerCase() === name.toLowerCase() ||
            (!!tag && component.toLowerCase() === tag.toLowerCase()));
        components[name] = {
            name,
            tag,
            category: zeroheightComponent?.category,
            summary,
            frameworks,
            imports: Object.keys(imports).length ? imports : undefined,
            props: buildProps(name, tag, raw, mined, parentGroups),
            events: buildEvents(parentGroups, raw, name),
            usage: buildUsage(name, raw),
            guidance,
            refs: {
                storybook: storybookRefs,
                zeroheight: zeroheightComponent?.url,
            },
        };
    }
    const unattachedTags = attachSubComponents(components, mined, raw, packages);
    if (unattachedTags.length) {
        console.warn(`  WARNING: ${unattachedTags.length} tags seen in markup could not be matched to a parent component: ${unattachedTags.join(', ')}`);
    }
    const notes = [];
    const configuredFrameworks = FRAMEWORKS.filter((framework) => packages[framework]);
    if (!configuredFrameworks.length) {
        notes.push('Import statements are not published for IGDS. Configure real package names in data/packages.json to have them served; until then no import is guessed.');
    }
    notes.push('Prop values marked as observed were collected from the design system\'s own stories; they are real but may not be exhaustive.');
    const docs = {
        schema: SCHEMA_VERSION,
        scrapedAt: raw.scrapedAt,
        builtAt: new Date().toISOString(),
        categories: [...categories].sort(),
        components,
        notes,
    };
    writeFileSync(OUTPUT_FILE, JSON.stringify(docs), 'utf-8');
    report(docs);
}
function pascalFromTag(tag) {
    return tag
        .replace(/^igds-/, '')
        .split('-')
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join('');
}
/**
 * Storybook documents `Accordion` but not `<igds-accordion-item>`, yet an agent cannot
 * write an accordion without it. Attach every mined tag that has no entry of its own to
 * the documented component it composes with.
 */
function attachSubComponents(components, mined, raw, packages) {
    const documented = new Map();
    for (const component of Object.values(components)) {
        if (component.tag)
            documented.set(component.tag, component);
    }
    const unattached = [];
    for (const tag of mined.keys()) {
        if (documented.has(tag))
            continue;
        const base = tag.replace(/^igds-/, '');
        let parent;
        let bestLength = 0;
        for (const [parentTag, candidate] of documented) {
            const parentBase = parentTag.replace(/^igds-/, '');
            const singular = parentBase.replace(/s$/, '');
            // `igds-table-row` belongs to `igds-table`; `igds-tab` to `igds-tabs`;
            // `igds-vertical-filter` to `igds-filter`.
            const matches = base.startsWith(`${parentBase}-`) ||
                base.startsWith(`${singular}-`) ||
                base === singular ||
                base.endsWith(`-${parentBase}`) ||
                base.endsWith(`-${singular}`);
            if (matches && parentBase.length > bestLength) {
                parent = candidate;
                bestLength = parentBase.length;
            }
        }
        if (!parent) {
            unattached.push(tag);
            continue;
        }
        const name = pascalFromTag(tag);
        // Documented groups live under the PARENT's docs page (e.g. AccordionItem's own table
        // is on the Accordion docs page), keyed by the tag/name IGDS gave that group there.
        const documentedEntries = collectDocumentedGroups(raw, parent.name);
        const childGroups = pickDocumentedGroups(documentedEntries, (component) => component.toLowerCase() === tag.toLowerCase() ||
            component.toLowerCase() === name.toLowerCase() ||
            `igds-${kebab(component)}` === tag);
        // `children` is slot content, not a prop anyone writes as an attribute.
        const props = buildProps(name, tag, raw, mined, childGroups).filter((prop) => prop.name !== 'children');
        if (!props.length)
            continue;
        const imports = {};
        for (const framework of parent.frameworks) {
            const statement = renderImport(packages[framework], framework, name, tag);
            if (statement)
                imports[framework] = statement;
        }
        const child = {
            name,
            tag,
            props,
            events: buildEvents(childGroups, raw, name),
            imports: Object.keys(imports).length ? imports : undefined,
        };
        parent.subComponents = [...(parent.subComponents || []), child];
    }
    return unattached;
}
/** Loud, specific output so data rot is visible instead of silently shipping. */
function report(docs) {
    const all = Object.values(docs.components);
    const withProps = all.filter((component) => component.props.length);
    const withUsage = all.filter((component) => component.usage.length);
    const withValues = all.filter((component) => component.props.some((prop) => prop.values?.length));
    const withGuidance = all.filter((component) => component.guidance);
    const withSummary = all.filter((component) => component.summary);
    const bytes = readFileSync(OUTPUT_FILE).length;
    const rawBytes = readFileSync(STORYBOOK_FILE).length;
    console.log(`Wrote ${OUTPUT_FILE}`);
    console.log(`  components:     ${all.length}`);
    console.log(`  with props:     ${withProps.length}`);
    console.log(`  with values:    ${withValues.length}`);
    console.log(`  with usage:     ${withUsage.length}`);
    console.log(`  with summary:   ${withSummary.length}`);
    console.log(`  with guidance:  ${withGuidance.length}`);
    console.log(`  size:           ${(bytes / 1024).toFixed(0)} KB (raw scrape: ${(rawBytes / 1024).toFixed(0)} KB)`);
    const noProps = all.filter((component) => !component.props.length).map((component) => component.name);
    if (noProps.length) {
        console.warn(`  WARNING: ${noProps.length} components have no props: ${noProps.slice(0, 12).join(', ')}`);
    }
    const children = all.reduce((total, component) => total + (component.subComponents?.length || 0), 0);
    console.log(`  child elements: ${children}`);
    const noUsage = all.filter((component) => !component.usage.length).map((component) => component.name);
    if (noUsage.length) {
        console.warn(`  WARNING: ${noUsage.length} components have no usage snippet: ${noUsage.slice(0, 12).join(', ')}`);
    }
    const serialized = JSON.stringify(docs);
    for (const banned of ['renderedHtml', 'cssStyles', '<storybook-root', '_ngcontent']) {
        if (serialized.includes(banned)) {
            console.error(`  FAIL: agent docs contain "${banned}" — this artifact must stay presentation-free.`);
            process.exitCode = 1;
        }
    }
}
main();
//# sourceMappingURL=build-agent-docs.js.map