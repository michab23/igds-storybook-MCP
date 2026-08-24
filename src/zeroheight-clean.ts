/**
 * Zeroheight pages were captured as full-page text, so every section carries the site
 * navigation, the tab strip and the sidebar component list before any real content. This
 * module reduces that to the few facts an agent can act on: what the component is for,
 * when not to use it, accessibility requirements, and RTL notes.
 *
 * Chrome is detected statistically (lines that recur across most pages) rather than from a
 * hardcoded list, so it keeps working when the site's navigation changes.
 */

import { AgentGuidance } from './agent-docs.js';
import { ZeroheightSectionName } from './types.js';

/** A line repeated on at least this share of pages is navigation, not content. */
const CHROME_FREQUENCY = 0.5;

const TAB_LABELS = new Set(['design', 'code', 'usage', 'accessibility', 'read-only']);

export interface CleanedSections {
  summary?: string;
  /** Section name -> cleaned body. Sections with identical bodies are collapsed. */
  bodies: Partial<Record<ZeroheightSectionName, string>>;
}

/**
 * Collect the lines that recur across pages. Pass every section body of every component.
 */
export function buildChromeLines(allSectionContents: string[]): Set<string> {
  const counts = new Map<string, number>();

  for (const content of allSectionContents) {
    const unique = new Set(
      content
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
    );
    for (const line of unique) {
      counts.set(line, (counts.get(line) || 0) + 1);
    }
  }

  const threshold = allSectionContents.length * CHROME_FREQUENCY;
  const chrome = new Set<string>();
  for (const [line, count] of counts) {
    if (count >= threshold) chrome.add(line);
  }

  return chrome;
}

function isChrome(line: string, chrome: Set<string>): boolean {
  return chrome.has(line) || TAB_LABELS.has(line.toLowerCase());
}

/**
 * A summary is the one-sentence description Zeroheight puts under the component title.
 * Distinguish it from a nav label by length and sentence shape.
 */
function looksLikeSummary(line: string): boolean {
  return line.length >= 40 && /\s/.test(line) && !/^[<{[]/.test(line);
}

export function cleanSection(
  content: string,
  chrome: Set<string>,
  componentName: string
): { summary?: string; body: string } {
  const lines = content
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  let index = 0;
  let summary: string | undefined;

  // Skip the leading navigation block, the component's own title, and its category.
  while (index < lines.length) {
    const line = lines[index];
    if (isChrome(line, chrome) || line.toLowerCase() === componentName.toLowerCase()) {
      index++;
      continue;
    }
    if (!summary && looksLikeSummary(line)) {
      summary = line;
      index++;
      continue;
    }
    break;
  }

  // The tab strip sits between the summary and the body.
  while (index < lines.length && isChrome(lines[index], chrome)) index++;

  const body = lines
    .slice(index)
    .filter((line) => !isChrome(line, chrome))
    .join('\n')
    .trim();

  return { summary, body };
}

export function cleanComponentSections(
  sections: Partial<Record<ZeroheightSectionName, { content: string }>>,
  chrome: Set<string>,
  componentName: string
): CleanedSections {
  const bodies: Partial<Record<ZeroheightSectionName, string>> = {};
  const seen = new Set<string>();
  let summary: string | undefined;

  for (const [name, section] of Object.entries(sections) as [
    ZeroheightSectionName,
    { content: string } | undefined
  ][]) {
    if (!section?.content) continue;

    const { summary: sectionSummary, body } = cleanSection(section.content, chrome, componentName);
    summary ||= sectionSummary;

    if (!body) continue;
    // The scraper often failed to switch tabs, leaving four copies of the same page.
    if (seen.has(body)) continue;
    seen.add(body);
    bodies[name] = body;
  }

  return { summary, bodies };
}

const WHEN_NOT_MARKERS = /^(when to avoid|avoid|do ?n[o']t|when not to use|מתי להימנע|אין להשתמש)/i;
const WHEN_TO_MARKERS = /^(when to use|use (it|this) when|מתי להשתמש)/i;
const RTL_MARKERS = /(rtl|right[- ]to[- ]left|ltr|direction|עברית|ימין לשמאל)/i;

/** Bullet-ish lines: "Contrast Ratio: ..." or "1. ..." or "- ...". */
function isBullet(line: string): boolean {
  return /^([-•*]|\d+[.)]|[A-Z][\w \-/]{2,40}[:\-–])/.test(line);
}

function takeAfterMarker(body: string, marker: RegExp, limit: number): string | undefined {
  const lines = body.split('\n');
  const start = lines.findIndex((line) => marker.test(line));
  if (start === -1) return undefined;

  const collected: string[] = [];
  for (let i = start + 1; i < lines.length && collected.length < limit; i++) {
    const line = lines[i];
    // Stop at the next section-looking heading.
    if (collected.length && /^[A-Z][\w ]{2,40}$/.test(line)) break;
    collected.push(line);
  }

  // The marker line itself may already carry the content ("Avoid using X when …").
  const head = lines[start].replace(/^[^:]*:\s*/, '');
  const text = [head.length > 30 ? head : '', ...collected].filter(Boolean).join(' ');
  return text.trim() || undefined;
}

export function extractGuidance(cleaned: CleanedSections): AgentGuidance | undefined {
  const guidance: AgentGuidance = {};
  const all = Object.values(cleaned.bodies).filter(Boolean) as string[];
  const combined = all.join('\n');
  if (!combined) return undefined;

  for (const body of all) {
    guidance.whenToUse ||= takeAfterMarker(body, WHEN_TO_MARKERS, 4);
    guidance.whenNotToUse ||= takeAfterMarker(body, WHEN_NOT_MARKERS, 4);
  }

  const accessibilityBody = cleaned.bodies.accessibility || combined;
  const a11y = accessibilityBody
    .split('\n')
    .filter((line) => isBullet(line) && line.length > 30)
    .filter((line) => /(contrast|keyboard|focus|screen reader|aria|wcag|role|tab|נגישות|מקלדת)/i.test(line))
    .slice(0, 6);
  if (a11y.length) guidance.a11y = a11y;

  const rtl = combined
    .split('\n')
    .find((line) => RTL_MARKERS.test(line) && line.length > 30 && line.length < 300);
  if (rtl) guidance.rtl = rtl;

  return Object.keys(guidance).length ? guidance : undefined;
}
