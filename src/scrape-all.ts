import { chromium } from 'playwright';
import { writeFileSync, existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { StorybookFramework, StorybookIndex, ComponentDocs, ArgType, StoryVariant } from './types.js';
import { fetchBundle, parseBundle, ParsedBundle } from './scrapers/bundle-parser.js';

const BASE_URL = 'https://igds-storybook.globalbit.dev/develop';
const DATA_DIR = join(process.cwd(), 'data');
const DATA_FILE = join(DATA_DIR, 'igds-storybook-data.json');

interface ComponentSource {
  className: string;
  tagName: string;
  properties: { name: string; type: string; attribute?: string; reflect?: boolean }[];
  states: string[];
  cssStyles: string[];
  constructorDefaults: Record<string, string>;
  isFormAssociated: boolean;
}

interface ScrapedData {
  angular: Record<string, ComponentDocs>;
  react: Record<string, ComponentDocs>;
  'core-web': Record<string, ComponentDocs>;
  indexes: Record<StorybookFramework, StorybookIndex>;
  sourceCode: Record<StorybookFramework, Record<string, ComponentSource>>;
  storyExamples: Record<StorybookFramework, Record<string, StoryVariant[]>>;
  scrapedAt: string;
}

function loadExistingData(): ScrapedData {
  if (existsSync(DATA_FILE)) {
    const data = JSON.parse(readFileSync(DATA_FILE, 'utf-8'));
    // Ensure sourceCode exists
    if (!data.sourceCode) {
      data.sourceCode = { angular: {}, react: {}, 'core-web': {} };
    }
    // Ensure storyExamples exists
    if (!data.storyExamples) {
      data.storyExamples = { angular: {}, react: {}, 'core-web': {} };
    }
    return data;
  }
  return {
    angular: {},
    react: {},
    'core-web': {},
    indexes: {} as any,
    sourceCode: { angular: {}, react: {}, 'core-web': {} },
    storyExamples: { angular: {}, react: {}, 'core-web': {} },
    scrapedAt: new Date().toISOString(),
  };
}

function ensureDataDir() {
  if (!existsSync(DATA_DIR)) {
    const { mkdirSync } = require('fs');
    mkdirSync(DATA_DIR, { recursive: true });
  }
}

async function fetchIndex(framework: StorybookFramework): Promise<StorybookIndex> {
  const url = `${BASE_URL}/${framework}/index.json`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to fetch index for ${framework}: ${response.status}`);
  return response.json() as Promise<StorybookIndex>;
}

function getComponentsFromIndex(index: StorybookIndex): Map<string, string> {
  const components = new Map<string, string>();
  for (const entry of Object.values(index.entries)) {
    if (entry.type === 'docs') {
      const name = entry.title.split('/').pop() || entry.title;
      components.set(name, entry.id);
    }
  }
  return components;
}

async function scrapeComponentDocs(
  page: any,
  framework: StorybookFramework,
  componentId: string,
  componentName: string
): Promise<ComponentDocs> {
  const url = `${BASE_URL}/${framework}/iframe.html?id=${componentId}&viewMode=docs`;
  
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await page.waitForSelector('#storybook-docs', { timeout: 10000 });
    await page.waitForTimeout(1500);
    
    // Improved argTypes extraction with proper type/description/default parsing
    const argTypes = await page.evaluate(() => {
      const types: Array<{
        name: string;
        type?: string;
        description?: string;
        defaultValue?: string;
        control?: string;
        enumValues?: string[];
      }> = [];
      
      const rows = document.querySelectorAll('.docblock-argstable-body tr');
      
      for (const row of rows) {
        const cells = row.querySelectorAll('td');
        if (cells.length < 3) continue;
        
        // Column 1: Name
        const name = cells[0]?.textContent?.trim() || '';
        if (!name || name === 'Name' || name === 'propertyName') continue;
        
        // Column 2: Description (contains type summary)
        const descCell = cells[1];
        const typeSpan = descCell?.querySelector('.css-129bphp, [class*="type"], span');
        const type = typeSpan?.textContent?.trim() || descCell?.textContent?.trim() || undefined;
        
        // Column 3: Default
        const defaultCell = cells[2];
        const defaultValue = defaultCell?.textContent?.trim() || undefined;
        
        // Column 4: Control - extract enum values and control type
        let control = 'unknown';
        let enumValues: string[] | undefined;
        
        if (cells.length >= 4) {
          const controlCell = cells[3];
          
          // Check for boolean switch
          const checkbox = controlCell?.querySelector('input[type="checkbox"]');
          if (checkbox) {
            control = 'boolean';
          }
          
          // Check for enum/radio buttons
          const radios = controlCell?.querySelectorAll('input[type="radio"]');
          if (radios && radios.length > 0) {
            control = 'select';
            enumValues = Array.from(radios).map((r: any) => r.value || r.nextElementSibling?.textContent?.trim() || '');
          }
          
          // Check for string textarea
          const textarea = controlCell?.querySelector('textarea');
          if (textarea) {
            control = 'string';
          }
          
          // Check for "Set string" button (object/complex)
          const button = controlCell?.querySelector('button');
          if (button && !checkbox && !radios?.length && !textarea) {
            control = 'object';
          }
        }
        
        types.push({
          name,
          type: type || undefined,
          description: undefined, // No descriptions in this Storybook
          defaultValue: defaultValue && defaultValue !== '-' ? defaultValue : undefined,
          control,
          enumValues,
        });
      }
      
      return types;
    });
    
    const description = await page.evaluate(() => {
      const desc = document.querySelector('.docblock-description');
      if (desc) return desc.textContent?.trim() || undefined;
      const title = document.querySelector('.sbdocs-title');
      if (title) {
        const next = title.nextElementSibling;
        if (next?.tagName === 'P') return next.textContent?.trim() || undefined;
      }
      return undefined;
    });
    
    return {
      framework, componentName, title: componentName, description, argTypes,
      stories: [], url: `${BASE_URL}/${framework}/?path=/docs/${componentId}`,
    };
  } catch (error) {
    return {
      framework, componentName, title: componentName, argTypes: [],
      stories: [], url: `${BASE_URL}/${framework}/?path=/docs/${componentId}`,
    };
  }
}

async function main() {
  console.log('Starting IGDS Storybook scraping...');
  
  ensureDataDir();
  const data = loadExistingData();
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  
  const frameworks: StorybookFramework[] = ['angular', 'react', 'core-web'];
  
  for (const framework of frameworks) {
    // Fetch index
    const index = await fetchIndex(framework);
    data.indexes[framework] = index;
    const components = getComponentsFromIndex(index);
    
    // Check if we need to scrape docs
    const existingDocsCount = Object.keys(data[framework]).length;
    if (existingDocsCount < components.size) {
      console.log(`\nProcessing ${framework} docs... (${existingDocsCount} already scraped, ${components.size} total)`);
      
      let count = 0;
      for (const [componentName, componentId] of components) {
        if (data[framework][componentName]) continue;
        
        count++;
        console.log(`  [${count}] Scraping ${componentName}...`);
        
        const docs = await scrapeComponentDocs(page, framework, componentId, componentName);
        data[framework][componentName] = docs;
        
        if (count % 5 === 0) {
          data.scrapedAt = new Date().toISOString();
          writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
        }
      }
    }
    
    // Parse bundle JS for source code (if not already done)
    if (!data.sourceCode[framework] || Object.keys(data.sourceCode[framework]).length === 0) {
      console.log(`\nParsing ${framework} bundle JS...`);
      
      try {
        const bundleCode = await fetchBundle(framework);
        console.log(`  Bundle size: ${(bundleCode.length / 1024 / 1024).toFixed(2)} MB`);
        
        const parsed = parseBundle(framework, bundleCode);
        console.log(`  Found ${parsed.components.size} components in bundle`);
        
        // Convert to serializable format
        for (const [name, source] of parsed.components) {
          data.sourceCode[framework][name] = {
            className: source.className,
            tagName: source.tagName,
            properties: source.properties,
            states: source.states,
            cssStyles: source.cssStyles,
            constructorDefaults: source.constructorDefaults,
            isFormAssociated: source.isFormAssociated,
          };
        }
        
        console.log(`  Extracted source for ${Object.keys(data.sourceCode[framework]).length} components`);
      } catch (error) {
        console.error(`  Failed to parse bundle:`, error);
      }
    } else {
      console.log(`\n${framework} bundle already parsed (${Object.keys(data.sourceCode[framework]).length} components)`);
    }
    
    // Scrape story examples (if not already done)
    const existingStories = Object.keys(data.storyExamples[framework]).length;
    const totalComponents = Object.keys(data[framework]).length;
    
    if (existingStories < totalComponents) {
      console.log(`\nScraping ${framework} story examples...`);
      
      let storyCount = 0;
      for (const [componentName, docs] of Object.entries(data[framework])) {
        // Skip if already scraped
        if (data.storyExamples[framework][componentName]) continue;
        
        // Get story IDs from index
        const index = data.indexes[framework];
        const storyEntries = Object.values(index.entries).filter(e => 
          e.type === 'story' && e.title.includes(componentName)
        );
        
        if (storyEntries.length === 0) continue;
        
        storyCount++;
        console.log(`  [${storyCount}] Scraping stories for ${componentName} (${storyEntries.length} stories)...`);
        
        const stories: StoryVariant[] = [];
        for (const entry of storyEntries) {
          const storyUrl = `${BASE_URL}/${framework}/iframe.html?id=${entry.id}&viewMode=story`;
          
          try {
            await page.goto(storyUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
            await page.waitForSelector('#storybook-root', { timeout: 8000 });
            await page.waitForTimeout(1000);
            
            // Extract rendered HTML
            const renderedHtml = await page.evaluate(() => {
              const root = document.querySelector('#storybook-root');
              return root ? root.innerHTML.substring(0, 5000) : undefined;
            });
            
            // Try to get source code
            let sourceCode: string | undefined;
            try {
              const showCodeBtn = page.locator('.docblock-code-toggle');
              if (await showCodeBtn.isVisible({ timeout: 1000 })) {
                await showCodeBtn.click();
                await page.waitForTimeout(300);
                
                sourceCode = await page.evaluate(() => {
                  const sourceBlock = document.querySelector('.docblock-source');
                  if (sourceBlock) {
                    const code = sourceBlock.querySelector('code, pre');
                    return code?.textContent?.substring(0, 3000) || sourceBlock.textContent?.substring(0, 3000);
                  }
                  return undefined;
                });
              }
            } catch {
              // Source not available
            }
            
            stories.push({
              id: entry.id,
              name: entry.name,
              url: `${BASE_URL}/${framework}/?path=/story/${entry.id}`,
              sourceCode,
              renderedHtml,
            });
          } catch (error) {
            stories.push({
              id: entry.id,
              name: entry.name,
              url: `${BASE_URL}/${framework}/?path=/story/${entry.id}`,
            });
          }
        }
        
        data.storyExamples[framework][componentName] = stories;
        
        if (storyCount % 10 === 0) {
          data.scrapedAt = new Date().toISOString();
          writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
          console.log(`    Saved progress (${Object.keys(data.storyExamples[framework]).length} components)`);
        }
      }
    } else {
      console.log(`\n${framework} stories already scraped (${existingStories} components)`);
    }
    
    // Save after each framework
    data.scrapedAt = new Date().toISOString();
    writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
    console.log(`Completed ${framework}`);
  }
  
  await browser.close();
  
  console.log('\nSummary:');
  for (const framework of frameworks) {
    const docsCount = Object.keys(data[framework]).length;
    const sourceCount = Object.keys(data.sourceCode[framework]).length;
    const storyCount = Object.keys(data.storyExamples[framework]).length;
    console.log(`  ${framework}: ${docsCount} docs, ${sourceCount} source, ${storyCount} stories`);
  }
  console.log(`Data saved to ${DATA_FILE}`);
}

main().catch(console.error);
