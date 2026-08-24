/**
 * Reads component metadata from Storybook's own runtime rather than from the rendered DOM.
 *
 * Scraping the docs table by column index is what produced argTypes whose "description"
 * held the string "boolean" and whose defaults were all "-", with union values lost
 * entirely. The preview store has the real thing: declared types, `options` for closed
 * vocabularies, default summaries and JSDoc descriptions.
 */
const TYPE_KEYWORDS = new Set([
    'string', 'number', 'boolean', 'object', 'array', 'function',
    'undefined', 'null', 'void', 'any', 'unknown', 'never',
]);
/**
 * `'primary' | 'secondary'` is a real closed vocabulary an agent must pick from; `string |
 * undefined` is just an optional-type annotation. TypeScript's own convention is the
 * distinguishing signal: string-literal union members are quoted, primitive/utility type
 * keywords never are. Requiring every non-keyword part to be quoted (after first dropping
 * the keyword parts) tells the two apart correctly in both directions — including a mixed
 * case like `'primary' | 'secondary' | undefined` for an optional enum prop.
 */
export function parseLiteralUnion(typeText) {
    if (!typeText?.includes('|'))
        return undefined;
    const parts = typeText.split('|').map((part) => part.trim());
    const literalParts = parts.filter((part) => !TYPE_KEYWORDS.has(part.replace(/^['"]|['"]$/g, '').toLowerCase()));
    if (literalParts.length < 1)
        return undefined;
    if (!literalParts.every((part) => /^(['"]).*\1$/.test(part)))
        return undefined;
    return literalParts.map((part) => part.slice(1, -1));
}
/**
 * Pull argTypes out of the preview store for one story. Storybook has moved this API
 * around between majors, so try the known shapes before giving up.
 */
export async function extractArgTypesFromPreview(page, storyId) {
    const raw = await page.evaluate(async (id) => {
        const preview = window.__STORYBOOK_PREVIEW__;
        if (!preview)
            return null;
        const store = preview.storyStore || preview.storyStoreValue;
        if (!store)
            return null;
        try {
            let story;
            if (typeof store.loadStory === 'function') {
                story = await store.loadStory({ storyId: id });
            }
            else if (typeof store.fromId === 'function') {
                story = await store.fromId(id);
            }
            if (!story?.argTypes)
                return null;
            // Structured-clone safety: keep only the fields we consume.
            return Object.entries(story.argTypes).map(([name, value]) => ({
                name: value?.name || name,
                typeName: value?.type?.name,
                typeSummary: value?.table?.type?.summary,
                required: Boolean(value?.type?.required),
                description: typeof value?.description === 'string' ? value.description : undefined,
                defaultValue: value?.table?.defaultValue?.summary !== undefined
                    ? String(value.table.defaultValue.summary)
                    : undefined,
                options: Array.isArray(value?.options) ? value.options.map(String) : undefined,
                controlType: value?.control?.type,
            }));
        }
        catch {
            return null;
        }
    }, storyId);
    if (!raw)
        return [];
    return raw.map((entry) => normalizeArgType(entry));
}
/**
 * A union declared as `'primary' | 'secondary'` in the type summary is the same fact as
 * `options: ['primary','secondary']`; normalise both into `options`.
 */
function normalizeArgType(entry) {
    const options = entry.options?.length ? entry.options : parseLiteralUnion(entry.typeSummary);
    const type = entry.typeName || entry.typeSummary || entry.controlType;
    return {
        name: entry.name,
        type: type && type !== 'other' ? type : undefined,
        description: entry.description || undefined,
        defaultValue: entry.defaultValue && entry.defaultValue !== '-' ? entry.defaultValue : undefined,
        required: entry.required || undefined,
        control: entry.controlType,
        options,
    };
}
/**
 * Collect the "Show code" snippets from a component's docs page.
 *
 * The previous implementation looked for the code toggle in `viewMode=story`, where it does
 * not exist — which is why every story ended up with an empty `sourceCode`. The toggles
 * live on the docs page, one per canvas.
 */
export async function extractStorySources(page, baseUrl, framework, componentId) {
    const url = `${baseUrl}/${framework}/iframe.html?id=${componentId}&viewMode=docs`;
    try {
        await page.goto(url, { waitUntil: 'networkidle', timeout: 40000 });
        // The code toggles are rendered late; waiting for #storybook-docs alone returns a
        // page with no toggles on it yet.
        await page.waitForSelector('.docblock-code-toggle', { timeout: 15000 });
    }
    catch {
        return {};
    }
    // Expand every collapsed code block; Storybook renders the source lazily.
    try {
        const toggles = page.locator('.docblock-code-toggle');
        const count = await toggles.count();
        for (let i = 0; i < count; i++) {
            try {
                await toggles.nth(i).click({ timeout: 2000 });
            }
            catch {
                // A toggle that will not open is not worth failing the component over.
            }
        }
        if (count)
            await page.waitForTimeout(2000);
    }
    catch {
        // No toggles on this page.
    }
    // Passed as a string: this file is run through tsx/esbuild, which injects a `__name`
    // helper into function bodies that does not exist in the browser context.
    return page.evaluate(`(() => {
    const sources = {};

    // Each canvas is preceded by its story heading; walk the docs tree in order so a
    // snippet can be paired with the story it belongs to.
    const nodes = document.querySelectorAll('#storybook-docs h3, #storybook-docs pre.prismjs');

    let currentStory = 'Default';
    for (const node of nodes) {
      if (node.tagName === 'H3') {
        currentStory = (node.textContent || '').trim() || currentStory;
        continue;
      }
      const code = (node.textContent || '').trim();
      if (code && !sources[currentStory]) sources[currentStory] = code.slice(0, 3000);
    }

    return sources;
  })()`);
}
export async function extractDocumentedApi(page) {
    const groups = (await page.evaluate(`(() => {
    const headerMatches = (row, wanted) => {
      const cells = Array.from(row.querySelectorAll('th')).map((c) => (c.textContent || '').trim().toLowerCase());
      return wanted.every((w, i) => cells[i] === w);
    };

    const nodes = document.querySelectorAll('#storybook-docs h2, #storybook-docs h3, #storybook-docs table');
    const out = [];
    let current = null;
    let section = null;

    for (const node of nodes) {
      if (node.tagName === 'H2') {
        current = { component: (node.textContent || '').trim(), properties: [], events: [] };
        out.push(current);
        section = null;
        continue;
      }
      if (node.tagName === 'H3') {
        section = (node.textContent || '').trim().toLowerCase();
        continue;
      }
      if (node.tagName !== 'TABLE' || !current) continue;

      const headerRow = node.querySelector('tr');
      if (!headerRow) continue;

      if (section === 'properties' && headerMatches(headerRow, ['property name', 'type', 'required', 'description'])) {
        for (const tr of Array.from(node.querySelectorAll('tr')).slice(1)) {
          const cells = Array.from(tr.querySelectorAll('td')).map((c) => (c.textContent || '').trim());
          if (cells.length < 4) continue;
          current.properties.push({ name: cells[0], type: cells[1], required: cells[2], description: cells[3] });
        }
      } else if (section === 'events' && headerMatches(headerRow, ['event', 'payload'])) {
        for (const tr of Array.from(node.querySelectorAll('tr')).slice(1)) {
          const cells = Array.from(tr.querySelectorAll('td')).map((c) => (c.textContent || '').trim());
          if (cells.length < 2) continue;
          current.events.push({ name: cells[0], payload: cells[1] });
        }
      }
    }

    return out.filter((g) => g.properties.length || g.events.length);
  })()`));
    return groups.map((group) => ({
        component: group.component,
        props: group.properties
            .filter((row) => row.name && !/^property name$/i.test(row.name))
            .map((row) => {
            const name = row.name.replace(/\*$/, '').trim();
            const union = parseLiteralUnion(row.type);
            return {
                name,
                type: row.type || undefined,
                description: row.description || undefined,
                required: /^(yes|true|required)$/i.test(row.required) || row.name.endsWith('*') || undefined,
                options: union && union.length > 1 ? union : undefined,
            };
        }),
        events: group.events
            .filter((row) => row.name)
            .map((row) => ({
            name: row.name,
            description: row.payload && row.payload !== '-' ? `payload: ${row.payload}` : undefined,
        })),
    }));
}
//# sourceMappingURL=storybook-api.js.map