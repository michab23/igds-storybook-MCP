# IGDS + MCP: Evaluation

**Date:** 2026-08-18
**Question:** Will connecting to the official Storybook MCP server give IGDS-consuming developers component documentation good enough to steer coding agents to use IGDS components correctly? If not, what should we build instead?

---

## סיכום בעברית

**המסקנה: ה-MCP הרשמי של Storybook לא יכול לשרת את לקוחות IGDS היום. צריך MCP משלנו.**

ארבעה חסמים, כולם נמדדו מול ה-Storybook החי:

1. **גרסה** — IGDS רץ על Storybook 10.3.5, וה-MCP הרשמי דורש 10.5 ומעלה.
2. **פריימוורק** — ה-MCP הרשמי תומך כרגע ב-React בלבד (preview). IGDS הוא Angular / Web Components.
3. **ארכיטקטורה** — ה-MCP הרשמי מתחבר ל-dev server מקומי (`localhost:6006/mcp`). הלקוחות שלנו לא מריצים את ה-Storybook של IGDS אצלם; הם צורכים build סטטי מפורסם.
4. **Manifests** — הנתיב שהיה מאפשר צריכה מרחוק (`/manifests/components.json`) מחזיר 404, כי manifests נתמכים ב-React בלבד.

**Graphify** נבדק ונדחה בשלב זה: הוא בונה גרף ידע מתוך *repository*, ואין לנו גישה ל-repo של IGDS. גרף מעל ה-JSON שגרדנו לא פותר את הבעיה האמיתית — איכות הנתונים עצמם.

**בנוסף — ה-MCP הקיים שלנו כרגע סותר את הדרישה**: הוא מחזיר HTML מרונדר ו-CSS (רעש שהדרישה מבקשת במפורש לא להחצין), ותשובה בודדת יכולה להגיע ל-153KB (~40K טוקנים). התוכנית: להחזיר רק חוזה-רכיב לסוכן — props עם טיפוסים וערכים אפשריים, events, slots, ודוגמת קוד — בתקציב של ~1.5KB לתשובה.

---

## 1. Official Storybook MCP — verdict: **cannot serve IGDS consumers today**

