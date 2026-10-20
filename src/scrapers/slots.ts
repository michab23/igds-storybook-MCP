/**
 * Slot names per custom element, read from the compiled component templates.
 *
 * IGDS's custom-elements manifest declares no slots, so they come from the code itself.
 * In the core-web Storybook build each component lives in its own chunk, e.g.
 * `modal-Bz6kwCpo.js`, holding its Lit template (`<slot name="footer" @slotchange=${…}>`)
 * and its registration decorator (`e=i([v(k.modal)],e)`, where `k` is IGDS_TAGS). Decorators
 * run after the class body, so each `<slot>` belongs to the next registration that follows it.
 */
import { writeFileSync } from 'fs';
import { join } from 'path';

const CHUNK_REF = /["(]\.\/([A-Za-z0-9_.-]+\.js)[")]/g;
/** `e=i([v(k.modal)],e)`: class var, tag-table key. Minified names can contain `$` (`$m`). */
const ID = '[\\w$]+';
const REGISTRATION = new RegExp(`(?<![\\w$])(${ID})=${ID}\\(\\[${ID}\\(${ID}\\.(\\w+)\\)\\],\\1\\)`, 'g');
const SLOT = /<slot\b([^>]*)>/g;
/** IGDS_TAGS compiled to assignments: `t.modal="igds-modal"`. */
const TAG_ENTRY = /\.(\w+)="(igds-[a-z0-9-]+)"/g;

/** Every chunk reachable from the entry module, fetched once each. */
export async function fetchAllChunks(entryCode: string, assetsBase: string, concurrency = 8): Promise<Map<string, string>> {
  const chunks = new Map<string, string>();
  const queue = [...new Set([...entryCode.matchAll(CHUNK_REF)].map((m) => m[1]))];
  const seen = new Set(queue);

  const worker = async () => {
    for (let name = queue.shift(); name; name = queue.shift()) {
      try {
        const response = await fetch(`${assetsBase}/${name}`);
        if (!response.ok) continue;
        const code = await response.text();
        chunks.set(name, code);
        for (const match of code.matchAll(CHUNK_REF)) {
          if (!seen.has(match[1])) {
            seen.add(match[1]);
            queue.push(match[1]);
          }
        }
      } catch {
        // A missing chunk only loses that chunk's slots.
      }
    }
  };
  // Workers re-check the shared queue, so late discoveries are still fetched.
  while (queue.length) await Promise.all(Array.from({ length: concurrency }, worker));
  return chunks;
}

export function extractTagTable(codes: Iterable<string>): Record<string, string> {
  const table: Record<string, string> = {};
  for (const code of codes) for (const match of code.matchAll(TAG_ENTRY)) table[match[1]] ??= match[2];
  return table;
}

/** Slot names per tag. `default` stands for the unnamed slot; dynamic names are skipped. */
export function extractSlots(code: string, tags: Record<string, string>): Record<string, string[]> {
  const registrations = [...code.matchAll(REGISTRATION)]
    .map((m) => ({ at: m.index ?? 0, tag: tags[m[2]] }))
    .filter((r): r is { at: number; tag: string } => Boolean(r.tag));
  const result: Record<string, string[]> = {};
  for (const match of code.matchAll(SLOT)) {
    const owner = registrations.find((r) => r.at > (match.index ?? 0));
    if (!owner) continue;
    const named = match[1].match(/\bname="([^"$]+)"/);
    if (/\bname=\$\{/.test(match[1])) continue;
    const name = named ? named[1] : 'default';
    const list = (result[owner.tag] ??= []);
    if (!list.includes(name)) list.push(name);
  }
  for (const list of Object.values(result)) list.sort((a, b) => (a === 'default' ? -1 : b === 'default' ? 1 : a.localeCompare(b)));
  return result;
}

export interface SlotsFile {
  fetchedAt: string;
  slots: Record<string, string[]>;
}

export const SLOTS_FILE = join(process.cwd(), 'data', 'igds-slots.json');

export async function writeSlots(entryCode: string, assetsBase: string): Promise<SlotsFile> {
  const chunks = await fetchAllChunks(entryCode, assetsBase);
  const all = [entryCode, ...chunks.values()];
  const tags = extractTagTable(all);
  const slots: Record<string, string[]> = {};
  for (const code of all) {
    for (const [tag, names] of Object.entries(extractSlots(code, tags))) {
      slots[tag] = [...new Set([...(slots[tag] || []), ...names])];
    }
  }
  const file: SlotsFile = { fetchedAt: new Date().toISOString(), slots: Object.fromEntries(Object.entries(slots).sort()) };
  writeFileSync(SLOTS_FILE, JSON.stringify(file, null, 1) + '\n', 'utf-8');
  console.log(`  slots: ${chunks.size} chunks, ${Object.keys(tags).length} tags, ${Object.keys(slots).length} elements with slots`);
  return file;
}
