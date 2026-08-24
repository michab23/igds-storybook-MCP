const BASE_URL = 'https://igds-storybook.globalbit.dev/develop';
export async function fetchBundle(framework) {
    if (framework === 'angular') {
        const iframeUrl = `${BASE_URL}/${framework}/iframe.html?id=example-accordion--docs&viewMode=docs`;
        const response = await fetch(iframeUrl);
        const html = await response.text();
        const mainMatch = html.match(/import '\.\/(main\.[^']+\.iframe\.bundle\.js)'/);
        if (mainMatch) {
            const bundleUrl = `${BASE_URL}/${framework}/${mainMatch[1]}`;
            console.error(`Fetching Angular bundle from: ${bundleUrl}`);
            const bundleResponse = await fetch(bundleUrl);
            if (bundleResponse.ok)
                return bundleResponse.text();
        }
        throw new Error(`Could not find Angular bundle`);
    }
    // React and Core-Web use Vite
    const iframeUrl = `${BASE_URL}/${framework}/iframe.html?id=accordion--docs&viewMode=docs`;
    const response = await fetch(iframeUrl);
    const html = await response.text();
    const scriptMatch = html.match(/src="\.\/assets\/(iframe-[^"]+\.js)"/);
    if (scriptMatch) {
        const bundleUrl = `${BASE_URL}/${framework}/assets/${scriptMatch[1]}`;
        console.error(`Fetching ${framework} bundle from: ${bundleUrl}`);
        const bundleResponse = await fetch(bundleUrl);
        if (bundleResponse.ok) {
            const entryCode = await bundleResponse.text();
            // For React, also fetch the component chunks
            if (framework === 'react') {
                return await fetchReactChunks(entryCode, `${BASE_URL}/${framework}/assets`);
            }
            return entryCode;
        }
    }
    throw new Error(`Could not find ${framework} bundle`);
}
async function fetchReactChunks(entryCode, assetsBase) {
    // Extract chunk filenames from the entry code
    const chunkPattern = /\.\/([A-Za-z][A-Za-z0-9_-]+-[A-Za-z0-9_-]+\.js)/g;
    const chunks = new Set();
    let match;
    while ((match = chunkPattern.exec(entryCode)) !== null) {
        chunks.add(match[1]);
    }
    console.error(`Found ${chunks.size} React chunks to fetch`);
    // Fetch all chunks and combine
    const chunkCodes = [entryCode];
    let fetched = 0;
    for (const chunk of chunks) {
        try {
            const chunkUrl = `${assetsBase}/${chunk}`;
            const resp = await fetch(chunkUrl);
            if (resp.ok) {
                const code = await resp.text();
                chunkCodes.push(code);
                fetched++;
                if (fetched % 10 === 0) {
                    console.error(`  Fetched ${fetched}/${chunks.size} chunks...`);
                }
            }
        }
        catch (e) {
            // Skip failed chunks
        }
    }
    console.error(`Fetched ${fetched}/${chunks.size} React chunks`);
    return chunkCodes.join('\n');
}
export function parseBundle(framework, bundleCode) {
    const components = new Map();
    // Try to extract from structured metadata first (Core-Web pattern)
    if (framework === 'core-web') {
        const metadataComponents = extractFromMetadata(bundleCode, framework);
        for (const [name, source] of metadataComponents) {
            components.set(name, source);
        }
    }
    // For React, try docgenInfo extraction first
    if (framework === 'react') {
        const docgenComponents = extractFromDocgenInfo(bundleCode);
        for (const [name, source] of docgenComponents) {
            components.set(name, source);
        }
    }
    // Also try class-based extraction (Angular pattern)
    const patterns = [
        /let (\w+)=class \1 extends (\w+)/g, // Angular pattern
        /class (\w+) extends (\w+)/g, // React/Core-Web pattern
    ];
    for (const pattern of patterns) {
        const classMatches = bundleCode.matchAll(pattern);
        for (const classMatch of classMatches) {
            const className = classMatch[1];
            const baseClass = classMatch[2];
            // Skip minified/short names that are likely internal
            if (className.length <= 2)
                continue;
            // Skip duplicates
            if (components.has(className))
                continue;
            // Extract the class body
            const classStart = classMatch.index;
            const nextClassPattern = /let \w+=class \w+ extends|class \w+ extends/g;
            nextClassPattern.lastIndex = classStart + classMatch[0].length;
            const nextClassMatch = nextClassPattern.exec(bundleCode);
            const classEnd = nextClassMatch ? nextClassMatch.index : bundleCode.length;
            const classBody = bundleCode.substring(classStart, Math.min(classEnd, classStart + 50000)); // Limit size
            const properties = extractProperties(classBody, className);
            const states = extractStates(classBody, className);
            const queries = extractQueries(classBody, className);
            const constructorDefaults = extractConstructorDefaults(classBody, className);
            const tagName = extractTagName(classBody, className);
            const isFormAssociated = classBody.includes(`${className}.formAssociated=!0`);
            components.set(className, {
                className,
                tagName: tagName || `igds-${className.replace(/([A-Z])/g, '-$1').toLowerCase().replace(/^-/, '')}`,
                baseClass,
                properties,
                states,
                queries,
                events: [],
                slots: [],
                constructorDefaults,
                isFormAssociated,
            });
        }
    }
    return { framework, components, rawBundle: bundleCode };
}
function extractFromDocgenInfo(bundleCode) {
    const components = new Map();
    // Find all __docgenInfo blocks by brace counting
    const searchStr = '.__docgenInfo={';
    let searchPos = 0;
    while (true) {
        const idx = bundleCode.indexOf(searchStr, searchPos);
        if (idx === -1)
            break;
        // Find the variable name before .__docgenInfo
        let varEnd = idx;
        while (varEnd > 0 && bundleCode[varEnd - 1] !== ';' && bundleCode[varEnd - 1] !== ',' && bundleCode[varEnd - 1] !== ' ' && bundleCode[varEnd - 1] !== '\n') {
            varEnd--;
        }
        const varName = bundleCode.substring(varEnd, idx);
        // Find the start of the object
        const objStart = idx + searchStr.length - 1; // position of {
        // Count braces to find the end
        let depth = 1;
        let pos = objStart + 1;
        while (pos < bundleCode.length && depth > 0) {
            if (bundleCode[pos] === '{')
                depth++;
            if (bundleCode[pos] === '}')
                depth--;
            pos++;
        }
        const docgenStr = bundleCode.substring(objStart, pos);
        // Extract displayName
        const displayNameMatch = docgenStr.match(/displayName:"([^"]+)"/);
        if (!displayNameMatch) {
            searchPos = idx + 1;
            continue;
        }
        const displayName = displayNameMatch[1];
        // Extract props - find props:{ and count braces
        const propsIdx = docgenStr.indexOf(',props:{');
        const properties = [];
        if (propsIdx !== -1) {
            const propsStart = propsIdx + 7; // position of {
            let propsDepth = 1;
            let propsPos = propsStart + 1;
            while (propsPos < docgenStr.length && propsDepth > 0) {
                if (docgenStr[propsPos] === '{')
                    propsDepth++;
                if (docgenStr[propsPos] === '}')
                    propsDepth--;
                propsPos++;
            }
            const propsStr = docgenStr.substring(propsStart + 1, propsPos - 1);
            // Now parse individual props
            // Each prop starts with word: at depth 1
            const propEntries = propsStr.split(/(?<=\}),\s*(?=\w+:\{)/);
            for (const entry of propEntries) {
                const propMatch = entry.match(/^(\w+):\{required:(!0|!1),tsType:\{name:"([^"]+)"/);
                if (propMatch) {
                    properties.push({
                        name: propMatch[1],
                        type: propMatch[3],
                        attribute: propMatch[1],
                    });
                }
            }
        }
        // Extract tag name
        const tagNamePattern = new RegExp(`${varName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}=[^(]*\\([^)]*tagName:(\\w+\\.\\w+)`);
        const tagMatch = bundleCode.match(tagNamePattern);
        let tagName = `igds-${displayName.toLowerCase()}`;
        if (tagMatch) {
            const tagRef = tagMatch[1];
            const tagParts = tagRef.split('.');
            if (tagParts.length === 2) {
                tagName = `igds-${tagParts[1].replace(/([A-Z])/g, '-$1').toLowerCase().replace(/^-/, '')}`;
            }
        }
        components.set(displayName, {
            className: displayName,
            tagName,
            baseClass: 'React.Component',
            properties,
            states: [],
            queries: [],
            events: [],
            slots: [],
            constructorDefaults: {},
            isFormAssociated: false,
        });
        searchPos = pos;
    }
    return components;
}
function extractFromMetadata(bundleCode, framework) {
    const components = new Map();
    // Find all component metadata objects
    const metadataPattern = /\{"kind":"class","description":"[^"]*","name":"(\w+)","members":\[/g;
    let match;
    while ((match = metadataPattern.exec(bundleCode)) !== null) {
        const className = match[1];
        // Find the complete object by counting braces
        let start = match.index;
        let depth = 0;
        let pos = start;
        while (pos < bundleCode.length) {
            if (bundleCode[pos] === '{')
                depth++;
            if (bundleCode[pos] === '}') {
                depth--;
                if (depth === 0)
                    break;
            }
            pos++;
        }
        const jsonStr = bundleCode.substring(start, pos + 1);
        try {
            const metadata = JSON.parse(jsonStr);
            // This is a custom-elements manifest: it carries the descriptions, attribute names,
            // defaults, events and slots that agents need. Keep all of it — the previous version
            // discarded everything except name/type/attribute.
            const properties = [];
            const states = [];
            if (metadata.members) {
                for (const member of metadata.members) {
                    // Only public instance fields are part of the component's API.
                    if (member.kind !== 'field')
                        continue;
                    if (member.privacy && member.privacy !== 'public')
                        continue;
                    if (member.static)
                        continue;
                    const prop = {
                        name: member.name,
                        type: member.type?.text || 'unknown',
                        attribute: member.attribute,
                        description: member.description || member.summary,
                        defaultValue: member.default,
                    };
                    // A field with neither an attribute nor documentation is internal state; one that
                    // is documented stays in the API even without an attribute.
                    if (!member.attribute && !prop.description) {
                        states.push(member.name);
                    }
                    else {
                        properties.push(prop);
                    }
                }
            }
            // Attributes declared separately from fields also describe the public API.
            for (const attribute of metadata.attributes || []) {
                if (!attribute?.name)
                    continue;
                const known = properties.some((prop) => prop.attribute === attribute.name || prop.name === attribute.name);
                if (known)
                    continue;
                properties.push({
                    name: attribute.name,
                    type: attribute.type?.text || 'string',
                    attribute: attribute.name,
                    description: attribute.description,
                    defaultValue: attribute.default,
                });
            }
            // IGDS's manifest generator sometimes loses the real event name for a field inherited
            // from the shared IGDSElement base class, leaving a generic placeholder like
            // `{"name":"name","type":{"text":"CustomEvent"},"inheritedFrom":{"name":"IGDSElement"}}`
            // on every component. Every real IGDS custom event we've seen documented follows the
            // `igds-*` convention, so use that as the signal for "this is a real event name."
            const events = (metadata.events || [])
                .filter((event) => event?.name && /^igds-/.test(event.name))
                .map((event) => ({
                name: event.name,
                description: event.description,
                type: event.type?.text,
            }));
            const slots = (metadata.slots || [])
                .filter((slot) => slot?.name !== undefined)
                .map((slot) => ({
                name: slot.name || 'default',
                description: slot.description,
            }));
            // Extract tag name from exports
            let tagName = `igds-${className.replace(/([A-Z])/g, '-$1').toLowerCase().replace(/^-/, '')}`;
            if (metadata.exports) {
                const ceDef = metadata.exports.find((e) => e.kind === 'custom-element-definition');
                if (ceDef) {
                    // Tag name is usually in the declaration module path
                    tagName = `igds-${className.replace(/([A-Z])/g, '-$1').toLowerCase().replace(/^-/, '')}`;
                }
            }
            components.set(className, {
                className,
                tagName,
                baseClass: metadata.superclass?.name || 'unknown',
                properties,
                states,
                queries: [],
                events,
                slots,
                constructorDefaults: Object.fromEntries(properties.map(p => [p.name, p.defaultValue || ''])),
                isFormAssociated: false,
            });
        }
        catch (e) {
            // Skip invalid JSON
        }
    }
    return components;
}
function extractProperties(classBody, className) {
    const properties = [];
    // Find all MZ property decorators for this class
    const mzDecorators = classBody.matchAll(/__decorate\(\[\(0,decorators\.MZ\)\(\{[^}]*\}\)\],(\w+)\.prototype,"(\w+)"/g);
    for (const match of mzDecorators) {
        const matchedClassName = match[1];
        const name = match[2];
        if (matchedClassName !== className)
            continue;
        const decoratorBody = match[0];
        let type = 'unknown';
        const typeMatch = decoratorBody.match(/type:(\w+)/);
        if (typeMatch)
            type = typeMatch[1];
        let attribute;
        const attrMatch = decoratorBody.match(/attribute:"([^"]+)"/);
        if (attrMatch)
            attribute = attrMatch[1];
        const reflect = decoratorBody.includes('reflect:!0');
        properties.push({ name, type, attribute, reflect });
    }
    return properties;
}
function extractStates(classBody, className) {
    const states = [];
    const stateMatches = classBody.matchAll(/__decorate\(\[\(0,decorators\.wk\)\(\)\]\),(\w+)\.prototype,"(\w+)"/g);
    for (const match of stateMatches) {
        if (match[1] === className) {
            states.push(match[2]);
        }
    }
    return states;
}
function extractQueries(classBody, className) {
    const queries = [];
    const queryMatches = classBody.matchAll(/__decorate\(\[\(0,decorators\.P\)\("([^"]+)"\)\]\),(\w+)\.prototype,"(\w+)"/g);
    for (const match of queryMatches) {
        if (match[2] === className) {
            queries.push({ selector: match[1], name: match[3] });
        }
    }
    return queries;
}
function extractConstructorDefaults(classBody, className) {
    const defaults = {};
    // Find constructor body
    const constructorIndex = classBody.indexOf('constructor(){');
    if (constructorIndex === -1)
        return defaults;
    // Find matching closing brace
    let depth = 1;
    let pos = constructorIndex + 'constructor(){'.length;
    while (pos < classBody.length && depth > 0) {
        if (classBody[pos] === '{')
            depth++;
        if (classBody[pos] === '}')
            depth--;
        pos++;
    }
    const constructorBody = classBody.substring(constructorIndex + 'constructor(){'.length, pos - 1);
    // Extract this.propName=value assignments
    const assignMatches = constructorBody.matchAll(/this\.(\w+)=([^,}]+)/g);
    for (const match of assignMatches) {
        const name = match[1];
        let value = match[2].trim();
        // Convert minified values
        if (value === '!1')
            value = 'false';
        if (value === '!0')
            value = 'true';
        defaults[name] = value;
    }
    return defaults;
}
function extractTagName(classBody, className) {
    // Simple string search for the pattern
    const searchStr = `${className}=`;
    const index = classBody.indexOf(searchStr);
    if (index === -1)
        return null;
    // Look for the decorators.EM pattern nearby
    const nearby = classBody.substring(index, index + 200);
    const match = nearby.match(/decorators\.EM\)\(constants\._8\.(\w+)/);
    if (match) {
        const constant = match[1];
        return `igds-${constant.replace(/([A-Z])/g, '-$1').toLowerCase().replace(/^-/, '')}`;
    }
    return null;
}
export function getComponentSource(parsed, componentName) {
    return parsed.components.get(componentName);
}
export function listComponents(parsed) {
    return Array.from(parsed.components.keys());
}
//# sourceMappingURL=bundle-parser.js.map