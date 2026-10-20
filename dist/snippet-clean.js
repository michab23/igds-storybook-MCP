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
/** Remove `name={...}` attributes with balanced braces (handles nested `{{ }}` objects). */
function removeBracedAttribute(code, name) {
    const opener = new RegExp(`\\s+${name}=\\{`, 'g');
    let out = '';
    let last = 0;
    let match;
    while ((match = opener.exec(code))) {
        let depth = 1;
        let i = match.index + match[0].length;
        while (i < code.length && depth > 0) {
            if (code[i] === '{')
                depth++;
            else if (code[i] === '}')
                depth--;
            i++;
        }
        if (depth !== 0)
            break; // unbalanced: leave the rest untouched
        out += code.slice(last, match.index);
        last = i;
        opener.lastIndex = i;
    }
    return out + code.slice(last);
}
/** CSS-module class names: `_button_1ysw7_1`, `_table__box_1c869_1`. */
const HASHED_CLASS = /_[A-Za-z0-9-]*?_[a-z0-9]{5}_\d+/;
function removeHashedClassNames(code) {
    return code.replace(/\s+(?:className|class)="([^"]*)"/g, (whole, value) => {
        const kept = value.split(/\s+/).filter((cls) => cls && !HASHED_CLASS.test(cls));
        if (kept.length === value.split(/\s+/).filter(Boolean).length)
            return whole;
        return kept.length ? whole.replace(value, kept.join(' ')) : '';
    });
}
function camelFromKebab(name) {
    return name.replace(/-([a-z0-9])/g, (_m, c) => c.toUpperCase());
}
/**
 * `<Icon name="chevron-down" />` uses IGDS's deprecated name lookup; the supported form is
 * `node={chevronDown}` with a named import from @igds/icons. Returns the icons it rewrote.
 */
function rewriteReactIconNames(code) {
    const icons = new Set();
    const rewritten = code.replace(/<Icon\b[^>]*?>/g, (tag) => tag.replace(/(\s)name="([a-z0-9-]+)"/, (_m, space, iconName) => {
        const identifier = camelFromKebab(iconName);
        icons.add(identifier);
        return `${space}node={${identifier}}`;
    }));
    return { code: rewritten, icons: [...icons] };
}
/**
 * Collapse runs of identical sibling elements (the same block once digits are ignored),
 * keeping the first two and replacing the rest with a comment. Blocks are found by the
 * printer's indentation: an opening line and the next line at the same indent that closes it.
 */
