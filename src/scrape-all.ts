import { chromium } from 'playwright';
import { writeFileSync, existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { StorybookFramework, StorybookIndex, ComponentDocs, ArgType, StoryVariant, ZeroheightData } from './types.js';
import { fetchBundle, parseBundle, ParsedBundle } from './scrapers/bundle-parser.js';
import { scrapeAllZeroheight } from './scrapers/zeroheight-scraper.js';
import { mapCrossReferences } from './scrapers/cross-reference.js';
import { extractArgTypesFromPreview, extractStorySources, extractDocumentedApi, DocumentedComponentApi } from './scrapers/storybook-api.js';

const BASE_URL = 'https://igds-storybook.globalbit.dev/develop';
const DATA_DIR = join(process.cwd(), 'data');
const DATA_FILE = join(DATA_DIR, 'igds-storybook-data.json');
const ZEROHEIGHT_DATA_FILE = join(DATA_DIR, 'zeroheight-data.json');

interface ComponentSource {
  className: string;
  tagName: string;
  properties: {
    name: string;
    type: string;
    attribute?: string;
    reflect?: boolean;
    defaultValue?: string;
    description?: string;
  }[];
  states: string[];
  events?: { name: string; description?: string; type?: string }[];
  slots?: { name: string; description?: string }[];
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
  /** IGDS's own hand-written per-framework API tables, keyed by the docs page they came
   *  from (the top-level component name used to fetch that page). */
  documentedApi: Record<StorybookFramework, Record<string, DocumentedComponentApi[]>>;
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
    // Ensure documentedApi exists
    if (!data.documentedApi) {
      data.documentedApi = { angular: {}, react: {}, 'core-web': {} };
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
    documentedApi: { angular: {}, react: {}, 'core-web': {} },
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

  // For validating the pipeline end-to-end without committing to a full multi-hour run.
  const limit = process.env.IGDS_SCRAPE_LIMIT ? Number(process.env.IGDS_SCRAPE_LIMIT) : undefined;
  if (limit && limit > 0 && limit < components.size) {
    return new Map([...components.entries()].slice(0, limit));
  }

  return components;
}

async function scrapeComponentDocs(
  page: any,
  framework: StorybookFramework,
  componentId: string,
  componentName: string,
  storyId?: string
): Promise<ComponentDocs> {
  const url = `${BASE_URL}/${framework}/iframe.html?id=${componentId}&viewMode=docs`;
  
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await page.waitForSelector('#storybook-docs', { timeout: 10000 });
    await page.waitForTimeout(1500);
    
    // Storybook's own runtime is authoritative: it has declared types, union `options`,
    // real defaults and JSDoc descriptions. Fall back to reading the docs table only if
    // the preview store is unavailable.
    if (storyId) {
      const fromPreview = await extractArgTypesFromPreview(page, storyId);
      if (fromPreview.length) {
        const description = await extractDescription(page);
        return {
          framework,
          componentName,
          title: componentName,
          description,
          argTypes: fromPreview,
          stories: [],
          url: `${BASE_URL}/${framework}/?path=/docs/${componentId}`,
        };
      }
    }

    const argTypes = await page.evaluate(() => {
      const types: Array<{
        name: string;
        type?: string;
        description?: string;
        defaultValue?: string;
        control?: string;
        options?: string[];
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
          description: undefined, // The docs table carries no prose descriptions.
          defaultValue: defaultValue && defaultValue !== '-' ? defaultValue : undefined,
          control,
          options: enumValues,
        });
      }
      
      return types;
    });
    
    const description = await extractDescription(page);
    
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

async function extractDescription(page: any): Promise<string | undefined> {
  return page.evaluate(() => {
    const desc = document.querySelector('.docblock-description');
    if (desc) return desc.textContent?.trim() || undefined;
    const title = document.querySelector('.sbdocs-title');
    if (title) {
      const next = title.nextElementSibling;
      if (next?.tagName === 'P') return next.textContent?.trim() || undefined;
    }
    return undefined;
  });
}

async function main() {
  console.log('Starting IGDS Storybook scraping...');
  
  ensureDataDir();
  const data = loadExistingData();
  const browser = await chromium.launch({ headless: true });
  // Opt-in only: disabling TLS verification is a real security regression on an untrusted
  // network. It exists for corporate TLS-intercepting proxies where the site's real
  // certificate is unavailable to configure via NODE_EXTRA_CA_CERTS (the correct fix).
  const context = await browser.newContext({ ignoreHTTPSErrors: process.env.IGDS_SCRAPE_INSECURE_TLS === '1' });
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
        
        // The preview store loads *stories*, not docs entries, so hand it the component's
        // first story id.
        const firstStory = Object.values(index.entries).find(
          (entry) => entry.type === 'story' && entry.title.split('/').pop() === componentName
        );
        const docs = await scrapeComponentDocs(
          page,
          framework,
          componentId,
          componentName,
          firstStory?.id
        );
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
            events: source.events,
            slots: source.slots,
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
        
        // One docs-page visit yields the "Show code" snippet for every story of the
        // component. The old per-story lookup in viewMode=story always came back empty,
        // because that view has no code toggle.
        const docsEntry = Object.values(index.entries).find(
          (entry) => entry.type === 'docs' && entry.title.split('/').pop() === componentName
        );
        const sourcesByStory = docsEntry
          ? await extractStorySources(page as any, BASE_URL, framework, docsEntry.id)
          : {};

        // Same already-loaded docs page: IGDS's hand-written Properties/Events tables
        // (when present — currently React and core-web; Angular's docs pages don't have
        // them) are the highest-trust source of prop names, types and required flags.
        if (docsEntry && !data.documentedApi[framework][componentName]) {
          try {
            const groups = await extractDocumentedApi(page as any);
            if (groups.length) data.documentedApi[framework][componentName] = groups;
          } catch (error) {
            console.error(`  Failed to extract documented API for ${componentName}:`, error);
          }
        }

        const stories: StoryVariant[] = [];
        for (const entry of storyEntries) {
          const storyUrl = `${BASE_URL}/${framework}/iframe.html?id=${entry.id}&viewMode=story`;
          
          try {
            await page.goto(storyUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
            await page.waitForSelector('#storybook-root', { timeout: 8000 });
            await page.waitForTimeout(1000);
            
            // Kept in the raw scrape only: build-agent-docs mines it for the real attribute
            // vocabulary (which values `variant` actually accepts) and distils usage
            // snippets from it. It is never served to an agent.
            const renderedHtml = await page.evaluate(() => {
              const root = document.querySelector('#storybook-root');
              return root ? root.innerHTML.substring(0, 5000) : undefined;
            });
            
            const sourceCode = sourcesByStory[entry.name];
            
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
  
  // Phase 4: Zeroheight Scraping
  console.log('\n=== Phase 4: Zeroheight Scraping ===');
  
  let zeroheightData: ZeroheightData;
  if (existsSync(ZEROHEIGHT_DATA_FILE)) {
    console.log('Loading existing Zeroheight data...');
    zeroheightData = JSON.parse(readFileSync(ZEROHEIGHT_DATA_FILE, 'utf-8'));
    console.log(`  ${Object.keys(zeroheightData.components).length} components, ${Object.keys(zeroheightData.pages).length} pages`);
  } else {
    console.log('Scraping Zeroheight...');
    zeroheightData = await scrapeAllZeroheight();
    zeroheightData = mapCrossReferences(zeroheightData);
    
    writeFileSync(ZEROHEIGHT_DATA_FILE, JSON.stringify(zeroheightData, null, 2));
    console.log(`  Scraped ${Object.keys(zeroheightData.components).length} components`);
    console.log(`  Scraped ${Object.keys(zeroheightData.pages).length} pages`);
    console.log(`  Found ${zeroheightData.categories.length} categories`);
  }
  
  console.log('\nAll scraping completed!');
}

main().catch(console.error);
