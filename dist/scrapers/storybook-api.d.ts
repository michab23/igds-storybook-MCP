/**
 * Reads component metadata from Storybook's own runtime rather than from the rendered DOM.
 *
 * Scraping the docs table by column index is what produced argTypes whose "description"
 * held the string "boolean" and whose defaults were all "-", with union values lost
 * entirely. The preview store has the real thing: declared types, `options` for closed
 * vocabularies, default summaries and JSDoc descriptions.
 */
import type { Page } from 'playwright';
import { ArgType, StorybookFramework } from '../types.js';
/**
 * `'primary' | 'secondary'` is a real closed vocabulary an agent must pick from; `string |
 * undefined` is just an optional-type annotation. TypeScript's own convention is the
 * distinguishing signal: string-literal union members are quoted, primitive/utility type
 * keywords never are. Requiring every non-keyword part to be quoted (after first dropping
 * the keyword parts) tells the two apart correctly in both directions — including a mixed
 * case like `'primary' | 'secondary' | undefined` for an optional enum prop.
 */
export declare function parseLiteralUnion(typeText: string | undefined): string[] | undefined;
/**
 * Pull argTypes out of the preview store for one story. Storybook has moved this API
 * around between majors, so try the known shapes before giving up.
 */
export declare function extractArgTypesFromPreview(page: Page, storyId: string): Promise<ArgType[]>;
/**
 * Collect the "Show code" snippets from a component's docs page.
 *
 * The previous implementation looked for the code toggle in `viewMode=story`, where it does
 * not exist — which is why every story ended up with an empty `sourceCode`. The toggles
 * live on the docs page, one per canvas.
 */
export declare function extractStorySources(page: Page, baseUrl: string, framework: StorybookFramework, componentId: string): Promise<Record<string, string>>;
/**
 * IGDS hand-writes its real API documentation as MDX under one `<h2>` per exported
 * component, each with a `Properties` table (`Property Name | Type | Required |
 * Description`) and sometimes an `Events` table (`Event | Payload`). The auto-generated
 * Storybook argstable elsewhere on the page is an unconfigured placeholder
 * ("propertyName*", "This is a short description") — the source of the previous scrape's
 * nonsense argTypes — and is skipped because its headers do not match either shape.
 *
 * A docs page documents every component exported from that story file, not just the one
 * named in the URL — the Accordion page also documents AccordionItem. Grouping by the
 * preceding `<h2>` is what lets a child component's props be told apart from the parent's.
 */
export interface DocumentedComponentApi {
    component: string;
    props: ArgType[];
    events: {
        name: string;
        description?: string;
    }[];
}
export declare function extractDocumentedApi(page: Page): Promise<DocumentedComponentApi[]>;
//# sourceMappingURL=storybook-api.d.ts.map