function collapseRepeatedSiblings(code, comment) {
    const lines = code.split('\n');
    const indentOf = (line) => line.length - line.trimStart().length;
    const blockAt = (start) => {
        const line = lines[start];
        if (!line || !/^\s*<[A-Za-z]/.test(line) || /^\s*<\//.test(line))
            return null;
        const indent = indentOf(line);
        let end = start;
        // Single-line element: `<p>x</p>` or self-closing.
        if (!/\/>\s*$/.test(line) && !/^\s*<([A-Za-z][\w.-]*)\b.*<\/\1>\s*$/.test(line)) {
            end = start + 1;
            while (end < lines.length && !(indentOf(lines[end]) === indent && /^\s*<\//.test(lines[end])))
                end++;
            if (end >= lines.length)
                return null;
        }
        const signature = lines.slice(start, end + 1).join('\n').replace(/\d+/g, '#');
        return { start, end, signature, indent };
    };
    const out = [];
    let i = 0;
    while (i < lines.length) {
        const first = blockAt(i);
        if (!first) {
            out.push(lines[i]);
            i++;
            continue;
        }
        const run = [first];
        let next = first.end + 1;
        for (;;) {
            const candidate = blockAt(next);
            if (!candidate || candidate.indent !== first.indent || candidate.signature !== first.signature)
                break;
            run.push(candidate);
            next = candidate.end + 1;
        }
        if (run.length <= 3) {
            // Nothing to collapse here: emit this line only and descend into the block's children.
            out.push(lines[i]);
            i++;
            continue;
        }
        for (const block of run.slice(0, 2))
            out.push(...lines.slice(block.start, block.end + 1));
        out.push(' '.repeat(first.indent) + comment(run.length - 2));
        i = next;
    }
    return out.join('\n');
}
/** Markup that starts an inline SVG icon fragment. */
const ICON_MARKUP = '<(?:path|g|circle|rect|polygon|ellipse)\\b';
/**
 * Replace inline icon markup with the @igds/icons export it came from, when known:
 * `icon: '<path d="M20 3…"/>'` → `icon: building`, and `icon="<path d=&quot;…"` → `icon={building}`.
 * Unknown markup (a story's own custom icon) is left as is.
 */
function replaceInlineIcons(code, lookup) {
    const icons = new Set();
    const swap = (markup, replace, whole) => {
        const name = lookup(markup);
        if (!name)
            return whole;
        icons.add(name);
        return replace(name);
    };
    let result = code.replace(new RegExp(`'(${ICON_MARKUP}[^']*)'`, 'g'), (whole, markup) => swap(markup, (n) => n, whole));
    result = result.replace(new RegExp(`(\\s[\\w-]+)="(${ICON_MARKUP}[^"]*)"`, 'g'), (whole, attr, markup) => swap(markup, (n) => `${attr}={${n}}`, whole));
    return { code: result, icons: [...icons] };
}
export function cleanSnippet(code, framework, { componentName = '', lookupIcon = () => undefined, clickEmitters = new Set() } = {}) {
    // The legacy dynamic icon loads the whole icon registry at runtime; IGDS deprecates it.
    // Only its own component page may still show it.
    if (/<igds-dynamic-icon\b/.test(code) && !/dynamic\s*icon/i.test(componentName)) {
        return { code, drop: 'uses deprecated igds-dynamic-icon' };
    }
    let result = code;
    const isJsx = framework === 'react';
    if (isJsx) {
        result = removeBracedAttribute(result, 'style');
        result = removeBracedAttribute(result, 'ref');
        // Pretty-printed function placeholders (`function B5(){}`) → a neutral handler.
        result = result.replace(/function\s*[A-Za-z0-9_$]*\s*\(\)\s*\{\s*\}/g, '() => {}');
        // Kebab-case event props are a story-authoring slip; React listens via onIgds*.
        result = result.replace(/(\s)igds-([a-z-]+)=\{/g, (_m, space, rest) => `${space}onIgds${rest.split('-').map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join('')}={`);
        result = result.replace(/<React\.Fragment(?:\s+key="[^"]*")?\s*>/g, '<>').replace(/<\/React\.Fragment>/g, '</>');
        // Native onClick on an IGDS wrapper bypasses the component's own igds-click contract.
        result = result.replace(/<([A-Z]\w*)\b[^>]*?>/g, (tag, name) => clickEmitters.has(name) ? tag.replace(/(\s)onClick=\{/, '$1onIgdsClick={') : tag);
    }
    else {
        result = result.replace(/\s+style="[^"]*"/g, '');
    }
    result = removeHashedClassNames(result);
    // An element whose attributes were all removed prints as `<div\n>`; tidy to `<div>`.
    result = result.replace(/<([A-Za-z][\w.-]*)\s*\n\s*>/g, '<$1>');
    let icons = [];
    if (isJsx) {
        let named;
        let inlined;
        ({ code: result, icons: named } = rewriteReactIconNames(result));
        ({ code: result, icons: inlined } = replaceInlineIcons(result, lookupIcon));
        icons = [...new Set([...named, ...inlined])];
    }
    result = collapseRepeatedSiblings(result, (n) => isJsx ? `{/* … ${n} more like the above */}` : `<!-- … ${n} more like the above -->`);
    if (icons.length)
        result = `// import { ${icons.sort().join(', ')} } from '@igds/icons';\n${result}`;
    return { code: result.trim() };
}
//# sourceMappingURL=snippet-clean.js.map