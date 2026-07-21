import { chromium, Browser, Page } from 'playwright';
import { StorybookFramework, ComponentDocs, ArgType, StoryVariant } from '../types.js';

const BASE_URL = 'https://igds-storybook.globalbit.dev/develop';

let browser: Browser | null = null;

async function getBrowser(): Promise<Browser> {
  if (!browser) {
    browser = await chromium.launch({ headless: true });
  }
  return browser;
}

export async function closeBrowser(): Promise<void> {
  if (browser) {
    await browser.close();
    browser = null;
  }
}

export async function scrapeComponentDocs(
  framework: StorybookFramework,
  componentId: string,
  componentName: string
): Promise<ComponentDocs> {
  const b = await getBrowser();
  const page = await b.newPage();
  
  try {
    const url = `${BASE_URL}/${framework}/iframe.html?id=${componentId}&viewMode=docs`;
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
    
    // Wait for docs content to render
    await page.waitForSelector('#storybook-docs', { timeout: 15000 });
    await page.waitForTimeout(2000); // Extra time for dynamic content
    
    // Extract argTypes from the table
    const argTypes = await extractArgTypes(page);
    
    // Extract description
    const description = await extractDescription(page);
    
    // Extract story variants from sidebar
    const stories = await extractStories(page, framework, componentId);
    
    return {
      framework,
      componentName,
      title: componentName,
      description,
      argTypes,
      stories,
      url: `${BASE_URL}/${framework}/?path=/docs/${componentId}`,
    };
  } finally {
    await page.close();
  }
}

async function extractArgTypes(page: Page): Promise<ArgType[]> {
  return page.evaluate(() => {
    const argTypes: ArgType[] = [];
    
    // Storybook renders argTypes in a table
    const rows = document.querySelectorAll('.docblock-argstable tr');
    
    for (const row of rows) {
      const cells = row.querySelectorAll('td');
      if (cells.length >= 3) {
        const nameEl = cells[0];
        const descEl = cells[1];
        const defaultEl = cells[2];
        
        const name = nameEl?.textContent?.trim() || '';
        const description = descEl?.textContent?.trim() || '';
        const defaultValue = defaultEl?.textContent?.trim() || '';
        
        // Skip header-like rows
        if (name && name !== 'Name' && name !== 'propertyName') {
          argTypes.push({
            name,
            description: description || undefined,
            defaultValue: defaultValue || undefined,
          });
        }
      }
    }
    
    return argTypes;
  });
}

async function extractDescription(page: Page): Promise<string | undefined> {
  return page.evaluate(() => {
    // Look for description in various places Storybook puts it
    const descElement = document.querySelector('.docblock-description');
    if (descElement) {
      return descElement.textContent?.trim() || undefined;
    }
    
    // Try the title area
    const titleElement = document.querySelector('.sbdocs-title');
    if (titleElement) {
      const nextSibling = titleElement.nextElementSibling;
      if (nextSibling?.tagName === 'P') {
        return nextSibling.textContent?.trim() || undefined;
      }
    }
    
    return undefined;
  });
}

async function extractStories(
  page: Page,
  framework: StorybookFramework,
  componentId: string
): Promise<StoryVariant[]> {
  return page.evaluate(({ framework, componentId }) => {
    const stories: StoryVariant[] = [];
    const baseUrl = `https://igds-storybook.globalbit.dev/develop/${framework}`;
    
    // Look for story links in the docs
    const storyLinks = document.querySelectorAll('a[href*="story"]');
    const seen = new Set<string>();
    
    for (const link of storyLinks) {
      const href = link.getAttribute('href') || '';
      const match = href.match(/id=([^&]+)/);
      if (match && match[1] !== componentId && !seen.has(match[1])) {
        seen.add(match[1]);
        stories.push({
          id: match[1],
          name: link.textContent?.trim() || match[1],
          url: `${baseUrl}/?path=/story/${match[1]}`,
        });
      }
    }
    
    return stories;
  }, { framework, componentId });
}

export async function scrapeAllComponents(
  framework: StorybookFramework,
  components: Map<string, { id: string; name: string }[]>
): Promise<Map<string, ComponentDocs>> {
  const results = new Map<string, ComponentDocs>();
  
  for (const [componentName, entries] of components) {
    const docsEntry = entries.find(e => e.id.endsWith('--docs'));
    if (docsEntry) {
      try {
        const docs = await scrapeComponentDocs(framework, docsEntry.id, componentName);
        results.set(componentName, docs);
      } catch (error) {
        console.error(`Failed to scrape ${componentName} for ${framework}:`, error);
      }
    }
  }
  
  return results;
}
