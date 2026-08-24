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
const VOID_ELEMENTS = new Set([
    'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
    'link', 'meta', 'param', 'source', 'track', 'wbr',
]);
/** Attributes that describe the story/harness rather than the component API. */
const NOISE_ATTRIBUTES = new Set(['class', 'style', 'id', 'slot', 'tabindex']);
const NOISE_ATTRIBUTE_PATTERN = /^(_?ng(content|host)-|ng-|data-|aria-|_)/i;
/**
 * Framework directives that appear in the markup but are not part of the component's API.
 * Left in, they show up as props with nonsense vocabularies (`formcontrolname` with the
 * story's field names as its "legal values").
 */
const FRAMEWORK_DIRECTIVES = new Set([
    'formcontrolname', 'formgroup', 'formgroupname', 'formarrayname', 'formcontrol',
    'ngmodel', 'ngclass', 'ngstyle', 'ngif', 'ngfor', 'ngswitch', 'ngdefaultcontrol',
    'routerlink', 'routerlinkactive', 'key', 'ref',
]);
/** Attribute values longer than this are content/SVG payloads, not API vocabulary. */
const MAX_MINED_VALUE_LENGTH = 60;
const TAG_PATTERN = /<(\/?)([a-zA-Z][\w-]*)((?:[^>"']|"[^"]*"|'[^']*')*?)(\/?)>/g;
const ATTRIBUTE_PATTERN = /([a-zA-Z_@[(][^\s=/>]*)(?:=("[^"]*"|'[^']*'))?/g;
function parseAttributes(raw) {
    const attributes = [];
    ATTRIBUTE_PATTERN.lastIndex = 0;
    let match;
    while ((match = ATTRIBUTE_PATTERN.exec(raw)) !== null) {
        const name = match[1];
        if (!name)
            continue;
        const quoted = match[2];
        attributes.push({
            name,
            value: quoted === undefined ? undefined : quoted.slice(1, -1),
        });
    }
    return attributes;
}
function decodeEntities(value) {
    return value
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&');
}
function isNoiseAttribute(name) {
    const lower = name.toLowerCase();
    return (NOISE_ATTRIBUTES.has(lower) ||
        NOISE_ATTRIBUTE_PATTERN.test(name) ||
        FRAMEWORK_DIRECTIVES.has(lower.replace(/[-_[\]()*@]/g, '')));
}
/**
 * Angular renders `[notificationButtonVariant]` and web components render
 * `notification-button-variant` for the same API. Canonicalise to kebab-case so the two
 * do not show up as separate props.
 */
export function canonicalAttributeName(name) {
    return name
        .replace(/^[[(*@]+/, '')
        .replace(/[\])]+$/, '')
        .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
        .toLowerCase();
}
/**
 * Angular and React bind properties in JS, so their light DOM often carries framework
 * bookkeeping attributes instead of the authored ones. We keep whatever survives and let
 * the caller merge across frameworks.
 */
export function mineAttributes(html, into = new Map()) {
    if (!html)
        return into;
    TAG_PATTERN.lastIndex = 0;
    let match;
    while ((match = TAG_PATTERN.exec(html)) !== null) {
        const isClosing = match[1] === '/';
        const tagName = match[2].toLowerCase();
        if (isClosing || !tagName.startsWith('igds-'))
            continue;
        let attributes = into.get(tagName);
        if (!attributes) {
            attributes = new Map();
            into.set(tagName, attributes);
        }
        for (const { name, value } of parseAttributes(match[3] || '')) {
            if (isNoiseAttribute(name))
                continue;
            // Angular/Lit template syntax: [prop]="x", (event)="y", *ngIf — not authorable API.
            const normalized = canonicalAttributeName(name);
            if (!/^[a-z][\w-]*$/.test(normalized))
                continue;
            let mined = attributes.get(normalized);
            if (!mined) {
                mined = { values: [], booleanish: false, occurrences: 0 };
                attributes.set(normalized, mined);
            }
            mined.occurrences++;
            const decoded = value === undefined ? '' : decodeEntities(value).trim();
            if (decoded === '') {
                mined.booleanish = true;
                continue;
            }
            // A literal "undefined"/"null" string means a story interpolated an unset JS value
            // into the markup — an authoring artifact, never a real design-system value.
            if (/^(undefined|null)$/i.test(decoded))
                continue;
            if (decoded.length > MAX_MINED_VALUE_LENGTH)
                continue;
            if (!mined.values.includes(decoded))
                mined.values.push(decoded);
        }
    }
    return into;
}
/**
 * Key used to match names that describe the same API across sources:
 * `notificationButtonVariant`, `notification-button-variant` and the browser-lowercased
 * `notificationbuttonvariant` all collapse to `notificationbuttonvariant`.
 */
export function attributeKey(name) {
    return name.replace(/[-_]/g, '').toLowerCase();
}
/**
 * Serialised HTML loses camelCase, so the same prop can be mined under both a hyphenated
 * and a squashed spelling. Merge those, keeping the hyphenated name — it is the spelling
 * that actually works in markup.
 */
export function mergeSquashedAttributes(mined) {
    for (const [tag, attributes] of mined) {
        const byKey = new Map();
        for (const name of attributes.keys()) {
            const key = attributeKey(name);
            byKey.set(key, [...(byKey.get(key) || []), name]);
        }
        for (const names of byKey.values()) {
            if (names.length < 2)
                continue;
            // Prefer the most hyphenated spelling; it is the canonical HTML attribute.
            const canonical = names.reduce((best, name) => (name.match(/-/g)?.length || 0) > (best.match(/-/g)?.length || 0) ? name : best);
            const target = attributes.get(canonical);
            for (const name of names) {
                if (name === canonical)
                    continue;
                const other = attributes.get(name);
                target.occurrences += other.occurrences;
                target.booleanish ||= other.booleanish;
                for (const value of other.values) {
                    if (!target.values.includes(value))
                        target.values.push(value);
                }
                attributes.delete(name);
            }
        }
        mined.set(tag, attributes);
    }
    return mined;
}
/**
 * Decide whether a mined attribute's observed values form a closed vocabulary worth
 * telling the agent about, as opposed to free text (labels, hrefs, titles).
 */
export function looksLikeEnum(values) {
    if (values.length < 2 || values.length > 12)
        return false;
    return values.every((value) => /^[a-zA-Z][a-zA-Z0-9_-]*$/.test(value) && value.length <= 24);
}
function cleanAttributes(raw) {
    const kept = [];
    for (const { name, value } of parseAttributes(raw)) {
        const canonical = canonicalAttributeName(name);
        // `dir` is meaningful for IGDS (RTL is a first-class concern); other noise is not.
        if (canonical !== 'dir' && isNoiseAttribute(name))
            continue;
        if (!/^[a-z][\w-]*$/.test(canonical))
            continue;
        const decoded = value === undefined ? '' : decodeEntities(value).trim();
        // An empty value carries no usage information and reads as a mistake in a copyable
        // snippet (`image-src` with nothing in it). Boolean flags are documented in the props
        // table instead, via MinedAttribute.booleanish.
        if (decoded === '')
            continue;
        // SVG paths, serialised JSON and long prose would swamp the snippet or break its
        // quoting; show the attribute, elide the value.
        const unusable = decoded.length > 80 || /["[\]{}]/.test(decoded);
        kept.push(`${canonical}="${unusable ? '…' : decoded}"`);
    }
    return kept.length ? ' ' + kept.join(' ') : '';
}
/**
 * Slice out the top-level `<igds-*>` subtrees, drop framework bookkeeping, and re-indent.
 * Returns a snippet an agent can copy, or undefined when nothing usable was found.
 */
export function toUsageSnippet(html, maxElements = 6) {
    if (!html)
        return undefined;
    const withoutComments = html.replace(/<!--[\s\S]*?-->/g, '');
    const withoutStyles = withoutComments.replace(/<style[\s\S]*?<\/style>/gi, '');
    const snippets = [];
    let depth = 0;
    let start = -1;
    TAG_PATTERN.lastIndex = 0;
    let match;
    while ((match = TAG_PATTERN.exec(withoutStyles)) !== null) {
        const isClosing = match[1] === '/';
        const tagName = match[2].toLowerCase();
        const selfClosing = match[4] === '/' || VOID_ELEMENTS.has(tagName);
        const isIgds = tagName.startsWith('igds-');
        if (depth === 0) {
            if (!isClosing && isIgds) {
                if (selfClosing) {
                    snippets.push(withoutStyles.slice(match.index, TAG_PATTERN.lastIndex));
                }
                else {
                    depth = 1;
                    start = match.index;
                }
            }
            continue;
        }
        // Inside a captured subtree: track nesting of the same tag family and everything else.
        if (selfClosing)
            continue;
        if (isClosing) {
            depth--;
            if (depth === 0 && start >= 0) {
                snippets.push(withoutStyles.slice(start, TAG_PATTERN.lastIndex));
                start = -1;
            }
        }
        else {
            depth++;
        }
        if (snippets.length >= maxElements)
            break;
    }
    if (!snippets.length)
        return undefined;
    const cleaned = snippets
        .slice(0, maxElements)
        .map((snippet) => snippet.replace(TAG_PATTERN, (_full, closing, tag, attrs, selfClose) => {
        const lower = tag.toLowerCase();
        if (closing)
            return `</${lower}>`;
        return `<${lower}${cleanAttributes(attrs || '')}${selfClose ? ' /' : ''}>`;
    }))
        .map((snippet) => snippet.replace(/\s+/g, ' ').replace(/>\s+</g, '><').trim())
        .filter((snippet) => snippet.length > 0);
    if (!cleaned.length)
        return undefined;
    return indent(dedupe(cleaned).join('\n'));
}
function dedupe(snippets) {
    const seen = new Set();
    const unique = [];
    for (const snippet of snippets) {
        if (seen.has(snippet))
            continue;
        seen.add(snippet);
        unique.push(snippet);
    }
    return unique;
}
/** Put each element on its own line so a multi-level snippet stays readable. */
function indent(html) {
    const lines = [];
    let level = 0;
    const parts = html.split(/(<\/?[a-zA-Z][\w-]*(?:[^>"']|"[^"]*"|'[^']*')*>)/).filter((part) => part.trim());
    for (const part of parts) {
        if (/^<\//.test(part)) {
            level = Math.max(0, level - 1);
            lines.push('  '.repeat(level) + part);
        }
        else if (/^</.test(part)) {
            const selfClosing = /\/>$/.test(part) || VOID_ELEMENTS.has(part.replace(/^<([\w-]+).*/s, '$1').toLowerCase());
            lines.push('  '.repeat(level) + part);
            if (!selfClosing)
                level++;
        }
        else {
            // Lit's `<!--?lit$...$-->` markers sit between runs of whitespace in the source; once
            // stripped, that whitespace survives as blank lines *inside* this text node. `.trim()`
            // only removes the outer edges, so collapse any remaining internal newlines too.
            const text = part.trim().replace(/\s*\n\s*/g, ' ');
            if (text)
                lines.push('  '.repeat(level) + text);
        }
    }
    // Collapse `<tag>` + text + `</tag>` back onto one line — it reads better and costs less.
    return lines
        .join('\n')
        .replace(/^(\s*)(<([\w-]+)[^>]*>)\n\s*([^<\n]+)\n\s*(<\/\3>)$/gm, '$1$2$4$5');
}
//# sourceMappingURL=light-dom.js.map