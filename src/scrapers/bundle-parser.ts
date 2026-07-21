import { StorybookFramework } from '../types.js';

const BASE_URL = 'https://igds-storybook.globalbit.dev/develop';

export interface ComponentProperty {
  name: string;
  type: string;
  attribute?: string;
  reflect?: boolean;
  defaultValue?: string;
}

export interface ComponentSource {
  className: string;
  tagName: string;
  baseClass: string;
  properties: ComponentProperty[];
  states: string[];
  queries: { selector: string; name: string }[];
  cssStyles: string[];
  constructorDefaults: Record<string, string>;
  isFormAssociated: boolean;
}

export interface ParsedBundle {
  framework: StorybookFramework;
  components: Map<string, ComponentSource>;
  rawBundle: string;
}

export async function fetchBundle(framework: StorybookFramework): Promise<string> {
  if (framework === 'angular') {
    const iframeUrl = `${BASE_URL}/${framework}/iframe.html?id=example-accordion--docs&viewMode=docs`;
    const response = await fetch(iframeUrl);
    const html = await response.text();
    
    const mainMatch = html.match(/import '\.\/(main\.[^']+\.iframe\.bundle\.js)'/);
    if (mainMatch) {
      const bundleUrl = `${BASE_URL}/${framework}/${mainMatch[1]}`;
      console.error(`Fetching Angular bundle from: ${bundleUrl}`);
      const bundleResponse = await fetch(bundleUrl);
      if (bundleResponse.ok) return bundleResponse.text();
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
    if (bundleResponse.ok) return bundleResponse.text();
  }
  
  throw new Error(`Could not find ${framework} bundle`);
}

export function parseBundle(framework: StorybookFramework, bundleCode: string): ParsedBundle {
  const components = new Map<string, ComponentSource>();
  
  // Try to extract from structured metadata first (Core-Web pattern)
  if (framework === 'core-web') {
    const metadataComponents = extractFromMetadata(bundleCode, framework);
    for (const [name, source] of metadataComponents) {
      components.set(name, source);
    }
  }
  
  // Also try class-based extraction (Angular pattern)
  const patterns = [
    /let (\w+)=class \1 extends (\w+)/g,  // Angular pattern
    /class (\w+) extends (\w+)/g,          // React/Core-Web pattern
  ];
  
  for (const pattern of patterns) {
    const classMatches = bundleCode.matchAll(pattern);
    
    for (const classMatch of classMatches) {
      const className = classMatch[1];
      const baseClass = classMatch[2];
      
      // Skip minified/short names that are likely internal
      if (className.length <= 2) continue;
      // Skip duplicates
      if (components.has(className)) continue;
      
      // Extract the class body
      const classStart = classMatch.index!;
      const nextClassPattern = /let \w+=class \w+ extends|class \w+ extends/g;
      nextClassPattern.lastIndex = classStart + classMatch[0].length;
      const nextClassMatch = nextClassPattern.exec(bundleCode);
      const classEnd = nextClassMatch ? nextClassMatch.index! : bundleCode.length;
      const classBody = bundleCode.substring(classStart, Math.min(classEnd, classStart + 50000)); // Limit size
      
      const properties = extractProperties(classBody, className);
      const states = extractStates(classBody, className);
      const queries = extractQueries(classBody, className);
      const cssStyles = extractStyles(classBody, className);
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
        cssStyles,
        constructorDefaults,
        isFormAssociated,
      });
    }
  }
  
  return { framework, components, rawBundle: bundleCode };
}

function extractFromMetadata(bundleCode: string, framework: StorybookFramework): Map<string, ComponentSource> {
  const components = new Map<string, ComponentSource>();
  
  // Find all component metadata objects
  const metadataPattern = /\{"kind":"class","description":"[^"]*","name":"(\w+)","members":\[/g;
  let match;
  
  while ((match = metadataPattern.exec(bundleCode)) !== null) {
    const className = match[1];
    
    // Find the complete object by counting braces
    let start = match.index!;
    let depth = 0;
    let pos = start;
    
    while (pos < bundleCode.length) {
      if (bundleCode[pos] === '{') depth++;
      if (bundleCode[pos] === '}') {
        depth--;
        if (depth === 0) break;
      }
      pos++;
    }
    
    const jsonStr = bundleCode.substring(start, pos + 1);
    
    try {
      const metadata = JSON.parse(jsonStr);
      
      // Extract properties from members
      const properties: ComponentProperty[] = [];
      const states: string[] = [];
      
      if (metadata.members) {
        for (const member of metadata.members) {
          if (member.kind === 'field') {
            const prop: ComponentProperty = {
              name: member.name,
              type: member.type?.text || 'unknown',
              attribute: member.attribute,
            };
            
            if (member.default) {
              prop.defaultValue = member.default;
            }
            
            // Fields without attribute are states
            if (!member.attribute) {
              states.push(member.name);
            } else {
              properties.push(prop);
            }
          }
        }
      }
      
      // Extract attributes
      const attributes: { name: string; type: string; default?: string }[] = metadata.attributes || [];
      
      // Extract events
      const events: string[] = (metadata.events || []).map((e: any) => e.name);
      
      // Extract tag name from exports
      let tagName = `igds-${className.replace(/([A-Z])/g, '-$1').toLowerCase().replace(/^-/, '')}`;
      if (metadata.exports) {
        const ceDef = metadata.exports.find((e: any) => e.kind === 'custom-element-definition');
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
        cssStyles: [],
        constructorDefaults: Object.fromEntries(properties.map(p => [p.name, p.defaultValue || ''])),
        isFormAssociated: false,
      });
    } catch (e) {
      // Skip invalid JSON
    }
  }
  
  return components;
}

