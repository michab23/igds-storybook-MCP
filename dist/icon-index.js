import { createHash } from 'crypto';
/** Markup as it appears in a JS string, a JSX attribute or HTML (entity-encoded) → canonical form. */
export function normalizeIconMarkup(markup) {
    return markup
        .replace(/&quot;/g, '"')
        .replace(/&#39;|&apos;/g, "'")
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&amp;/g, '&')
        .replace(/\s+/g, ' ')
        .replace(/\s*\/>/g, '/>')
        .replace(/>\s+</g, '><')
        .trim();
}
export function hashIconMarkup(markup) {
    return createHash('sha256').update(normalizeIconMarkup(markup)).digest('hex').slice(0, 20);
}
export function iconLookup(index) {
    if (!index)
        return () => undefined;
    return (markup) => index.icons[hashIconMarkup(markup)];
}
//# sourceMappingURL=icon-index.js.map