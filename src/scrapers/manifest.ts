/**
 * The core-web Storybook bundle embeds IGDS's custom-elements manifest as one literal:
 * ``uJ=JSON.parse(`[{"kind":"javascript-module",...}]`)``. Parse it whole: scanning for
 * individual `{"kind":"class"...}` objects by counting braces breaks on any description
 * that contains `{` or `}`, which silently dropped every event and slot.
 */
import { writeFileSync } from 'fs';
import { join } from 'path';

export interface ManifestParameter {
  name: string;
  optional?: boolean;
  type?: { text?: string };
}

export interface ManifestMember {
  kind: string;
  name: string;
  privacy?: string;
  static?: boolean;
  parameters?: ManifestParameter[];
  return?: { type?: { text?: string } };
  inheritedFrom?: { name: string };
}

export interface ManifestModule {
  kind: string;
  path: string;
  declarations?: { kind: string; name: string; members?: ManifestMember[] }[];
}

export function extractManifestModules(bundleCode: string): ManifestModule[] | null {
  const opener = 'JSON.parse(`[{"kind":"javascript-module"';
  const at = bundleCode.indexOf(opener);
  if (at === -1) return null;

  // Walk the template literal to its closing backtick, honouring escapes.
  const start = at + 'JSON.parse(`'.length;
  let end = start;
  for (let escaped = false; end < bundleCode.length; end++) {
    const ch = bundleCode[end];
    if (escaped) escaped = false;
    else if (ch === '\\') escaped = true;
    else if (ch === '`') break;
  }

  // Undo template-literal escaping (\` \\ \$) to get the JSON text back.
  const json = bundleCode.slice(start, end).replace(/\\([`\\$])/g, '$1');
  try {
    return JSON.parse(json) as ManifestModule[];
  } catch {
    return null;
  }
}

export interface MethodSignature {
  name: string;
  /** e.g. `focusCellByAddress(row: number, cell: number, setFocusOnInput?: boolean)` */
  signature: string;
}

/** Reduced form committed to the repo: per class, its public instance methods. */
export interface ManifestMethods {
  fetchedAt: string;
  classes: Record<string, { path: string; methods: MethodSignature[] }>;
}

export function methodsFromManifest(modules: ManifestModule[], fetchedAt = new Date().toISOString()): ManifestMethods {
  const classes: ManifestMethods['classes'] = {};
  for (const module of modules) {
    for (const declaration of module.declarations || []) {
      if (declaration.kind !== 'class') continue;
      const methods = (declaration.members || [])
        .filter((member) => member.kind === 'method' && !member.static && (!member.privacy || member.privacy === 'public'))
        .map((member) => {
          const params = (member.parameters || [])
            .map((p) => `${p.name}${p.optional ? '?' : ''}${p.type?.text ? `: ${p.type.text}` : ''}`)
            .join(', ');
          const returns = member.return?.type?.text && member.return.type.text !== 'void' ? `: ${member.return.type.text}` : '';
          return { name: member.name, signature: `${member.name}(${params})${returns}` };
        });
      classes[declaration.name] = { path: module.path, methods };
    }
  }
  return { fetchedAt, classes };
}

export const MANIFEST_FILE = join(process.cwd(), 'data', 'igds-manifest.json');

export function writeManifestMethods(bundleCode: string): number {
  const modules = extractManifestModules(bundleCode);
  if (!modules) return 0;
  const reduced = methodsFromManifest(modules);
  writeFileSync(MANIFEST_FILE, JSON.stringify(reduced) + '\n', 'utf-8');
  return Object.keys(reduced.classes).length;
}
