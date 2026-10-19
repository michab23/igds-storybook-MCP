import { createHash } from 'crypto';

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
export function normalizeIconMarkup(markup: string): string {
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

export function hashIconMarkup(markup: string): string {
  return createHash('sha256').update(normalizeIconMarkup(markup)).digest('hex').slice(0, 20);
}

export function iconLookup(index: IconIndex | null): (markup: string) => string | undefined {
  if (!index) return () => undefined;
  return (markup) => index.icons[hashIconMarkup(markup)];
}
