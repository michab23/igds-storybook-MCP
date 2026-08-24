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

export type Framework = 'angular' | 'react' | 'core-web';

export const FRAMEWORKS: Framework[] = ['angular', 'react', 'core-web'];

/** Where a fact came from, so consumers can weigh it. */
export type Provenance =
  | 'documented' // IGDS's own hand-written per-framework prop table
  | 'manifest'   // declared by the component itself (custom-elements manifest / docgen)
  | 'argtypes'   // Storybook argTypes
  | 'observed';  // seen in real story markup

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

// Resolved from this module, not the working directory: when the server runs via `npx`
// the cwd is the consumer's project, which has no data/ directory of ours.
const MODULE_DIR = dirname(fileURLToPath(import.meta.url));
const DATA_FILE =
  process.env.IGDS_DOCS_FILE || join(MODULE_DIR, '..', 'data', 'igds-agent-docs.json');

/**
 * Derive the conventional per-framework spelling of a kebab-case name.
 *
 * Only core-web takes kebab-case HTML attributes. React props and Angular `@Input()`
 * bindings are both camelCase — an Angular template binds `[multiExpand]`, and
 * `multi-expand` would not bind at all.
 */
export function propNameFor(name: string, framework: Framework): string {
  if (framework === 'core-web') return name;
  return name.replace(/-([a-z0-9])/g, (_match, char: string) => char.toUpperCase());
}

/**
 * The name to actually write for this prop in this framework: IGDS's own documented
 * spelling when we have one (which can be irregular, like React's literal `multiexpand`),
 * otherwise the conventional derivation.
 */
export function resolvePropName(prop: AgentProp, framework: Framework): string {
  return prop.names?.[framework] || propNameFor(prop.name, framework);
}

/**
 * The name to actually listen for in this framework: IGDS's own documented spelling for
 * it (React's synthetic `onIgdsToggle` vs. everyone else's raw `igds-toggle`), or the
 * canonical name when no framework-specific spelling was captured.
 */
export function resolveEventName(event: AgentEvent, framework: Framework): string {
  return event.names?.[framework] || event.name;
}

/** How props and events are written in each target, shown alongside the props table. */
export function bindingSyntaxFor(framework: Framework): string {
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

export function renderType(prop: AgentProp): string {
  if (prop.values?.length) {
    const shown = prop.values.slice(0, MAX_INLINE_VALUES).map((value) => `'${value}'`);
    const omitted = prop.values.length - shown.length;
    return omitted > 0 ? `${shown.join(' | ')} | …(${omitted} more)` : shown.join(' | ');
  }
  return prop.type;
}

export class AgentDocsStore {
  private docs: AgentDocs | null = null;

  isAvailable(): boolean {
    return existsSync(DATA_FILE);
  }

  load(): AgentDocs {
    if (this.docs) return this.docs;

    if (!this.isAvailable()) {
      throw new Error(
        'No agent docs found at data/igds-agent-docs.json. Run "npm run build:docs" (or "npm run scrape" first).'
      );
    }

    this.docs = JSON.parse(readFileSync(DATA_FILE, 'utf-8')) as AgentDocs;
    return this.docs;
  }

  /** Case-insensitive lookup that also accepts the tag name (`igds-button`). */
  get(name: string, framework?: Framework): AgentComponent | undefined {
    const docs = this.load();
    const wanted = name.trim().toLowerCase();

    const match =
      docs.components[name] ||
      Object.values(docs.components).find(
        (component) =>
          component.name.toLowerCase() === wanted ||
          component.tag?.toLowerCase() === wanted ||
          component.tag?.toLowerCase() === `igds-${wanted}`
      );

    if (!match) return undefined;
    if (framework && !match.frameworks.includes(framework)) return undefined;
    return match;
  }

  list(options: { framework?: Framework; category?: string } = {}): AgentComponent[] {
    const docs = this.load();

    return Object.values(docs.components)
      .filter((component) => !options.framework || component.frameworks.includes(options.framework))
      .filter(
        (component) =>
          !options.category || component.category?.toLowerCase() === options.category.toLowerCase()
      )
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  /**
   * Returns references with a short reason for the match — never component bodies. Callers
   * follow up with `get-component` for the one they want.
   */
  search(query: string, framework?: Framework): { component: AgentComponent; reason: string }[] {
    const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
    if (!terms.length) return [];

    const results: { component: AgentComponent; reason: string; score: number }[] = [];

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
        } else if (name.includes(term) || tag.includes(term)) {
          score += 50;
          reason ||= 'name';
        } else if (category.includes(term)) {
          score += 20;
          reason ||= `category: ${component.category}`;
        } else if (summary.includes(term)) {
          score += 15;
          reason ||= 'summary';
        } else if (propNames.some((prop) => prop.includes(term))) {
          score += 10;
          reason ||= `prop: ${propNames.find((prop) => prop.includes(term))}`;
        } else if (values.includes(term)) {
          score += 8;
          reason ||= `value: ${term}`;
        }
      }

      if (score > 0) results.push({ component, reason, score });
    }

    return results
      .sort((a, b) => b.score - a.score || a.component.name.localeCompare(b.component.name))
      .map(({ component, reason }) => ({ component, reason }));
  }

  categories(): string[] {
    return this.load().categories;
  }

  meta(): { scrapedAt: string; builtAt: string; components: number; notes: string[] } {
    const docs = this.load();
    return {
      scrapedAt: docs.scrapedAt,
      builtAt: docs.builtAt,
      components: Object.keys(docs.components).length,
      notes: docs.notes,
    };
  }
}
