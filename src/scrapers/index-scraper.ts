import { StorybookFramework, StorybookIndex, StorybookEntry } from '../types.js';

const BASE_URL = 'https://igds-storybook.globalbit.dev/develop';

export async function fetchIndex(framework: StorybookFramework): Promise<StorybookIndex> {
  const url = `${BASE_URL}/${framework}/index.json`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch index for ${framework}: ${response.status}`);
  }
  return response.json() as Promise<StorybookIndex>;
}

export function getComponentsFromIndex(index: StorybookIndex): Map<string, StorybookEntry[]> {
  const components = new Map<string, StorybookEntry[]>();
  
  for (const entry of Object.values(index.entries)) {
    const name = entry.title.split('/').pop() || entry.title;
    if (!components.has(name)) {
      components.set(name, []);
    }
    components.get(name)!.push(entry);
  }
  
  return components;
}

export function getDocsEntry(entries: StorybookEntry[]): StorybookEntry | undefined {
  return entries.find(e => e.type === 'docs');
}

export function getStoryEntries(entries: StorybookEntry[]): StorybookEntry[] {
  return entries.filter(e => e.type === 'story');
}
