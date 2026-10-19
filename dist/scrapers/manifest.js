/**
 * The core-web Storybook bundle embeds IGDS's custom-elements manifest as one literal:
 * ``uJ=JSON.parse(`[{"kind":"javascript-module",...}]`)``. Parse it whole: scanning for
 * individual `{"kind":"class"...}` objects by counting braces breaks on any description
 * that contains `{` or `}`, which silently dropped every event and slot.
 */
import { writeFileSync } from 'fs';
import { join } from 'path';
export function extractManifestModules(bundleCode) {
    const opener = 'JSON.parse(`[{"kind":"javascript-module"';
    const at = bundleCode.indexOf(opener);
    if (at === -1)
        return null;
    // Walk the template literal to its closing backtick, honouring escapes.
    const start = at + 'JSON.parse(`'.length;
    let end = start;
    for (let escaped = false; end < bundleCode.length; end++) {
        const ch = bundleCode[end];
        if (escaped)
            escaped = false;
        else if (ch === '\\')
            escaped = true;
        else if (ch === '`')
            break;
    }
    // Undo template-literal escaping (\` \\ \$) to get the JSON text back.
    const json = bundleCode.slice(start, end).replace(/\\([`\\$])/g, '$1');
    try {
        return JSON.parse(json);
    }
    catch {
        return null;
    }
}
export function methodsFromManifest(modules, fetchedAt = new Date().toISOString()) {
    const classes = {};
    for (const module of modules) {
        for (const declaration of module.declarations || []) {
            if (declaration.kind !== 'class')
                continue;
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
export function writeManifestMethods(bundleCode) {
    const modules = extractManifestModules(bundleCode);
    if (!modules)
        return 0;
    const reduced = methodsFromManifest(modules);
    writeFileSync(MANIFEST_FILE, JSON.stringify(reduced) + '\n', 'utf-8');
    return Object.keys(reduced.classes).length;
}
//# sourceMappingURL=manifest.js.map