function extractProperties(classBody: string, className: string): ComponentProperty[] {
  const properties: ComponentProperty[] = [];
  
  // Find all MZ property decorators for this class
  const mzDecorators = classBody.matchAll(
    /__decorate\(\[\(0,decorators\.MZ\)\(\{[^}]*\}\)\],(\w+)\.prototype,"(\w+)"/g
  );
  
  for (const match of mzDecorators) {
    const matchedClassName = match[1];
    const name = match[2];
    
    if (matchedClassName !== className) continue;
    
    const decoratorBody = match[0];
    let type = 'unknown';
    const typeMatch = decoratorBody.match(/type:(\w+)/);
    if (typeMatch) type = typeMatch[1];
    
    let attribute: string | undefined;
    const attrMatch = decoratorBody.match(/attribute:"([^"]+)"/);
    if (attrMatch) attribute = attrMatch[1];
    
    const reflect = decoratorBody.includes('reflect:!0');
    
    properties.push({ name, type, attribute, reflect });
  }
  
  return properties;
}

function extractStates(classBody: string, className: string): string[] {
  const states: string[] = [];
  
  const stateMatches = classBody.matchAll(
    /__decorate\(\[\(0,decorators\.wk\)\(\)\]\),(\w+)\.prototype,"(\w+)"/g
  );
  
  for (const match of stateMatches) {
    if (match[1] === className) {
      states.push(match[2]);
    }
  }
  
  return states;
}

function extractQueries(classBody: string, className: string): { selector: string; name: string }[] {
  const queries: { selector: string; name: string }[] = [];
  
  const queryMatches = classBody.matchAll(
    /__decorate\(\[\(0,decorators\.P\)\("([^"]+)"\)\]\),(\w+)\.prototype,"(\w+)"/g
  );
  
  for (const match of queryMatches) {
    if (match[2] === className) {
      queries.push({ selector: match[1], name: match[3] });
    }
  }
  
  return queries;
}

function extractStyles(classBody: string, className: string): string[] {
  const styles: string[] = [];
  
  // Single style: ComponentName.styles=(0,lit.iz)("...")
  const singleMatches = classBody.matchAll(
    new RegExp(`${className}\\.styles=\\(0,lit\\.iz\\]\\("([^"]*)"\\)`, 'g')
  );
  
  for (const match of singleMatches) {
    styles.push(match[1]);
  }
  
  // Also try with ) instead of ]
  const singleMatches2 = classBody.matchAll(
    new RegExp(`${className}\\.styles=\\(0,lit\\.iz\\)\\("([^"]*)"\\)`, 'g')
  );
  
  for (const match of singleMatches2) {
    styles.push(match[1]);
  }
  
  // Array styles: ComponentName.styles=[(0,lit.iz)('...'),...]
  const arrayIndex = classBody.indexOf(`${className}.styles=[`);
  if (arrayIndex !== -1) {
    let depth = 1;
    let pos = arrayIndex + `${className}.styles=[`.length;
    
    while (pos < classBody.length && depth > 0) {
      if (classBody[pos] === '[') depth++;
      if (classBody[pos] === ']') depth--;
      pos++;
    }
    
    const arrayContent = classBody.substring(arrayIndex + `${className}.styles=[`.length, pos - 1);
    
    const stringMatches = arrayContent.matchAll(/lit\.iz\]?\("([^"]*)"|lit\.iz\]?\('([^']*)'|lit\.iz\)\("([^"]*)"|lit\.iz\)\('([^']*)'/g);
    for (const match of stringMatches) {
      const css = match[1] || match[2] || match[3] || match[4];
      if (css) styles.push(css);
    }
  }
  
  return styles;
}

function extractConstructorDefaults(classBody: string, className: string): Record<string, string> {
  const defaults: Record<string, string> = {};
  
  // Find constructor body
  const constructorIndex = classBody.indexOf('constructor(){');
  if (constructorIndex === -1) return defaults;
  
  // Find matching closing brace
  let depth = 1;
  let pos = constructorIndex + 'constructor(){'.length;
  
  while (pos < classBody.length && depth > 0) {
    if (classBody[pos] === '{') depth++;
    if (classBody[pos] === '}') depth--;
    pos++;
  }
  
  const constructorBody = classBody.substring(constructorIndex + 'constructor(){'.length, pos - 1);
  
  // Extract this.propName=value assignments
  const assignMatches = constructorBody.matchAll(/this\.(\w+)=([^,}]+)/g);
  
  for (const match of assignMatches) {
    const name = match[1];
    let value = match[2].trim();
    
    // Convert minified values
    if (value === '!1') value = 'false';
    if (value === '!0') value = 'true';
    
    defaults[name] = value;
  }
  
  return defaults;
}

function extractTagName(classBody: string, className: string): string | null {
  // Simple string search for the pattern
  const searchStr = `${className}=`;
  const index = classBody.indexOf(searchStr);
  if (index === -1) return null;
  
  // Look for the decorators.EM pattern nearby
  const nearby = classBody.substring(index, index + 200);
  const match = nearby.match(/decorators\.EM\)\(constants\._8\.(\w+)/);
  if (match) {
    const constant = match[1];
    return `igds-${constant.replace(/([A-Z])/g, '-$1').toLowerCase().replace(/^-/, '')}`;
  }
  
  return null;
}

export function getComponentSource(
  parsed: ParsedBundle,
  componentName: string
): ComponentSource | undefined {
  return parsed.components.get(componentName);
}

export function listComponents(parsed: ParsedBundle): string[] {
  return Array.from(parsed.components.keys());
}