### What the official server is
Per [storybook.js.org/docs/ai/mcp/overview](https://storybook.js.org/docs/ai/mcp/overview), the official MCP ships as `@storybook/addon-mcp` and is served **by the Storybook dev server** at `http://localhost:6006/mcp`. Its docs toolset (`list-all-documentation`, `get-documentation`, `get-documentation-for-story`) is backed by [**manifests**](https://storybook.js.org/docs/ai/manifests) — JSON emitted at `/manifests/components.json` and `/manifests/docs.json` containing component descriptions, import statements, prop types with JSDoc, and usage examples extracted from stories.

That design is genuinely good — and it is exactly the shape we should imitate. The problem is eligibility, not quality.

### The four blockers

| # | Blocker | Evidence |
|---|---|---|
| 1 | **Storybook version too old.** Official MCP requires **10.5+**. | `https://igds-storybook.globalbit.dev/develop/angular/project.json` → `storybook 10.3.5`, `@storybook/angular 10.3.5`, builder `webpack5` |
| 2 | **Framework unsupported.** MCP + manifests are **React-only** in preview (Angular/Vue/Web Components/Svelte "planned"). | Official overview + manifests docs |
| 3 | **Wrong topology.** The server attaches to a **local dev server**. IGDS consumers do not run IGDS's Storybook — they consume a published static build. | Install flow is `npx storybook add @storybook/addon-mcp` inside the Storybook project |
| 4 | **No manifests published.** The one route that would allow remote consumption is absent from the IGDS build. | `GET /develop/angular/manifests/components.json` → **404** |

Blockers 1 and 2 are upstream-version problems. Blockers 3 and 4 are the structural ones: even on Storybook 10.5, a *consumer* of IGDS gets nothing unless IGDS itself publishes manifests or hosts an MCP endpoint.

### Paths that would unblock the official route (not available to us now)
- **Angular manifests via community addon** — [`storybook-addon-angular-manifest`](https://storybook.js.org/addons/storybook-addon-angular-manifest) (community, requires a Compodoc `documentation.json`). Needs commit access to the IGDS Storybook repo, which we do not have.
- **Chromatic-hosted MCP** — Chromatic can publish a Storybook MCP so teammates connect without running Storybook locally. Requires the IGDS team to adopt it.

### Re-check trigger
Revisit this evaluation when **either**: IGDS upgrades to Storybook ≥ 10.5 **and** Angular manifest generation lands (official or via the community addon), **or** the IGDS team publishes a hosted MCP endpoint. At that point our server should become a thin layer that *composes* the official manifests rather than scraping.

---

## 2. Graphify — verdict: **not adopted now**

[Graphify](https://graphify.net/) turns a repository (source, docs, PDFs, diagrams) into a queryable knowledge graph via Tree-sitter + LLM extraction, and can serve it over MCP.

Why it does not fit this problem today:
- It operates on a **repository**. We have no access to the IGDS source repo — only the published static Storybook and the Zeroheight site.
- Running it over our *scraped JSON* would add a retrieval layer on top of data whose accuracy is the actual defect (see §3). Better retrieval over wrong prop types still produces wrong code.
- The agent need here is narrow and structured — "what props does `igds-dropdown` take, and what are the legal values" — which a typed component contract answers better and far cheaper than graph traversal.

**Keep on the shelf for:** cross-component and pattern questions later ("which components compose into the standard government form pattern"), once the component contracts are correct. The Zeroheight ↔ Storybook cross-reference data we already build is the seed of that graph.

---

## 3. Our existing MCP also violates the requirement

The requirement states two constraints explicitly: expose **only agent-relevant information** (no HTML presentation noise), and expose it **without overloading the context**. Measured against the current `main`:

### Presentation noise dominates the payload
| Framework | share of story bytes that is `renderedHtml` | share of source bytes that is `cssStyles` |
|---|---|---|
| angular | **86%** | **74%** |
| react | **71%** | 0% |
| core-web | **88%** | 0% |

`CachedDataLoader.load()` merges source + stories into every component doc, so a single `get-component` call returns all of it. Worst case measured: **core-web `Card` ≈ 153 KB (~40K tokens) in one response.** `Dropdown` (angular) ≈ 83 KB.

### The information agents actually need is missing or wrong
- **Story source code is empty for every story, in all three frameworks.** The scraper looks for the "Show code" toggle in `viewMode=story`, where that control does not exist — so the single most useful artifact for a coding agent (how to write the component) was never captured.
- **`argTypes` are mis-parsed.** Read by table column index, the `description` field ended up holding the *type* (`"boolean"`, `"string"`), defaults are all `"-"`, and **union/enum values are absent entirely**. An agent is told `variant: string` and has no way to know which strings are legal — precisely the hallucination the requirement wants to prevent.
- **Zeroheight content is mostly site chrome.** Every section is prefixed with ~1000 characters of navigation ("Skip to content / Getting started / Brand / Components / …"); 18 of 63 components have all four sections byte-identical; `codeExamples` is empty for all 63.
- **17 tools** means the tool list itself is a permanent context tax on every request.

### One rich source we already reach but discard
The core-web bundle embeds custom-elements-manifest JSON — `{"kind":"class","description":…,"members":[…]}` — carrying per-member **descriptions, attributes, types, defaults, and events**. The current parser extracts only name/type/attribute and throws the rest away. This is the highest-value fix available without repo access.

---

## 4. Decision

**Build our own MCP**, shaped like the official manifests but sourced from what we can reach, and hold it to the requirement's two constraints as hard budgets:

1. **Agent-only content.** The served artifact contains no `renderedHtml`, no `cssStyles`, no images, no Storybook chrome. What it does contain: import statement, tag/selector, props (name · type incl. union values · default · required · description), events, slots, usage code snippets, and design guidance (when to use / when not / a11y / RTL).
2. **Context discipline.** Five tools instead of seventeen; compact markdown instead of pretty-printed JSON; per-response budgets (`get-component` ≈ 1.5 KB vs. today's 153 KB worst case); search returns **references, not bodies**; freshness metadata moves to an MCP resource so it costs no tool-list context.

Implementation plan and verification criteria: see `README.md`.

---

## 5. Results after implementation

Measured by `npm run verify` on the artifact built from a full, real scrape of all three frameworks:

| Metric | Before | After |
|---|---|---|
| Worst `get-component` response | 153,245 chars (core-web `Card`) | **5,678 chars** (`Card`) — 27× smaller |
| `get-component` p50 / p95 | — | 2,720 / 4,818 chars |
| Served artifact size | 3.1 MB raw | 507 KB |
| Tools | 17 | 5 (3,125 chars of definitions) |
| Rendered HTML / CSS in responses | 71–88% of story bytes | **none** (enforced by the verify gate) |
| Distinct components | — | 50 (correctly merged across frameworks — see §6) |
| Components documenting legal prop values | 0 | 40 of 50 |
| Components with a usage snippet | 0 (story source was empty everywhere) | 50 of 50 |
| Components with documented events | 0 (events were never modelled) | 38 of 50 |
| Child elements attached to a parent (`igds-accordion-item` and similar) | 0 | 12 |

Two findings changed the approach during implementation and are worth recording:

1. **The captured rendered HTML was salvageable offline.** Its light DOM is essentially the authored story template, so `build:docs` mines it for the real attribute vocabulary — `variant` accepts `primary | secondary | link | alternative`, `size` accepts `small | medium | large`, and so on across 181 attributes on 67 tags. That recovered the missing enum values immediately, without waiting for a re-scrape. The HTML stays in the raw scrape and is never served.
2. **A real usage sample corrected two things the published DOM had misled me about.** From the rendered Angular markup, `igds-*` elements carry `_ngcontent-*` but no `_nghost-*`, which I read as "they are plain custom elements in Angular too". A genuine IGDS code sample showed otherwise: they are **standalone Angular components**, deep-imported per subpath (`import { IgdsAccordionItem } from '@igds/angular/accordion-item';`), and bound with **camelCase property syntax** (`[multiExpand]`). The server had been rendering kebab-case prop names for Angular, which would not bind at all. Both are fixed; the lesson is that rendered DOM is weak evidence for authoring API, and one real sample outweighs it.
3. **Storybook documents only top-level components.** 23 element tags used in stories — `igds-accordion-item`, `igds-tab`, `igds-list-item`, `igds-table-row` and others — had no documentation entry at all, though an agent cannot write the parent without them. 12 are now attached to their parent component and served under "Child elements"; the remainder had no confident parent and are listed as unattached at build time.
4. **The scrapers that needed fixing were not the ones the plan named.** `src/scrapers/docs-scraper.ts` and `src/scrapers/story-scraper.ts` were dead code that nothing imported; the live scrape path is inline in `src/scrape-all.ts`. The fixes (preview-store argTypes, docs-view story sources) went there, and the dead files were removed.

### Runtime findings from testing the scrapers against the live Storybook

Network access turned out to be available after all — the sandbox sits behind a TLS-intercepting proxy, so only certificate validation failed. Playwright with `ignoreHTTPSErrors` reaches the site, which allowed the scraper fixes to be tested for real. Four things were wrong and are now fixed:

1. **`.docblock-source` no longer exists.** Storybook 10 renders an expanded code block as `pre.prismjs`. Extraction against the old selector returned nothing even when the click succeeded.
2. **The code toggles render late.** Waiting on `#storybook-docs` returns a page with zero toggles; waiting on `.docblock-code-toggle` after `networkidle` returns 8–11 per component.
3. **`page.evaluate` breaks under tsx.** esbuild injects a `__name` helper into evaluated function bodies, which does not exist in the browser (`ReferenceError: __name is not defined`). Browser-side callbacks are now passed as strings.
4. **The Storybook argstable on IGDS pages is an unconfigured placeholder** — its rows literally read `propertyName*` / "This is a short description" / `defaultValue`. That is the true origin of the nonsense argTypes. The **real** documentation is in hand-written MDX tables headed `Property Name | Type | Required | Description`, which `extractDocumentedProps` now parses:

   > `multiexpand | boolean | No | Allows more than one AccordionItem to stay expanded at the same time.`

Verified live: React accordion yields **8 story sources and 7 documented props with real prose**; core-web and Angular button each yield **11 story sources**, including Angular templates with real bindings (`[size]`, `[disabled]`).

### Discovery: IGDS hand-writes real per-framework API docs, grouped by component

Walking the docs page's heading structure (rather than just its tables) turned up something the earlier probing missed: each docs page has one `<h2>` per exported component, each with its own `Properties` table and sometimes an `Events` table. The **React Accordion docs page documents both `Accordion` and `AccordionItem` on the same page** — which matters because a flat table scrape would have merged `AccordionItem`'s `header`/`icon`/`isOpen` into `Accordion`'s own prop list. Grouping by the preceding heading (`extractDocumentedApi` in `src/scrapers/storybook-api.ts`) keeps them apart, and the same grouping is what lets `<igds-accordion-item>` — a tag Storybook never documents on its own — get its real, hand-written prop table instead of only the inferred one mined from markup.

The three frameworks document this differently, and the server now accounts for all three:
- **React**: full hand-written tables (`Property Name | Type | Required | Description`, plus `Event | Payload`), grouped by PascalCase component name.
- **core-web**: same table shape, grouped by tag name (`igds-accordion-item`), not a display name.
- **Angular**: no hand-written tables on its docs pages — only the same unconfigured Storybook placeholder argstable every framework has. Angular's real prop names and types come from Storybook's runtime argTypes and the webpack bundle instead.

### Import statements and prop-name casing: resolved

Both closed with a real IGDS usage sample (an Angular Accordion component), not inference from rendered DOM — which is what the sample overturned:

- **Import shapes, confirmed per framework.** Angular deep-imports `Igds`-prefixed standalone components per subpath (`import { IgdsAccordionItem } from '@igds/angular/accordion-item';`); React imports plain PascalCase symbols from the package root (confirmed independently by the React docs page: *"The Accordion component from `@igds/react`"*); core-web uses a side-effect import. Package names are the IGDS monorepo's nx publish targets (`@igds/core-web`, `@igds/react`, `@igds/angular`; `@igds/tokens` and `@igds/icons` also exist but are not yet surfaced by any tool).
- **Prop casing genuinely differs per framework, and is now modelled that way.** The sample's `[multiExpand]` binding proved the server was wrong: it rendered Angular's props in kebab-case (`multi-expand`), which does not bind at all. Two independent fixes went in — the model now carries `names: Partial<Record<Framework, string>>` per prop so a documented spelling (React's own table literally spells it `multiexpand`, all lowercase) is preserved rather than derived, and the manifest reader now picks the JS/TS class property name for Angular/React (`multiExpand`) instead of the HTML-attribute spelling that only core-web should use.

---

## 6. The full re-scrape, and what real data caught

A complete scrape of all three frameworks ran with every fix above in place — 145 docs pages, their story examples, and both bundle parses, with one transient failure (a navigation race on `Radio`'s docs-table extraction, caught and skipped by the existing error handling; every other component succeeded). Rebuilding the served artifact from that real data surfaced four further defects that no amount of reasoning about the code would have caught — only real data exercising the pipeline end-to-end did:

1. **A CSS-leak regression, caught before it shipped.** Story source code had been empty everywhere until this scrape (see §3), so the code path that serves it verbatim was dead and untested. Once populated, core-web's captured source turned out to include an inline `<style>` block next to the markup — which would have gone straight into a served usage snippet, violating the "no CSS" constraint this whole project exists to satisfy. A 3-component validation run (`IGDS_SCRAPE_LIMIT=3`) caught it before the full scrape; `stripPresentationChrome()` now strips it, and `npm run verify`'s banned-substring gate now checks for `<style` explicitly so a regression here fails loudly rather than shipping quietly.
2. **React usage examples were being crowded out.** The usage-snippet budget was shared across all three frameworks in preference order (core-web, Angular, React last); a component with many core-web/Angular story variants could fill the whole budget before React was even considered. A caller asking for React usage would silently get Angular or core-web markup instead — wrong, not just suboptimal. Fixed with a two-pass build: one guaranteed snippet per framework that has stories, then remaining budget filled with variety.
3. **A corrupted upstream event, filtered out.** IGDS's own core-web manifest carries `{"name":"name","type":{"text":"CustomEvent"},"inheritedFrom":{"name":"IGDSElement"}}` on every component — a real event's name lost during their manifest generation, leaving the generic field name of whatever it inherited from. Every genuine IGDS custom event we've observed follows the `igds-*` convention, so events are now required to match that pattern, with a small denylist of generic names (`name`, `type`, `value`, `id`, `event`) as defense in depth against the same class of corruption from other sources.
4. **32% of components had a component-name mismatch across frameworks, breaking their import statements.** IGDS titles the same component differently per framework's Storybook — Angular's docs page says `DatePicker` (its bare class name), React's and core-web's say `Date Picker` (a human-readable title). Un-normalized, this produced **two separate, each-incomplete components** in the served artifact, and for components whose name contained a space, substituting the raw display name into an import template produced syntactically invalid code (`import { Date Picker } from ...`). Both are fixed: component names are now grouped by a punctuation-insensitive key before building anything, with a canonical display name chosen per group (preferring a genuine multi-word title over a bare class name), and import statements substitute a proper PascalCase identifier derived from that name, never the raw display string. Component count dropped from a nominal 66 to a correctly-deduplicated **50** as a direct result.

A fifth defect was found by inspecting real output rather than logs: **`Dropdown`'s `label`, `name` and `placeholder` props were displayed as `'string' | 'undefined'`**, as if those were legal values to pick from, rather than as the type `string`. The union-detection logic that turns IGDS's documented `Property Name | Type | Required | Description` tables into enum values could not distinguish a genuine closed vocabulary (`'primary' | 'secondary'`, quoted) from an ordinary optional-type annotation (`string | undefined`, unquoted) — TypeScript's own convention (string-literal union members are quoted, type keywords never are) is the correct signal, and the fix uses it. This also fixed a response-budget overflow: `Dynamic Icon`'s `name` prop (which icon to render) has 414 legal values once correctly parsed, all inlined into one markdown table row; the fix caps the props table to the first 20 values per prop with a "…(N more)" note, which is a durable bound regardless of how large IGDS's icon library grows.

### Remaining gaps

- **Design guidance covers 22 of 50 components**, limited by the Zeroheight ↔ Storybook name mapping in `src/scrapers/cross-reference.ts` (unaffected by this session's name-merging fix, since Zeroheight is matched separately, by category and fuzzy name).
- **6 mined tags could not be attached to a parent component** (`igds-vertical-filter`, `igds-editor-toolbar`, `igds-toolbar-item`, `igds-segment`, `igds-step-item`, `igds-horizontal-filter`) — the fuzzy tag-to-parent matching in `attachSubComponents` found no confident match. Reported at build time (`npm run build:docs`'s output), not silently dropped.
- **`Icon`/`Icons` and similar plural/singular pairs are not merged.** The name-canonicalization fix in §6 only unifies punctuation/casing differences, deliberately not pluralization — the risk of falsely merging genuinely distinct components (`Tab` and `Tabs` are different things) outweighed the benefit for the handful of cases this would affect.
- **A handful of `observed`-provenance props still show incidental example values as if they were a closed vocabulary** (e.g. an `Input.name` prop showing story-authored field identifiers like `"password"`, `"textarea"` as if they were legal values) — a pre-existing heuristic limitation in `looksLikeEnum()`, not something this session introduced or fully resolved. Lower severity: `documented`/`manifest`-provenance data already overrides it wherever a higher-trust source exists for the same prop.
