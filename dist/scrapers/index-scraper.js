const BASE_URL = 'https://igds-storybook.globalbit.dev/develop';
export async function fetchIndex(framework) {
    const url = `${BASE_URL}/${framework}/index.json`;
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`Failed to fetch index for ${framework}: ${response.status}`);
    }
    return response.json();
}
export function getComponentsFromIndex(index) {
    const components = new Map();
    for (const entry of Object.values(index.entries)) {
        const name = entry.title.split('/').pop() || entry.title;
        if (!components.has(name)) {
            components.set(name, []);
        }
        components.get(name).push(entry);
    }
    return components;
}
export function getDocsEntry(entries) {
    return entries.find(e => e.type === 'docs');
}
export function getStoryEntries(entries) {
    return entries.filter(e => e.type === 'story');
}
//# sourceMappingURL=index-scraper.js.map